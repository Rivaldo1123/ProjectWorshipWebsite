import assert from 'node:assert/strict'
import test from 'node:test'
import { handleReporting } from '../worker/reporting.js'

const origin = 'https://project-worship.valdoenterprise.chatgpt.site'
const base = { category: 'website-bug', title: 'Viewer edge cannot be reached', version: 'website only', environment: 'Windows 11, Firefox', steps: 'Open the screenshot viewer and choose actual size.', expected: 'Every image edge can be reached.', actual: 'The left edge is clipped.', context: '', publicAcknowledgement: true }

class FakeDB {
  constructor() { this.idempotency = []; this.rates = new Map(); this.leases = new Map(); this.circuit = { failure_count: 0, open_until: 0, updated_at: 0 } }
  prepare(sql) { return new FakeStatement(this, sql) }
  async batch(statements) { return Promise.all(statements.map((statement) => statement.run())) }
}

class FakeStatement {
  constructor(db, sql) { this.db = db; this.sql = sql.replace(/\s+/g, ' ').trim(); this.values = [] }
  bind(...values) { this.values = values; return this }
  async first() {
    const [a, b] = this.values
    if (this.sql.startsWith('SELECT * FROM report_idempotency')) return this.db.idempotency.find((row) => row.idempotency_key === a || row.payload_hash === b) || null
    if (this.sql.startsWith('INSERT INTO report_rate_limits')) {
      const current = this.db.rates.get(a)
      const count = !current || current.window_end <= this.values[2] ? 1 : current.request_count + 1
      const row = { request_count: count, window_end: !current || current.window_end <= this.values[2] ? b : current.window_end }
      this.db.rates.set(a, row); return row
    }
    if (this.sql.startsWith('SELECT failure_count')) return this.db.circuit
    throw new Error(`Unsupported first: ${this.sql}`)
  }
  async run() {
    const v = this.values
    if (this.sql.startsWith('INSERT OR IGNORE INTO report_idempotency')) {
      if (this.db.idempotency.some((row) => row.idempotency_key === v[0] || row.payload_hash === v[1])) return { meta: { changes: 0 } }
      this.db.idempotency.push({ idempotency_key: v[0], payload_hash: v[1], status: 'pending', correlation_id: v[2], created_at: v[3], updated_at: v[4], expires_at: v[5] }); return { meta: { changes: 1 } }
    }
    if (this.sql.startsWith("UPDATE report_idempotency SET status = 'pending'")) { const row = this.db.idempotency.find((item) => item.idempotency_key === v[1] && item.status === 'failed'); if (row) row.status = 'pending'; return { meta: { changes: row ? 1 : 0 } } }
    if (this.sql.startsWith("UPDATE report_idempotency SET status = 'failed'")) { const row = this.db.idempotency.find((item) => item.payload_hash === v[1]); if (row) row.status = 'failed'; return { meta: { changes: row ? 1 : 0 } } }
    if (this.sql.startsWith("UPDATE report_idempotency SET status = 'created'")) { const row = this.db.idempotency.find((item) => item.payload_hash === v[3]); Object.assign(row, { status: 'created', issue_number: v[0], issue_url: v[1], updated_at: v[2] }); return { meta: { changes: 1 } } }
    if (this.sql.startsWith('UPDATE report_idempotency SET status = ?')) { const row = this.db.idempotency.find((item) => item.payload_hash === v[2]); if (row) { row.status = v[0]; row.updated_at = v[1] } return { meta: { changes: row ? 1 : 0 } } }
    if (this.sql.startsWith('DELETE FROM report_submission_leases WHERE expires_at')) { for (const [slot, row] of this.db.leases) if (row.expires_at <= v[0]) this.db.leases.delete(slot); return { meta: { changes: 0 } } }
    if (this.sql.startsWith('INSERT OR IGNORE INTO report_submission_leases')) { if (this.db.leases.has(v[0])) return { meta: { changes: 0 } }; this.db.leases.set(v[0], { lease_id: v[1], expires_at: v[2] }); return { meta: { changes: 1 } } }
    if (this.sql.startsWith('DELETE FROM report_submission_leases WHERE slot')) { const row = this.db.leases.get(v[0]); if (row?.lease_id === v[1]) this.db.leases.delete(v[0]); return { meta: { changes: 1 } } }
    if (this.sql.startsWith('INSERT INTO report_circuit_state') && this.sql.includes('failure_count = 0')) { this.db.circuit = { failure_count: 0, open_until: 0, updated_at: v[0] }; return { meta: { changes: 1 } } }
    if (this.sql.startsWith('INSERT INTO report_circuit_state')) { const next = this.db.circuit.updated_at < v[1] ? 1 : this.db.circuit.failure_count + 1; this.db.circuit = { failure_count: next, open_until: next >= 3 ? v[3] : this.db.circuit.open_until, updated_at: v[4] }; return { meta: { changes: 1 } } }
    if (this.sql.startsWith('DELETE FROM report_idempotency')) { this.db.idempotency = this.db.idempotency.filter((row) => row.expires_at > v[0]); return { meta: { changes: 0 } } }
    if (this.sql.startsWith('DELETE FROM report_rate_limits')) { for (const [key, row] of this.db.rates) if (row.window_end <= v[0]) this.db.rates.delete(key); return { meta: { changes: 0 } } }
    throw new Error(`Unsupported run: ${this.sql}`)
  }
}

async function privateKeyPem() {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
  const bytes = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey))
  return `-----BEGIN PRIVATE KEY-----\n${Buffer.from(bytes).toString('base64').match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----`
}

