import { access, readFile, readdir } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const required = [
  'index.html',
  '404.html',
  'styles.css',
  'app.js',
  'release-selection.js',
  'data/release.json',
  'server/index.js',
  'server/reporting.js',
  'server/assets.js',
  'assets/logo.svg',
  'assets/screenshots/service.png',
  'assets/screenshots/library.png',
  'assets/screenshots/screens.png'
]

for (const path of required) await access(join(dist, path))

const html = await readFile(join(dist, 'index.html'), 'utf8')
const release = JSON.parse(await readFile(join(dist, 'data', 'release.json'), 'utf8'))
const forbidden = ['__SITE_ORIGIN__', '__RELEASE_', '__DOWNLOAD_', 'example.com', 'TODO', 'PLACEHOLDER', 'file://']
for (const value of forbidden) {
  if (html.includes(value)) throw new Error(`Built HTML contains ${value}`)
}

if (!/^\d+\.\d+\.\d+-alpha\.\d+$/.test(release.version)) throw new Error('Release version is not a parsed alpha')
if (!/^https:\/\/github\.com\/Rivaldo1123\/ProjectWorship-updates\/releases\/download\//.test(release.asset.url)) {
  throw new Error('Installer does not point to the updates repository')
}
if (!/^[0-9a-f]{64}$/.test(release.asset.sha256)) throw new Error('Installer SHA-256 is invalid')
if (!html.includes(release.asset.url)) throw new Error('No-script download fallback differs from the manifest')
for (const value of [release.version, release.asset.name, release.asset.sha256, release.releaseUrl, release.architecture, release.signing.label]) {
  if (!html.includes(value)) throw new Error(`No-script release field differs from the manifest: ${value}`)
}
if (!html.includes('data-report-form') || !html.includes('data-public-consent')) throw new Error('On-site reporting form is missing')

function luminance(hex) {
  const channels = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255)
  const [red, green, blue] = channels.map((value) =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  )
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((left, right) => right - left)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

for (const [foreground, background, label] of [
  ['#f4f7fc', '#090d15', 'primary text'],
  ['#a9b4c7', '#121a27', 'secondary text'],
  ['#7f8aa0', '#121a27', 'muted text'],
  ['#ffffff', '#7c3aed', 'primary action'],
  ['#ffffff', '#6d28d9', 'primary action hover']
]) {
  if (contrast(foreground, background) < 4.5) throw new Error(`${label} does not meet 4.5:1 contrast`)
}

const localLinks = [...html.matchAll(/(?:href|src)="([^"#]+)"/g)]
  .map((match) => match[1])
  .filter((value) => !/^(?:https?:|mailto:|data:)/.test(value))

for (const value of localLinks) {
  const clean = value.split('?')[0].replace(/^\.\//, '')
  if (clean === '/' || !clean) continue
  await access(join(dist, clean))
}

async function textFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const found = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) found.push(...(await textFiles(path)))
    else if (['.html', '.css', '.js', '.json', '.xml', '.txt'].includes(extname(entry.name))) found.push(path)
  }
  return found
}

for (const path of await textFiles(dist)) {
  const text = await readFile(path, 'utf8')
  if (/(?:gh[opsu]|github_pat)_[A-Za-z0-9_]{20,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----\s+[A-Za-z0-9+/]{40,}/.test(text)) {
    throw new Error(`Possible credential in ${path}`)
  }
}

const worker = await readFile(join(dist, 'server', 'index.js'), 'utf8')
for (const requiredHeader of ['content-security-policy', 'x-content-type-options', 'referrer-policy', 'permissions-policy', 'strict-transport-security']) {
  if (!worker.includes(requiredHeader)) throw new Error(`Worker is missing ${requiredHeader}`)
}

console.log(JSON.stringify({ verified: true, files: required.length, version: release.version }))
