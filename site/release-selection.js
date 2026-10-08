const OWNER = 'Rivaldo1123'
const REPOSITORY = 'ProjectWorship-updates'
const ALPHA_TAG = /^v?(\d+)\.(\d+)\.(\d+)-alpha\.(\d+)$/
const SHA256 = /^sha256:([0-9a-f]{64})$/i
const MAX_INSTALLER_BYTES = 2_000_000_000
const MAX_RELEASE_BODY = 250_000

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

function validIsoDate(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
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
  if (typeof body !== 'string' || body.length > MAX_RELEASE_BODY) return []
  const lines = body.split(/\r?\n/)
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
    if (text) items.push(text.slice(0, 400))
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

function strictGitHubUrl(value, expectedPath, label) {
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`${label} URL is invalid`)
  }

  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== 'github.com' ||
    parsed.port ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    decodeURIComponent(parsed.pathname) !== expectedPath
  ) {
    throw new Error(`${label} URL does not belong to the intended release`)
  }
  return parsed.href
}

function signingFor(version, digest, records) {
  const record = records?.[version]
  if (
    !record ||
    !['signed', 'unsigned', 'unknown'].includes(record.status) ||
    record.sha256 !== digest ||
    !validIsoDate(record.verifiedAt)
  ) {
    return {
      status: 'unknown',
      label: 'Signing status has not been verified for this release',
      verifiedAt: null,
      evidence: 'No reviewed, hash-matched signing record is available.'
    }
  }

  if (record.status === 'signed' && !plainText(record.publisher)) {
    return {
      status: 'unknown',
      label: 'Signing status has not been verified for this release',
      verifiedAt: null,
      evidence: 'The signing record did not include a verified publisher.'
    }
  }

  return {
    status: record.status,
    label: plainText(record.label) || (record.status === 'unsigned' ? 'Not Authenticode-signed' : record.status === 'signed' ? `Signed by ${plainText(record.publisher)}` : 'Signing status not verified'),
    publisher: record.status === 'signed' ? plainText(record.publisher) : null,
    verifiedAt: record.verifiedAt,
    evidence: plainText(record.evidence)
  }
}

function policySet(policy, key) {
  return new Set(Array.isArray(policy?.[key]) ? policy[key].filter((value) => typeof value === 'string') : [])
}

