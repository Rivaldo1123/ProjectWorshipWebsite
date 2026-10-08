let currentRelease

function formatDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(date)
}

function setText(field, value) {
  document.querySelectorAll(`[data-release-field="${field}"]`).forEach((element) => { element.textContent = value })
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

function renderList(selector, items, message, withIcon = false, limit = 5) {
  const list = document.querySelector(selector)
  if (!list) return
  const values = Array.isArray(items) && items.length ? items.slice(0, limit) : [message]
  list.replaceChildren(...values.map((item) => listItem(item, withIcon && items?.length)))
}

function signingDetail(signing) {
  if (signing.status === 'unsigned') return 'Windows may show an unknown-publisher warning. Keep Windows protections enabled and verify the checksum below.'
  if (signing.status === 'signed') return `Publisher: ${signing.publisher}. Check the Windows signature before running the installer.`
  return 'Signing has not been verified for this exact installer. Keep Windows protections enabled and verify the checksum below.'
}

function applyRelease(release) {
  if (!release?.asset?.url || !release?.releaseUrl || !release?.notes || !release?.signing) throw new Error('Release manifest is incomplete')
  currentRelease = release
  setText('version', release.version)
  setText('publishedDate', formatDate(release.publishedAt))
  setText('architecture', release.architecture)
  setText('sizeDecimal', release.asset.sizeDecimal)
  setText('sizeBinary', release.asset.sizeBinary)
  setText('assetName', release.asset.name)
  setText('sha256', release.asset.sha256)
  setText('signingLabel', release.signing.label)
  setText('signingDetail', signingDetail(release.signing))
  document.querySelectorAll('[data-download-link]').forEach((link) => {
    link.href = release.asset.url
    link.setAttribute('aria-label', `Download Project Worship ${release.version} for Windows`)
  })
  document.querySelectorAll('[data-release-link]').forEach((link) => { link.href = release.releaseUrl })
  const status = release.sourceStatus === 'github-verified' ? 'Verified at deployment' : release.sourceStatus === 'github-verified-with-warning' ? 'Verified; newer release incomplete' : 'Last verified release'
  document.querySelectorAll('[data-release-status]').forEach((element) => { element.textContent = status })
  renderList('[data-release-highlights]', release.notes.highlights, release.notes.highlightsMessage, true)
  renderList('[data-release-limitations]', release.notes.limitations, release.notes.limitationsMessage)
}

async function initializeRelease() {
  try {
    const response = await fetch('./data/release.json', { cache: 'no-store' })
    if (!response.ok) throw new Error('Release manifest unavailable')
    applyRelease(await response.json())
  } catch {
    document.querySelectorAll('[data-release-status]').forEach((element) => { element.textContent = 'Deployed verified release' })
  }
}

function initializePlatformNotice() {
  const platform = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent
  const isMobile = navigator.userAgentData?.mobile || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)
  if (!/Win/i.test(platform) || isMobile) document.querySelector('[data-platform-notice]')?.removeAttribute('hidden')
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text)
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
  button?.addEventListener('click', async () => {
    const hash = document.querySelector('[data-release-field="sha256"]')?.textContent?.trim()
    try {
      await copyText(hash)
      status.textContent = 'SHA-256 copied.'
      button.querySelector('span').textContent = 'Copied'
    } catch { status.textContent = 'Copy was blocked. Select the checksum manually.' }
    window.setTimeout(() => { status.textContent = ''; button.querySelector('span').textContent = 'Copy' }, 2600)
  })
}

function initializeImageViewer() {
  const dialog = document.querySelector('[data-image-viewer]')
  const image = dialog?.querySelector('[data-viewer-image]')
  const caption = dialog?.querySelector('[data-viewer-caption]')
  const scroll = dialog?.querySelector('[data-viewer-scroll]')
  const fit = dialog?.querySelector('[data-viewer-fit]')
  const actual = dialog?.querySelector('[data-viewer-actual]')
  const close = dialog?.querySelector('[data-viewer-close]')
  if (!dialog || !image || !caption || !scroll || !fit || !actual || !close) return
  let opener

  const mode = (value) => {
    image.dataset.mode = value
    fit.setAttribute('aria-pressed', String(value === 'fit'))
    actual.setAttribute('aria-pressed', String(value === 'actual'))
    scroll.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }
  fit.addEventListener('click', () => mode('fit'))
  actual.addEventListener('click', () => mode('actual'))
  document.querySelectorAll('[data-viewer-src]').forEach((button) => button.addEventListener('click', () => {
    opener = button
    image.src = button.dataset.viewerSrc
    image.alt = button.dataset.viewerAlt
    caption.textContent = button.dataset.viewerCaption
    mode('fit')
    dialog.showModal()
    close.focus()
  }))
  close.addEventListener('click', () => dialog.close())
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close() })
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); dialog.close() })
  dialog.addEventListener('close', () => { image.removeAttribute('src'); opener?.focus() })
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return
    const controls = [fit, actual, close, scroll]
    const index = controls.indexOf(document.activeElement)
    if (event.shiftKey && index === 0) { event.preventDefault(); scroll.focus() }
    if (!event.shiftKey && index === controls.length - 1) { event.preventDefault(); fit.focus() }
  })
}

