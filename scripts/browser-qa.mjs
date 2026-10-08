import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'

const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:4173'
const output = resolve(process.env.QA_OUTPUT || 'evidence/final-website')
const port = 9339
const executable = process.env.BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const profile = await mkdtemp(join(tmpdir(), 'pw-site-cdp-'))
await mkdir(output, { recursive: true })

const browser = spawn(executable, [`--remote-debugging-port=${port}`, '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true })
const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))

async function waitForJson(url, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { const response = await fetch(url); if (response.ok) return response.json() } catch {}
    await delay(100)
  }
  throw new Error(`Browser endpoint did not become ready: ${url}`)
}

class Cdp {
  constructor(url) { this.socket = new WebSocket(url); this.sequence = 0; this.pending = new Map() }
  async open() {
    await new Promise((resolveOpen, reject) => { this.socket.addEventListener('open', resolveOpen, { once: true }); this.socket.addEventListener('error', reject, { once: true }) })
    this.socket.addEventListener('message', (event) => { const message = JSON.parse(event.data); if (!message.id) return; const item = this.pending.get(message.id); if (!item) return; this.pending.delete(message.id); message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result) })
  }
  send(method, params = {}) { const id = ++this.sequence; this.socket.send(JSON.stringify({ id, method, params })); return new Promise((resolveCall, reject) => this.pending.set(id, { resolve: resolveCall, reject })) }
  close() { this.socket.close() }
}

let cdp
let completed = false
const results = { checkedAt: new Date().toISOString(), origin, browser: 'Microsoft Edge headless via Chrome DevTools Protocol', checks: {}, screenshots: [] }

async function evaluate(expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}

async function waitFor(expression, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) { if (await evaluate(expression)) return; await delay(100) }
  throw new Error(`Timed out waiting for: ${expression}`)
}

async function viewport(width, height, mobile = false) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile })
}

async function navigate(path = '/') {
  await cdp.send('Page.navigate', { url: `${origin}${path}` })
  await waitFor("document.readyState === 'complete'")
  await delay(150)
}

