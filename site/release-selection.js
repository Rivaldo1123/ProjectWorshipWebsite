const OWNER = 'Rivaldo1123'
const REPOSITORY = 'ProjectWorship-updates'
const ALPHA_TAG = /^v?(\d+)\.(\d+)\.(\d+)-alpha\.(\d+)$/
const SHA256 = /^sha256:([0-9a-f]{64})$/i

function parsedAlpha(tag) {
  const match = ALPHA_TAG.exec(tag ?? '')
  if (!match) return null
  return match.slice(1).map(Number)
}

function compareParts(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index]
  }
  return 0
}

function plainText(value) {
  return String(value ?? '')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function sectionBullets(body, headingPattern, limit = 6) {
  const lines = String(body ?? '').split(/\r?\n/)
  let inSection = false
  const items = []

  for (const line of lines) {
    const heading = /^#{2,3}\s+(.+)$/.exec(line.trim())
    if (heading) {
      inSection = headingPattern.test(heading[1])
      if (items.length && !inSection) break
      continue
    }
    if (!inSection) continue
    const bullet = /^\s*(?:[-*]|\d+[.)])\s+(.+)$/.exec(line)
    if (!bullet) continue
    const text = plainText(bullet[1])
    if (text) items.push(text)
    if (items.length >= limit) break
  }

  return items
}

function conciseLimitations(items) {
  return items
    .map((item) => {
      if (/^hosted checks blocked:/i.test(item)) return null
      if (/^unsigned:/i.test(item)) {
        return 'The installer and application are unsigned. Windows may show an unknown-publisher warning; verify the SHA-256 and keep Windows protections enabled.'
      }
      if (/^responsiveness target failed:/i.test(item)) {
        return 'Backup and restore responsiveness did not meet the predeclared 500 ms target in retained release evidence.'
      }
      if (/^native matrix incomplete:/i.test(item)) {
        return 'Fresh-profile installation, physical Audience/Stage displays, real audio, display reconnect, screen readers, native High Contrast/scaling, and a 60-minute rehearsal remain incomplete.'
      }
      if (/^64\/128 MiB/i.test(item)) {
        return 'Large 64/128 MiB and near-policy-limit performance cases remain unverified.'
      }
      return item.length > 220 ? `${item.slice(0, 217).trimEnd()}…` : item
    })
    .filter(Boolean)
    .slice(0, 5)
}

function validateAssetUrl(url, tag, filename) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('Installer URL is invalid')
  }

  const expectedPath = `/${OWNER}/${REPOSITORY}/releases/download/${tag}/${filename}`
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com' || decodeURIComponent(parsed.pathname) !== expectedPath) {
    throw new Error('Installer URL does not belong to the intended release')
  }
}

export function selectAlphaRelease(releases, { checkedAt = new Date().toISOString() } = {}) {
  if (!Array.isArray(releases)) throw new Error('Release response is not a list')

  const candidates = releases
    .filter((release) => release?.draft === false && release?.prerelease === true && release?.published_at)
    .map((release) => ({ release, parsed: parsedAlpha(release.tag_name) }))
    .filter((candidate) => candidate.parsed)
    .sort((left, right) => compareParts(right.parsed, left.parsed))

  if (!candidates.length) throw new Error('No published alpha release was found')

  for (const { release } of candidates) {
    const version = release.tag_name.replace(/^v/, '')
    const expectedName = `Project-Worship-${version}-setup.exe`
    const assets = (release.assets ?? []).filter(
      (asset) => asset?.name === expectedName && (!asset.state || asset.state === 'uploaded')
    )

    if (assets.length !== 1) continue
    const asset = assets[0]
    const digest = SHA256.exec(asset.digest ?? '')
    if (!digest || !Number.isSafeInteger(asset.size) || asset.size <= 0) continue

    try {
      validateAssetUrl(asset.browser_download_url, release.tag_name, expectedName)
      const releaseUrl = new URL(release.html_url)
      const expectedReleasePath = `/${OWNER}/${REPOSITORY}/releases/tag/${release.tag_name}`
      if (
        releaseUrl.protocol !== 'https:' ||
        releaseUrl.hostname !== 'github.com' ||
        decodeURIComponent(releaseUrl.pathname) !== expectedReleasePath
      ) {
        continue
      }
    } catch {
      continue
    }

    const highlights = sectionBullets(release.body, /highlights|improvements|what(?:'|’)s new/i)
    const limitations = conciseLimitations(sectionBullets(release.body, /limitations|warnings|known issues/i))

    return {
      schemaVersion: 1,
      sourceStatus: 'github-verified',
      lastCheckedAt: checkedAt,
      channel: 'alpha',
      version,
      tag: release.tag_name,
      releaseName: plainText(release.name) || `Project Worship ${version}`,
      publishedAt: release.published_at,
      releaseUrl: release.html_url,
      architecture: 'Windows x64',
      signing: {
        status: 'unsigned',
        label: 'Unsigned — Windows may show an unknown-publisher warning'
      },
      asset: {
        name: expectedName,
        size: asset.size,
        sizeDecimal: `${(asset.size / 1_000_000).toFixed(1)} MB`,
        sizeBinary: `${(asset.size / 1_048_576).toFixed(1)} MiB`,
        sha256: digest[1].toLowerCase(),
        url: asset.browser_download_url
      },
      highlights,
      limitations
    }
  }

  throw new Error('Published alpha releases did not include one complete verified Windows installer')
}

export const releaseSource = Object.freeze({ owner: OWNER, repository: REPOSITORY })
