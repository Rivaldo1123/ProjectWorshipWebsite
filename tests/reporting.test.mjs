import assert from 'node:assert/strict'
import test from 'node:test'
import { __test, handleReporting } from '../worker/reporting.js'

const valid = Object.freeze({
  category: 'website-bug', title: 'Mobile navigation overlaps content', version: 'website only', environment: 'iPhone, Safari',
  steps: 'Open the home page and scroll to the report section.', expected: 'The navigation remains readable.', actual: 'The navigation overlaps the heading.', context: '', publicAcknowledgement: true
})
const origin = 'https://project-worship.valdoenterprise.chatgpt.site'
const enabledEnv = { DB: {}, REPORTING_ENABLED: 'true', GITHUB_APP_ID: '1', GITHUB_INSTALLATION_ID: '2', GITHUB_APP_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----', REPORTING_RATE_LIMIT_SECRET: 'x'.repeat(32) }
const request = (body = valid, overrides = {}) => {
  const { headers = {}, ...rest } = overrides
  return new Request(`${origin}/api/report`, { method: 'POST', headers: { origin, 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID(), ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body), ...rest })
}

test('validates a complete report and trims text', () => assert.deepEqual(__test.validate({ ...valid, title: `  ${valid.title}  ` }), valid))
test('rejects required fields, invalid types, unknown properties, and missing consent', () => {
  assert.throws(() => __test.validate({ ...valid, title: '' }), /title/)
  assert.throws(() => __test.validate({ ...valid, steps: 7 }), /steps must be text/)
  assert.throws(() => __test.validate({ ...valid, repository: 'other/repo' }), /Unknown field/)
  assert.throws(() => __test.validate({ ...valid, publicAcknowledgement: false }), /acknowledgement/)
})
test('rejects oversized fields and obvious secrets or personal email', () => {
  assert.throws(() => __test.validate({ ...valid, title: 'a'.repeat(121) }), /title/)
  assert.throws(() => __test.validate({ ...valid, context: 'password=do-not-publish' }), /sensitive/)
  assert.throws(() => __test.validate({ ...valid, context: 'Contact me at person@example.org' }), /sensitive/)
})
test('neutralizes mentions, Markdown, HTML, and remote-image syntax', () => {
  const escaped = __test.escapeMarkdown('@team ![x](https://remote.example/x.png) <script>')
  assert.ok(!escaped.includes('@team'))
  assert.ok(!escaped.includes('https://'))
  assert.ok(!escaped.includes('<script>'))
  assert.match(escaped, /＠team/)
})
test('uses hosting client address and ignores spoofed forwarding headers', () => {
  const req = new Request(origin, { headers: { 'cf-connecting-ip': '2001:db8:abcd:1234:5678::1', 'x-forwarded-for': '1.2.3.4' } })
  assert.equal(__test.networkBucket(req), '2001:db8:abcd:1234::/64')
})
test('status fails closed when credentials are absent', async () => {
  const response = await handleReporting(new Request(`${origin}/api/report/status`), { REPORTING_ENABLED: 'true' })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).enabled, false)
})
test('kill switch keeps POST unavailable without affecting static routes', async () => {
  const response = await handleReporting(request(), { REPORTING_ENABLED: 'false' })
  assert.equal(response.status, 503)
  assert.equal((await response.json()).status, 'unavailable')
  assert.equal(await handleReporting(new Request(`${origin}/assets/logo.svg`), {}), null)
})
test('rejects unsupported methods, origins, content types, and idempotency keys', async () => {
  assert.equal((await handleReporting(new Request(`${origin}/api/report`, { method: 'GET' }), enabledEnv)).status, 405)
  assert.equal((await handleReporting(request(valid, { headers: { origin: 'https://attacker.example' } }), enabledEnv)).status, 403)
  assert.equal((await handleReporting(request(valid, { headers: { 'content-type': 'text/plain' } }), enabledEnv)).status, 415)
  assert.equal((await handleReporting(request(valid, { headers: { 'idempotency-key': 'invalid' } }), enabledEnv)).status, 400)
})
test('rejects bodies above the bounded request size before JSON parsing', async () => {
  const response = await handleReporting(request('x'.repeat(__test.maxBodyBytes + 1)), enabledEnv)
  assert.equal(response.status, 413)
  assert.equal((await response.json()).status, 'invalid')
})