const fieldLimits = Object.freeze({ title: [8, 120], version: [1, 60], environment: [2, 160], steps: [10, 3000], expected: [4, 1500], actual: [4, 1500], context: [0, 1500] })
const sensitivePattern = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:gh[opsu]|github_pat)_[A-Za-z0-9_]{20,}\b|\b(?:password|activation\s*code|api\s*key|secret|bearer)\s*[:=]\s*\S+|\b[A-Z]:\\Users\\[^\s]+|\b[^\s@]+@[^\s@]+\.[^\s@]+\b)/i

function reportPayload(form) {
  const data = new FormData(form)
  return Object.fromEntries(['category', 'title', 'version', 'environment', 'steps', 'expected', 'actual', 'context'].map((key) => [key, String(data.get(key) || '').trim()]))
}

function validateReport(payload) {
  const errors = {}
  if (!['application-bug', 'website-bug', 'feature-request'].includes(payload.category)) errors.category = 'Choose a report category.'
  for (const [field, [min, max]] of Object.entries(fieldLimits)) {
    if (payload[field].length < min) errors[field] = `Enter at least ${min} characters.`
    else if (payload[field].length > max) errors[field] = `Use no more than ${max} characters.`
  }
  for (const field of Object.keys(fieldLimits)) if (sensitivePattern.test(payload[field])) errors[field] = 'Remove possible sensitive or personal information before continuing.'
  return errors
}

function previewReport(payload) {
  const labels = { 'application-bug': 'Application bug', 'website-bug': 'Website bug', 'feature-request': 'Feature request' }
  return `Category: ${labels[payload.category]}\nTitle: ${payload.title}\nVersion: ${payload.version}\nEnvironment: ${payload.environment}\n\nSteps to reproduce\n${payload.steps}\n\nExpected result\n${payload.expected}\n\nActual result\n${payload.actual}${payload.context ? `\n\nAdditional context\n${payload.context}` : ''}`
}

function showErrors(errors) {
  document.querySelectorAll('[data-error-for]').forEach((node) => { node.textContent = errors[node.dataset.errorFor] || '' })
  const summary = document.querySelector('[data-form-errors]')
  const values = Object.values(errors)
  summary.hidden = !values.length
  summary.textContent = values.length ? `Please correct ${values.length} field${values.length === 1 ? '' : 's'}: ${values.join(' ')}` : ''
  if (values.length) summary.focus()
}

async function initializeReportForm() {
  const form = document.querySelector('[data-report-form]')
  const availability = document.querySelector('[data-report-availability]')
  const reviewButton = document.querySelector('[data-review-button]')
  const review = document.querySelector('[data-report-review]')
  const preview = document.querySelector('[data-report-preview]')
  const consent = document.querySelector('[data-public-consent]')
  const submit = document.querySelector('[data-submit-report]')
  const edit = document.querySelector('[data-edit-report]')
  const result = document.querySelector('[data-report-result]')
  if (!form || !availability || !reviewButton || !review || !preview || !consent || !submit || !edit || !result) return
  let enabled = false
  let payload
  let idempotencyKey
  try {
    const response = await fetch('/api/report/status', { cache: 'no-store' })
    const status = await response.json()
    enabled = response.ok && status.enabled === true
    availability.textContent = enabled ? 'On-site public reporting is available.' : 'On-site submission is temporarily unavailable. You can still prepare and review a report, then use the optional GitHub fallback.'
  } catch { availability.textContent = 'The reporting service could not be reached. Downloads remain available.' }
  reviewButton.disabled = false

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    payload = reportPayload(form)
    const errors = validateReport(payload)
    showErrors(errors)
    if (Object.keys(errors).length) return
    preview.textContent = previewReport(payload)
    review.hidden = false
    result.hidden = true
    consent.checked = false
    submit.disabled = true
    idempotencyKey = crypto.randomUUID()
    review.scrollIntoView({ block: 'start' })
    review.focus?.()
  })
  consent.addEventListener('change', () => { submit.disabled = !consent.checked || !enabled })
  edit.addEventListener('click', () => { review.hidden = true; form.querySelector('input, select, textarea')?.focus() })
  submit.addEventListener('click', async () => {
    submit.disabled = true
    submit.textContent = 'Submitting…'
    result.hidden = true
    try {
      const response = await fetch('/api/report', {
        method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
        body: JSON.stringify({ ...payload, publicAcknowledgement: true })
      })
      const body = await response.json()
      if (response.ok && body.status === 'created') {
        result.className = 'report-result success'
        result.replaceChildren(document.createTextNode(`Report #${body.issueNumber} was created. `))
        if (body.issueUrl) { const link = document.createElement('a'); link.href = body.issueUrl; link.textContent = 'View the public issue (optional)'; result.append(link) }
        form.reset(); review.hidden = true
      } else if (body.status === 'ambiguous') {
        result.className = 'report-result warning'
        result.textContent = `The result is uncertain and the same request will not be sent again automatically. Keep reference ${body.correlationId || 'shown by the service'} for reconciliation.`
      } else {
        result.className = 'report-result error'
        result.textContent = body.message || 'The report was not submitted. Your text remains on this page.'
        if (body.retryable) submit.disabled = !consent.checked || !enabled
      }
    } catch {
      result.className = 'report-result error'
      result.textContent = 'The reporting service could not be reached. The result may be uncertain; do not create a second report until the service is checked.'
    } finally {
      submit.textContent = 'Submit public report'
      result.hidden = false
      result.focus()
    }
  })
}

initializePlatformNotice()
initializeCopyButton()
initializeImageViewer()
initializeRelease()
initializeReportForm()
