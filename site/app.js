import { selectAlphaRelease } from './release-selection.js'

const releasesApi = 'https://api.github.com/repos/Rivaldo1123/ProjectWorship-updates/releases?per_page=100'
let currentRelease

function formatDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC'
  }).format(date)
}

function setText(field, value) {
  document.querySelectorAll(`[data-release-field="${field}"]`).forEach((element) => {
    element.textContent = value
  })
}

function listItem(text, withIcon = false) {
  const item = document.createElement('li')
  if (withIcon) {
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    icon.setAttribute('aria-hidden', 'true')
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use')
    use.setAttribute('href', '#icon-check')
    icon.append(use)
    item.append(icon)
  }
  const span = document.createElement('span')
  span.textContent = text
  item.append(span)
  return item
}

function renderList(selector, items, withIcon = false, limit = 5) {
  if (!Array.isArray(items) || items.length === 0) return
  const list = document.querySelector(selector)
  if (!list) return
  list.replaceChildren(...items.slice(0, limit).map((item) => listItem(item, withIcon)))
}

function applyRelease(release, statusText) {
  if (!release?.asset?.url || !release?.releaseUrl) return
  currentRelease = release
  setText('version', release.version)
  setText('publishedDate', formatDate(release.publishedAt))
  setText('architecture', release.architecture)
  setText('sizeDecimal', release.asset.sizeDecimal)
  setText('sizeBinary', release.asset.sizeBinary)
  setText('assetName', release.asset.name)
  setText('sha256', release.asset.sha256)

  document.querySelectorAll('[data-download-link]').forEach((link) => {
    link.href = release.asset.url
    link.setAttribute('aria-label', `Download Project Worship ${release.version} for Windows`)
  })
  document.querySelectorAll('[data-release-link]').forEach((link) => {
    link.href = release.releaseUrl
  })
  document.querySelectorAll('[data-release-status]').forEach((element) => {
    element.textContent = statusText
  })

  renderList('[data-release-highlights]', release.highlights, true, 5)
  renderList('[data-release-limitations]', release.limitations, false, 5)
}

async function loadBuildManifest() {
  const response = await fetch('./data/release.json', { cache: 'no-cache' })
  if (!response.ok) throw new Error('Release manifest unavailable')
  const release = await response.json()
  const status = release.sourceStatus === 'github-verified' ? 'Verified at deployment' : 'Last verified release'
  applyRelease(release, status)
}

async function refreshFromGitHub() {
  const response = await fetch(releasesApi, {
    headers: { Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(6_000)
  })
  if (!response.ok) throw new Error('GitHub release service unavailable')
  const release = selectAlphaRelease(await response.json())
  applyRelease(release, 'Verified with GitHub')
}

async function initializeRelease() {
  try {
    await loadBuildManifest()
  } catch {
    document.querySelectorAll('[data-release-status]').forEach((element) => {
      element.textContent = 'Verified fallback'
    })
  }

  try {
    await refreshFromGitHub()
  } catch {
    if (currentRelease) {
      document.querySelectorAll('[data-release-status]').forEach((element) => {
        element.textContent = 'Last verified release'
      })
    }
  }
}

function initializePlatformNotice() {
  const platform = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent
  const isMobile = navigator.userAgentData?.mobile || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)
  const isWindows = /Win/i.test(platform)
  if (!isWindows || isMobile) {
    const notice = document.querySelector('[data-platform-notice]')
    if (notice) notice.hidden = false
  }
}

function fallbackCopy(text) {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.append(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('Copy failed')
}

function initializeCopyButton() {
  const button = document.querySelector('[data-copy-hash]')
  const status = document.querySelector('[data-copy-status]')
  if (!button || !status) return

  button.addEventListener('click', async () => {
    const hash = document.querySelector('[data-release-field="sha256"]')?.textContent?.trim()
    if (!hash) return
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(hash)
      else fallbackCopy(hash)
      status.textContent = 'SHA-256 copied.'
      button.querySelector('span').textContent = 'Copied'
    } catch {
      status.textContent = 'Copy was blocked. Select the checksum manually.'
    }
    window.setTimeout(() => {
      status.textContent = ''
      button.querySelector('span').textContent = 'Copy'
    }, 2600)
  })
}

function initializeImageViewer() {
  const dialog = document.querySelector('[data-image-viewer]')
  const image = dialog?.querySelector('[data-viewer-image]')
  const caption = dialog?.querySelector('[data-viewer-caption]')
  const closeButton = dialog?.querySelector('[data-viewer-close]')
  if (!dialog || !image || !caption || !closeButton) return

  let opener = null
  document.querySelectorAll('[data-viewer-src]').forEach((button) => {
    button.addEventListener('click', () => {
      opener = button
      image.src = button.dataset.viewerSrc
      image.alt = button.dataset.viewerAlt
      caption.textContent = button.dataset.viewerCaption
      dialog.showModal()
      closeButton.focus()
    })
  })

  closeButton.addEventListener('click', () => dialog.close())
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close()
  })
  dialog.addEventListener('close', () => {
    opener?.focus()
  })
}

initializePlatformNotice()
initializeCopyButton()
initializeImageViewer()
initializeRelease()