let keyPromise
async function environment(db = new FakeDB()) {
  keyPromise ||= privateKeyPem()
  return { DB: db, REPORTING_ENABLED: 'true', GITHUB_APP_ID: '123', GITHUB_INSTALLATION_ID: '456', GITHUB_APP_PRIVATE_KEY: await keyPromise, REPORTING_RATE_LIMIT_SECRET: 'rate-secret-'.repeat(4) }
}
function reportRequest(payload = base, key = crypto.randomUUID(), headers = {}) {
  return new Request(`${origin}/api/report`, { method: 'POST', headers: { origin, 'content-type': 'application/json', 'idempotency-key': key, 'cf-connecting-ip': '203.0.113.45', ...headers }, body: JSON.stringify(payload) })
}

test('creates one issue, returns the confirmed reference, and replays idempotently', { concurrency: false }, async () => {
  const previousFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options })
    if (String(url).includes('/access_tokens')) return Response.json({ token: 'installation-token' })
    return Response.json({ number: 42, html_url: 'https://github.com/Rivaldo1123/ProjectWorshipWebsite/issues/42' }, { status: 201 })
  }
  try {
    const db = new FakeDB(); const env = await environment(db); const key = crypto.randomUUID()
    const first = await handleReporting(reportRequest({ ...base, context: '@admins ![remote](https://attacker.example/x.png)' }, key), env)
    assert.equal(first.status, 201); assert.equal((await first.json()).issueNumber, 42)
    const replay = await handleReporting(reportRequest({ ...base, context: '@admins ![remote](https://attacker.example/x.png)' }, key), env)
    assert.equal(replay.status, 200); assert.equal((await replay.json()).issueNumber, 42)
    assert.equal(calls.filter((call) => call.url.endsWith('/issues')).length, 1)
    const issuePayload = JSON.parse(calls.find((call) => call.url.endsWith('/issues')).options.body)
    assert.ok(!issuePayload.body.includes('@admins'))
    assert.ok(!issuePayload.body.includes('https://attacker.example'))
    assert.equal(Object.keys(issuePayload).sort().join(','), 'body,title')
  } finally { globalThis.fetch = previousFetch }
})

test('rejects idempotency-key reuse with changed content before GitHub', { concurrency: false }, async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = async (url) => String(url).includes('/access_tokens') ? Response.json({ token: 'token' }) : Response.json({ number: 3, html_url: 'https://github.com/Rivaldo1123/ProjectWorshipWebsite/issues/3' }, { status: 201 })
  try {
    const env = await environment(); const key = crypto.randomUUID()
    assert.equal((await handleReporting(reportRequest(base, key), env)).status, 201)
    const conflict = await handleReporting(reportRequest({ ...base, title: 'A different title for this retry' }, key), env)
    assert.equal(conflict.status, 409); assert.equal((await conflict.json()).status, 'idempotency-conflict')
  } finally { globalThis.fetch = previousFetch }
})

test('records an ambiguous upstream timeout and never retries it automatically', { concurrency: false }, async () => {
  const previousFetch = globalThis.fetch
  let issueCalls = 0
  globalThis.fetch = async (url) => {
    if (String(url).includes('/access_tokens')) return Response.json({ token: 'token' })
    issueCalls += 1
    throw new DOMException('Timed out', 'AbortError')
  }
  try {
    const env = await environment(); const key = crypto.randomUUID()
    const first = await handleReporting(reportRequest(base, key), env)
    assert.equal(first.status, 504); assert.equal((await first.json()).status, 'ambiguous')
    const retry = await handleReporting(reportRequest(base, key), env)
    assert.equal(retry.status, 409); assert.equal((await retry.json()).status, 'ambiguous')
    assert.equal(issueCalls, 1)
  } finally { globalThis.fetch = previousFetch }
})

test('enforces a durable per-source limit shared by requests using one database', { concurrency: false }, async () => {
  const previousFetch = globalThis.fetch
  let number = 10
  globalThis.fetch = async (url) => String(url).includes('/access_tokens') ? Response.json({ token: 'token' }) : Response.json({ number: ++number, html_url: `https://github.com/Rivaldo1123/ProjectWorshipWebsite/issues/${number}` }, { status: 201 })
  try {
    const env = await environment()
    for (let index = 0; index < 3; index += 1) assert.equal((await handleReporting(reportRequest({ ...base, title: `Unique valid report title number ${index}` }), env)).status, 201)
    const limited = await handleReporting(reportRequest({ ...base, title: 'Unique valid report title number four' }), env)
    assert.equal(limited.status, 429); assert.equal((await limited.json()).status, 'rate-limited')
  } finally { globalThis.fetch = previousFetch }
})

test('maps GitHub rejection to a bounded error and opens the circuit after repeated failures', { concurrency: false }, async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = async (url) => String(url).includes('/access_tokens') ? Response.json({ token: 'token' }) : Response.json({ message: 'internal detail that must not escape' }, { status: 500 })
  try {
    const env = await environment()
    for (let index = 0; index < 3; index += 1) {
      const response = await handleReporting(reportRequest({ ...base, title: `Upstream failure report number ${index}` }, crypto.randomUUID(), { 'cf-connecting-ip': `203.0.${index}.1` }), env)
      assert.equal(response.status, 503)
      assert.ok(!(await response.text()).includes('internal detail'))
    }
    const open = await handleReporting(reportRequest({ ...base, title: 'Circuit breaker verification report' }, crypto.randomUUID(), { 'cf-connecting-ip': '198.51.100.20' }), env)
    assert.equal(open.status, 503); assert.match((await open.text()), /temporarily paused/)
  } finally { globalThis.fetch = previousFetch }
})
