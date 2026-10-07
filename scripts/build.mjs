import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { selectAlphaRelease } from '../site/release-selection.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'site')
const output = resolve(process.env.BUILD_OUTPUT || join(root, 'dist'))
const expectedOutputRoot = `${root}${sep}`
const origin = (process.env.SITE_ORIGIN || 'https://project-worship.valdoenterprise.chatgpt.site').replace(/\/$/, '')
const api = 'https://api.github.com/repos/Rivaldo1123/ProjectWorship-updates/releases?per_page=100'

if (output !== join(root, 'dist') && !output.startsWith(expectedOutputRoot)) {
  throw new Error(`Refusing to write outside the project: ${output}`)
}

async function fetchRelease() {
  if (process.argv.includes('--offline') || process.env.RELEASE_API_MODE === 'offline') {
    throw new Error('Offline release mode requested')
  }

  const response = await fetch(api, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'ProjectWorshipWebsite-build'
    },
    signal: AbortSignal.timeout(12_000)
  })
  if (!response.ok) throw new Error(`GitHub releases returned ${response.status}`)
  return selectAlphaRelease(await response.json())
}

await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })
await cp(source, output, { recursive: true })

const fallbackPath = join(source, 'data', 'release-fallback.json')
const fallback = JSON.parse(await readFile(fallbackPath, 'utf8'))
let release

try {
  release = await fetchRelease()
} catch {
  release = {
    ...fallback,
    sourceStatus: 'verified-fallback',
    lastCheckedAt: new Date().toISOString(),
    refreshMessage: 'GitHub release data was unavailable; this is the last verified release.'
  }
}

await mkdir(join(output, 'data'), { recursive: true })
await writeFile(join(output, 'data', 'release.json'), `${JSON.stringify(release, null, 2)}\n`, 'utf8')

for (const name of ['index.html', '404.html', 'robots.txt', 'sitemap.xml']) {
  const path = join(output, name)
  const text = await readFile(path, 'utf8')
  await writeFile(path, text.replaceAll('__SITE_ORIGIN__', origin), 'utf8')
}

console.log(
  JSON.stringify({
    output: relative(root, output),
    version: release.version,
    sourceStatus: release.sourceStatus,
    installer: release.asset.url
  })
)
