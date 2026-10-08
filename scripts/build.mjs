import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { selectAlphaRelease, validateReleaseModel } from '../site/release-selection.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'site')
const output = resolve(process.env.BUILD_OUTPUT || join(root, 'dist'))
const expectedOutputRoot = `${root}${sep}`
const origin = (process.env.SITE_ORIGIN || 'https://project-worship.valdoenterprise.chatgpt.site').replace(/\/$/, '')
const api = 'https://api.github.com/repos/Rivaldo1123/ProjectWorship-updates/releases?per_page=100'
const maxApiBytes = 2_000_000

if (output !== join(root, 'dist') && !output.startsWith(expectedOutputRoot)) throw new Error(`Refusing to write outside the project: ${output}`)

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'))
const fallback = validateReleaseModel(await readJson(join(source, 'data', 'release-fallback.json')))
const signingRecords = await readJson(join(source, 'data', 'signing-records.json'))
const policy = await readJson(join(source, 'data', 'release-policy.json'))

async function boundedJson(response) {
  const declared = Number(response.headers.get('content-length') || 0)
  if (declared > maxApiBytes) throw new Error('GitHub release response is too large')
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxApiBytes) { await reader.cancel(); throw new Error('GitHub release response is too large') }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return JSON.parse(new TextDecoder().decode(bytes))
}

async function fetchRelease(attemptedAt) {
  if (process.argv.includes('--offline') || process.env.RELEASE_API_MODE === 'offline') throw new Error('Offline release mode requested')
  const response = await fetch(api, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ProjectWorshipWebsite-build' }, signal: AbortSignal.timeout(12_000) })
  if (!response.ok) throw new Error(`GitHub releases returned ${response.status}`)
  const release = selectAlphaRelease(await boundedJson(response), { attemptedAt, signingRecords, policy })
  if (release.asset.sha256 === fallback.asset.sha256 && fallback.verification.binaryVerification) release.verification.binaryVerification = fallback.verification.binaryVerification
  return validateReleaseModel(release)
}

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

function dateLabel(value) {
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(value))
}

function notesHtml(release, key, icon = false) {
  const items = release.notes[key]
  const values = items.length ? items : [release.notes[`${key}Message`]]
  return values.map((item) => `<li>${icon && items.length ? '<svg aria-hidden="true"><use href="#icon-check"></use></svg>' : ''}<span>${escapeHtml(item)}</span></li>`).join('\n              ')
}

function signingDetail(signing) {
  if (signing.status === 'unsigned') return 'Windows may show an unknown-publisher warning. Keep Windows protections enabled and verify the checksum below.'
  if (signing.status === 'signed') return `Publisher: ${signing.publisher}. Check the Windows signature before running the installer.`
  return 'Signing has not been verified for this exact installer. Keep Windows protections enabled and verify the checksum below.'
}

function renderHtml(template, release) {
  const status = release.sourceStatus === 'github-verified' ? 'Verified at deployment' : release.sourceStatus === 'github-verified-with-warning' ? 'Verified; newer release incomplete' : 'Last verified release'
  const values = {
    __SITE_ORIGIN__: origin,
    __RELEASE_VERSION__: release.version,
    __PUBLISHED_DATE__: dateLabel(release.publishedAt),
    __ARCHITECTURE__: release.architecture,
    __SIZE_DECIMAL__: release.asset.sizeDecimal,
    __SIZE_BINARY__: release.asset.sizeBinary,
    __ASSET_NAME__: release.asset.name,
    __SHA256__: release.asset.sha256,
    __DOWNLOAD_URL__: release.asset.url,
    __RELEASE_URL__: release.releaseUrl,
    __SIGNING_LABEL__: release.signing.label,
    __SIGNING_DETAIL__: signingDetail(release.signing),
    __RELEASE_STATUS__: status,
    __HIGHLIGHTS_HTML__: notesHtml(release, 'highlights', true),
    __LIMITATIONS_HTML__: notesHtml(release, 'limitations')
  }
  let html = template
  for (const [token, raw] of Object.entries(values)) html = html.replaceAll(token, token.endsWith('_HTML__') ? raw : escapeHtml(raw))
  const unresolved = html.match(/__[A-Z][A-Z0-9_]+__/g)
  if (unresolved) throw new Error(`Unresolved HTML tokens: ${[...new Set(unresolved)].join(', ')}`)
  return html
}

await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })
await cp(source, output, { recursive: true })

const attemptedAt = new Date().toISOString()
let release
try {
  release = await fetchRelease(attemptedAt)
} catch (error) {
  release = structuredClone(fallback)
  release.sourceStatus = 'verified-fallback'
  release.verification.lastAttemptedAt = attemptedAt
  release.verification.refreshOutcome = 'failed-retained-last-known-good'
  release.verification.refreshError = String(error.message || error).slice(0, 240)
}
validateReleaseModel(release)

await mkdir(join(output, 'data'), { recursive: true })
await writeFile(join(output, 'data', 'release.json'), `${JSON.stringify(release, null, 2)}\n`, 'utf8')
await writeFile(join(output, 'index.html'), renderHtml(await readFile(join(source, 'index.html'), 'utf8'), release), 'utf8')
for (const name of ['404.html', 'robots.txt', 'sitemap.xml']) {
  const path = join(output, name)
  await writeFile(path, (await readFile(path, 'utf8')).replaceAll('__SITE_ORIGIN__', origin), 'utf8')
}

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8' }
async function files(directory) {
  const found = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) found.push(...await files(path))
    else found.push(path)
  }
  return found
}

const assets = {}
for (const path of await files(output)) {
  if (relative(output, path).startsWith(`server${sep}`)) continue
  const bytes = await readFile(path)
  const pathname = `/${relative(output, path).split(sep).join('/')}`
  assets[pathname] = { body: bytes.toString('base64'), type: mime[extname(path).toLowerCase()] || 'application/octet-stream', etag: createHash('sha256').update(bytes).digest('hex').slice(0, 24), immutable: pathname.startsWith('/assets/') }
}
await mkdir(join(output, 'server'), { recursive: true })
await cp(join(root, 'worker', 'index.js'), join(output, 'server', 'index.js'))
await cp(join(root, 'worker', 'reporting.js'), join(output, 'server', 'reporting.js'))
await writeFile(join(output, 'server', 'assets.js'), `export const ASSETS = ${JSON.stringify(assets)}\n`, 'utf8')

console.log(JSON.stringify({ output: relative(root, output), version: release.version, sourceStatus: release.sourceStatus, lastSuccessfulAt: release.verification.lastSuccessfulAt, lastAttemptedAt: release.verification.lastAttemptedAt, installer: release.asset.url }))
