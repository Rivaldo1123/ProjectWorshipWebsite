import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { selectAlphaRelease } from '../site/release-selection.js'

const attemptedAt = '2026-10-08T12:00:00.000Z'
function release(version, overrides = {}) {
  const tag = `v${version}`
  const name = `Project-Worship-${version}-setup.exe`
  return {
    tag_name: tag, name: `Project Worship ${version}`, draft: false, prerelease: true,
    published_at: '2026-10-07T17:57:16Z',
    html_url: `https://github.com/Rivaldo1123/ProjectWorship-updates/releases/tag/${tag}`,
    body: '## Highlights\n- Safer release\n## Limitations\n- Alpha software',
    assets: [{ name, size: 100, state: 'uploaded', digest: `sha256:${'a'.repeat(64)}`, browser_download_url: `https://github.com/Rivaldo1123/ProjectWorship-updates/releases/download/${tag}/${name}` }],
    ...overrides
  }
}

const select = (values, options = {}) => selectAlphaRelease(values, { attemptedAt, ...options })

test('orders Alpha 9 before Alpha 10 numerically', () => assert.equal(select([release('0.1.0-alpha.9'), release('0.1.0-alpha.10')]).version, '0.1.0-alpha.10'))
test('orders versions beyond 0.1.0 by numeric tuple', () => assert.equal(select([release('0.10.0-alpha.1'), release('1.0.0-alpha.1'), release('0.9.99-alpha.99')]).version, '1.0.0-alpha.1'))
test('excludes drafts and stable releases under alpha policy', () => assert.equal(select([release('0.1.0-alpha.12', { draft: true }), release('0.1.0-alpha.11'), release('0.2.0-alpha.1', { prerelease: false, tag_name: 'v0.2.0' })]).version, '0.1.0-alpha.11'))

for (const [name, mutate] of [
  ['missing installer', (item) => { item.assets = [] }],
  ['duplicate installer', (item) => { item.assets.push({ ...item.assets[0] }) }],
  ['invalid digest', (item) => { item.assets[0].digest = 'sha256:bad' }],
  ['invalid size', (item) => { item.assets[0].size = -1 }],
  ['wrong repository URL', (item) => { item.assets[0].browser_download_url = 'https://github.com/attacker/repo/releases/download/v/a.exe' }],
  ['URL credentials', (item) => { item.assets[0].browser_download_url = 'https://user:pass@github.com/Rivaldo1123/ProjectWorship-updates/releases/download/x/y' }]
]) test(`rejects ${name}`, () => { const item = release('0.1.0-alpha.5'); mutate(item); assert.throws(() => select([item]), /complete verified Windows installer/) })

test('retains the newest complete release when a newer release is incomplete and labels it', () => {
  const incomplete = release('0.1.0-alpha.6'); incomplete.assets = []
  const selected = select([release('0.1.0-alpha.5'), incomplete])
  assert.equal(selected.version, '0.1.0-alpha.5')
  assert.equal(selected.sourceStatus, 'github-verified-with-warning')
  assert.deepEqual(selected.verification.skippedNewer, [{ tag: 'v0.1.0-alpha.6', reason: 'missing-installer' }])
})

test('does not fall back from a newest revoked or unsafe release', () => {
  for (const key of ['revokedTags', 'unsafeTags']) assert.throws(() => select([release('0.1.0-alpha.6'), release('0.1.0-alpha.5')], { policy: { channel: 'alpha', architecture: 'Windows x64', revokedTags: [], unsafeTags: [], [key]: ['v0.1.0-alpha.6'] } }), /no automatic fallback/)
})

test('unfamiliar note headings never inherit notes from another release', () => {
  const selected = select([release('0.1.0-alpha.6', { body: '## A heading not recognized\nNo parsed bullets.' })])
  assert.deepEqual(selected.notes.highlights, [])
  assert.deepEqual(selected.notes.limitations, [])
  assert.match(selected.notes.limitationsMessage, /does not mean none exist/)
})

test('signing is version and digest specific; absent, mismatch, unsigned and signed records are distinct', () => {
  const item = release('0.1.0-alpha.5')
  assert.equal(select([item]).signing.status, 'unknown')
  assert.equal(select([item], { signingRecords: { '0.1.0-alpha.5': { status: 'unsigned', sha256: 'b'.repeat(64), verifiedAt: attemptedAt } } }).signing.status, 'unknown')
  assert.equal(select([item], { signingRecords: { '0.1.0-alpha.5': { status: 'unsigned', sha256: 'a'.repeat(64), verifiedAt: attemptedAt, evidence: 'PE certificate table absent' } } }).signing.status, 'unsigned')
  assert.equal(select([item], { signingRecords: { '0.1.0-alpha.5': { status: 'signed', sha256: 'a'.repeat(64), verifiedAt: attemptedAt, publisher: 'Verified Publisher' } } }).signing.status, 'signed')
})

test('malformed release metadata is rejected', () => assert.throws(() => select([release('0.1.0-alpha.5', { published_at: 'not-a-date' })]), /No published alpha/))

test('offline build preserves last success, records failed attempt, and keeps HTML/manifest consistent', async () => {
  const projectRoot = fileURLToPath(new URL('..', import.meta.url))
  const directory = await mkdtemp(join(projectRoot, '.test-build-'))
  try {
    const result = spawnSync(process.execPath, ['scripts/build.mjs', '--offline'], { cwd: projectRoot, env: { ...process.env, BUILD_OUTPUT: directory }, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    const manifest = JSON.parse(await readFile(join(directory, 'data', 'release.json'), 'utf8'))
    const html = await readFile(join(directory, 'index.html'), 'utf8')
    assert.equal(manifest.sourceStatus, 'verified-fallback')
    assert.equal(manifest.verification.lastSuccessfulAt, '2026-10-08T14:25:13.486Z')
    assert.ok(Date.parse(manifest.verification.lastAttemptedAt) > Date.parse(manifest.verification.lastSuccessfulAt))
    assert.equal(manifest.verification.refreshOutcome, 'failed-retained-last-known-good')
    for (const value of [manifest.version, manifest.asset.name, manifest.asset.sha256, manifest.asset.url, manifest.releaseUrl, manifest.signing.label]) assert.ok(html.includes(value), `HTML omitted ${value}`)
    assert.ok(!/__RELEASE_|__DOWNLOAD_/.test(html))
  } finally { await rm(directory, { recursive: true, force: true }) }
})