export function selectAlphaRelease(
  releases,
  {
    attemptedAt = new Date().toISOString(),
    signingRecords = {},
    policy = { channel: 'alpha', architecture: 'Windows x64', revokedTags: [], unsafeTags: [] }
  } = {}
) {
  if (!Array.isArray(releases)) throw new Error('Release response is not a list')
  if (releases.length > 100) throw new Error('Release response exceeded the supported item count')
  if (!validIsoDate(attemptedAt)) throw new Error('Refresh attempt time is invalid')
  if (policy.channel !== 'alpha') throw new Error('Only the configured alpha channel may be selected')

  const revokedTags = policySet(policy, 'revokedTags')
  const unsafeTags = policySet(policy, 'unsafeTags')
  const candidates = releases
    .filter((release) => release?.draft === false && release?.prerelease === true && validIsoDate(release?.published_at))
    .map((release) => ({ release, parsed: parsedAlpha(release.tag_name) }))
    .filter((candidate) => candidate.parsed)
    .sort((left, right) => compareParts(right.parsed, left.parsed))

  if (!candidates.length) throw new Error('No published alpha release was found')

  const newestTag = candidates[0].release.tag_name
  if (revokedTags.has(newestTag) || unsafeTags.has(newestTag)) {
    const reason = revokedTags.has(newestTag) ? 'revoked' : 'unsafe'
    throw new Error(`Newest published alpha ${newestTag} is explicitly ${reason}; no automatic fallback is permitted`)
  }

  const skipped = []
  for (const { release } of candidates) {
    const tag = release.tag_name
    if (revokedTags.has(tag) || unsafeTags.has(tag)) {
      skipped.push({ tag, reason: revokedTags.has(tag) ? 'revoked' : 'unsafe' })
      continue
    }

    const version = tag.replace(/^v/, '')
    const expectedName = `Project-Worship-${version}-setup.exe`
    const assets = Array.isArray(release.assets)
      ? release.assets.filter((asset) => asset?.name === expectedName && (!asset.state || asset.state === 'uploaded'))
      : []

    if (assets.length !== 1) {
      skipped.push({ tag, reason: assets.length > 1 ? 'ambiguous-installer' : 'missing-installer' })
      continue
    }

    const asset = assets[0]
    const digest = SHA256.exec(asset.digest ?? '')
    if (!digest) {
      skipped.push({ tag, reason: 'invalid-digest' })
      continue
    }
    if (!Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > MAX_INSTALLER_BYTES) {
      skipped.push({ tag, reason: 'invalid-size' })
      continue
    }

    let assetUrl
    let releaseUrl
    try {
      assetUrl = strictGitHubUrl(
        asset.browser_download_url,
        `/${OWNER}/${REPOSITORY}/releases/download/${tag}/${expectedName}`,
        'Installer'
      )
      releaseUrl = strictGitHubUrl(
        release.html_url,
        `/${OWNER}/${REPOSITORY}/releases/tag/${tag}`,
        'Release'
      )
    } catch {
      skipped.push({ tag, reason: 'invalid-url' })
      continue
    }

    const highlights = sectionBullets(release.body, /highlights|improvements|what(?:'|’)s new/i)
    const limitations = conciseLimitations(sectionBullets(release.body, /limitations|warnings|known issues/i))
    const digestValue = digest[1].toLowerCase()
    const newerIncomplete = skipped.length > 0

    return {
      schemaVersion: 2,
      sourceStatus: newerIncomplete ? 'github-verified-with-warning' : 'github-verified',
      channel: 'alpha',
      version,
      tag,
      releaseName: plainText(release.name) || `Project Worship ${version}`,
      publishedAt: release.published_at,
      releaseUrl,
      architecture: plainText(policy.architecture) || 'Windows x64',
      signing: signingFor(version, digestValue, signingRecords),
      asset: {
        name: expectedName,
        size: asset.size,
        sizeDecimal: `${(asset.size / 1_000_000).toFixed(1)} MB`,
        sizeBinary: `${(asset.size / 1_048_576).toFixed(1)} MiB`,
        sha256: digestValue,
        url: assetUrl
      },
      notes: {
        highlights,
        highlightsStatus: highlights.length ? 'parsed' : 'unavailable',
        highlightsMessage: highlights.length ? null : 'Highlights could not be parsed from this release. Use the authoritative release notes link.',
        limitations,
        limitationsStatus: limitations.length ? 'parsed' : 'unavailable',
        limitationsMessage: limitations.length ? null : 'Known limitations could not be parsed from this release; this does not mean none exist. Use the authoritative release notes link.'
      },
      verification: {
        lastSuccessfulAt: attemptedAt,
        lastAttemptedAt: attemptedAt,
        refreshOutcome: newerIncomplete ? 'verified-with-newer-incomplete' : 'verified',
        sourceRelease: {
          repository: `${OWNER}/${REPOSITORY}`,
          tag,
          url: releaseUrl,
          publishedAt: release.published_at
        },
        selectedAsset: {
          name: expectedName,
          url: assetUrl,
          size: asset.size,
          sha256: digestValue
        },
        skippedNewer: skipped
      }
    }
  }

  throw new Error('Published alpha releases did not include one complete verified Windows installer')
}

export function validateReleaseModel(model) {
  if (!model || model.schemaVersion !== 2 || model.channel !== 'alpha') throw new Error('Release model schema is invalid')
  if (!ALPHA_TAG.test(model.tag) || model.version !== model.tag.replace(/^v/, '')) throw new Error('Release version is invalid')
  if (!validIsoDate(model.publishedAt)) throw new Error('Release publication date is invalid')
  if (!model.asset || model.asset.name !== `Project-Worship-${model.version}-setup.exe`) throw new Error('Release asset name is invalid')
  if (!Number.isSafeInteger(model.asset.size) || model.asset.size <= 0 || model.asset.size > MAX_INSTALLER_BYTES) throw new Error('Release asset size is invalid')
  if (!/^[0-9a-f]{64}$/.test(model.asset.sha256)) throw new Error('Release digest is invalid')
  strictGitHubUrl(model.asset.url, `/${OWNER}/${REPOSITORY}/releases/download/${model.tag}/${model.asset.name}`, 'Installer')
  strictGitHubUrl(model.releaseUrl, `/${OWNER}/${REPOSITORY}/releases/tag/${model.tag}`, 'Release')
  if (!['signed', 'unsigned', 'unknown'].includes(model.signing?.status)) throw new Error('Signing status is invalid')
  if (!model.notes || !Array.isArray(model.notes.highlights) || !Array.isArray(model.notes.limitations)) throw new Error('Release notes model is invalid')
  if (!validIsoDate(model.verification?.lastSuccessfulAt) || !validIsoDate(model.verification?.lastAttemptedAt)) throw new Error('Verification timestamps are invalid')
  return model
}

export const releaseSource = Object.freeze({ owner: OWNER, repository: REPOSITORY })
