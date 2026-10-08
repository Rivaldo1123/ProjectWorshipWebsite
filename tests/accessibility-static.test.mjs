import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const html = await readFile(new URL('../site/index.html', import.meta.url), 'utf8')
const css = await readFile(new URL('../site/styles.css', import.meta.url), 'utf8')

test('has one document language, title, description, skip link, main landmark and h1', () => {
  assert.match(html, /<html lang="en">/)
  assert.match(html, /<title>[^<]+<\/title>/)
  assert.match(html, /<meta name="description" content="[^"].+"/)
  assert.equal((html.match(/<h1\b/g) || []).length, 1)
  assert.match(html, /class="skip-link" href="#main"/)
  assert.match(html, /<main id="main">/)
})

test('every image has alt text semantics and screenshot buttons carry descriptions', () => {
  for (const tag of html.match(/<img\b[^>]*>/g) || []) assert.match(tag, /\balt="[^"]*"/)
  for (const tag of html.match(/<button\b[^>]*data-viewer-src[^>]*>/g) || []) {
    assert.match(tag, /data-viewer-alt="[^"]+"/)
    assert.match(tag, /data-viewer-caption="[^"]+"/)
  }
})

test('form controls are labelled, errors are announced, and public consent starts unchecked', () => {
  for (const name of ['category', 'title', 'version', 'environment', 'steps', 'expected', 'actual', 'context']) assert.match(html, new RegExp(`<label>[\\s\\S]*?name="${name}"`))
  assert.match(html, /data-form-errors[^>]*aria-live="assertive"/)
  assert.match(html, /data-report-result[^>]*aria-live="polite"/)
  assert.match(html, /type="checkbox" data-public-consent\s*\/>/)
  assert.doesNotMatch(html, /data-public-consent[^>]*checked/)
})

test('viewer exposes fit, actual-size, close, scroll focus, and dialog labelling', () => {
  for (const attribute of ['data-viewer-fit', 'data-viewer-actual', 'data-viewer-close', 'data-viewer-scroll']) assert.ok(html.includes(attribute))
  assert.match(html, /<dialog[^>]+aria-labelledby="viewer-caption"/)
  assert.match(html, /data-viewer-scroll tabindex="0"/)
})

test('styles include visible focus, reduced motion, forced colors, and 320-pixel reflow support', () => {
  assert.match(css, /:focus-visible\s*\{[^}]*outline:/s)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(css, /@media \(forced-colors: active\)/)
  assert.match(css, /min-width:\s*320px/)
})