async function section(selector) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'start'}); window.scrollBy(0, -80); true`)
  await delay(80)
}

async function screenshot(name) {
  const capture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(join(output, name), Buffer.from(capture.data, 'base64'))
  results.screenshots.push(name)
}

async function layoutCheck(label) {
  results.checks[label] = await evaluate(`({
    viewport: [innerWidth, innerHeight],
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
    title: document.title,
    h1Count: document.querySelectorAll('h1').length,
    unlabeledControls: [...document.querySelectorAll('button,input,select,textarea')].filter(e => !e.matches('[aria-label]') && !e.closest('label') && !e.textContent.trim()).length,
    imagesMissingAlt: [...document.images].filter(e => !e.hasAttribute('alt')).length
  })`)
}

async function populateAndReview() {
  await evaluate(`(() => {
    const f=document.querySelector('[data-report-form]');
    const values={category:'website-bug',title:'Synthetic website reporting verification',version:'website only',environment:'Windows 11, Edge',steps:'Open the synthetic reporting verification state.',expected:'The reviewed public report is shown.',actual:'The selected test response is presented.',context:'Synthetic non-sensitive browser QA content.'};
    for(const [name,value] of Object.entries(values)){const e=f.elements[name];e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))}
    f.requestSubmit(); return true
  })()`)
  await waitFor("document.querySelector('[data-report-review]').hidden === false")
}

try {
  await waitForJson(`http://127.0.0.1:${port}/json/version`)
  const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' }).then((response) => response.json())
  cdp = new Cdp(target.webSocketDebuggerUrl)
  await cdp.open()
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })

  await viewport(1440, 900)
  await navigate('/')
  await screenshot('hero-1440x900.png')
  await layoutCheck('desktop1440')
  await section('#features'); await screenshot('features-1440x900.png')
  await section('#screenshots'); await screenshot('screenshots-1440x900.png')
  await section('#download'); await screenshot('download-1440x900.png')
  await section('#getting-started'); await screenshot('getting-started-1440x900.png')
  await section('#release-notes'); await screenshot('release-notes-1440x900.png')
  await section('#report'); await screenshot('report-1440x900.png')
  await section('#security'); await screenshot('security-privacy-1440x900.png')

  await section('#screenshots')
  await evaluate("document.querySelector('#screenshots [data-viewer-src]').click(); true")
  await waitFor("document.querySelector('[data-image-viewer]').open")
  results.checks.viewerFit = await evaluate(`(() => {const s=document.querySelector('[data-viewer-scroll]'),i=document.querySelector('[data-viewer-image]');const r=i.getBoundingClientRect(),q=s.getBoundingClientRect();return {mode:i.dataset.mode,withinHorizontal:r.left>=q.left-1&&r.right<=q.right+1,withinVertical:r.top>=q.top-1&&r.bottom<=q.bottom+1}})()`)
  await screenshot('viewer-fit-1440x900.png')
  await evaluate("document.querySelector('[data-viewer-actual]').click(); true")
  await waitFor("document.querySelector('[data-viewer-image]').complete")
  results.checks.viewerActual = await evaluate(`(() => {const s=document.querySelector('[data-viewer-scroll]'),i=document.querySelector('[data-viewer-image]');s.scrollLeft=s.scrollWidth;s.scrollTop=s.scrollHeight;const maxLeft=s.scrollWidth-s.clientWidth,maxTop=s.scrollHeight-s.clientHeight;return {mode:i.dataset.mode,leftOrigin:i.offsetLeft===0,allEdgesReachable:s.scrollLeft===maxLeft&&s.scrollTop===maxTop,natural:[i.naturalWidth,i.naturalHeight],scroll:[s.scrollWidth,s.scrollHeight],client:[s.clientWidth,s.clientHeight]}})()`)
  await screenshot('viewer-actual-1440x900.png')
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 })
  await waitFor("!document.querySelector('[data-image-viewer]').open")
  results.checks.viewerFocusRestored = await evaluate("!document.querySelector('[data-image-viewer]').open && document.activeElement.matches('[data-viewer-src]')")

  await navigate('/#report'); await section('#report')
  await evaluate("document.querySelector('[data-report-form]').requestSubmit(); true")
  await waitFor("document.querySelector('[data-form-errors]').hidden === false")
  await screenshot('report-validation-1440x900.png')
  await populateAndReview()
  await screenshot('report-review-1440x900.png')

  const mock = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `{
    const realFetch=window.fetch.bind(window);
    window.fetch=(input,init={})=>{
      const url=String(input);
      if(url.endsWith('/api/report/status')) return Promise.resolve(new Response(JSON.stringify({enabled:true,uploads:false,publicReports:true}),{status:200,headers:{'content-type':'application/json'}}));
      if(url.endsWith('/api/report')) return Promise.resolve(new Response(JSON.stringify({status:'created',issueNumber:999999,issueUrl:'https://github.com/Rivaldo1123/ProjectWorshipWebsite/issues/999999'}),{status:201,headers:{'content-type':'application/json'}}));
      return realFetch(input,init)
    }
  }` })
  await navigate('/?synthetic-report-state=success#report'); await section('#report'); await populateAndReview()
  await evaluate("(() => {const c=document.querySelector('[data-public-consent]');c.click();document.querySelector('[data-submit-report]').click();return true})()")
  await waitFor("document.querySelector('[data-report-result]').textContent.includes('Report #999999')")
  await screenshot('report-success-synthetic-1440x900.png')
  await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: mock.identifier })

  await viewport(768, 1024, true); await navigate('/'); await section('#screenshots'); await screenshot('tablet-768x1024.png'); await layoutCheck('tablet768')
  await viewport(390, 844, true); await navigate('/'); await screenshot('mobile-390x844.png'); await layoutCheck('mobile390')
  await viewport(320, 844, true); await navigate('/'); await section('#report'); await screenshot('reflow-320x844.png'); await layoutCheck('reflow320')
  await viewport(640, 900); await navigate('/'); await layoutCheck('zoomEquivalent200Percent')
  await viewport(1280, 720); await navigate('/not-found'); await screenshot('404-1280x720.png')

  const failures = []
  for (const [name, check] of Object.entries(results.checks)) {
    if (check?.horizontalOverflow) failures.push(`${name}: horizontal overflow`)
    if (check?.imagesMissingAlt) failures.push(`${name}: missing alt`)
    if (check?.unlabeledControls) failures.push(`${name}: unlabeled controls`)
  }
  if (!results.checks.viewerFit.withinHorizontal || !results.checks.viewerFit.withinVertical) failures.push('viewer fit does not fit')
  if (!results.checks.viewerActual.leftOrigin || !results.checks.viewerActual.allEdgesReachable) failures.push('viewer actual edges are unreachable')
  if (!results.checks.viewerFocusRestored) failures.push('viewer focus was not restored')
  results.failures = failures
  await writeFile(join(output, 'browser-qa.json'), `${JSON.stringify(results, null, 2)}\n`)
  if (failures.length) throw new Error(failures.join('; '))
  console.log(JSON.stringify({ passed: true, screenshots: results.screenshots.length, checks: Object.keys(results.checks).length }))
  completed = true
} finally {
  cdp?.close()
  browser.kill()
  await Promise.race([new Promise((resolveExit) => browser.once('exit', resolveExit)), delay(2500)])
  const tempRoot = resolve(tmpdir()) + sep
  if (resolve(profile).startsWith(tempRoot) && profile.includes('pw-site-cdp-')) {
    try { await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) } catch {}
  }
  if (completed) process.exit(0)
}
