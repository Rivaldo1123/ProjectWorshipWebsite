import { ASSETS } from './assets.js'
import { handleReporting } from './reporting.js'

const securityHeaders = Object.freeze({
  'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
  'cross-origin-resource-policy': 'same-origin',
  'permissions-policy': 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()',
  'referrer-policy': 'no-referrer',
  'strict-transport-security': 'max-age=31536000',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY'
})

function assetResponse(asset, method) {
  const headers = new Headers(securityHeaders)
  headers.set('content-type', asset.type)
  headers.set('cache-control', asset.immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=300, must-revalidate')
  headers.set('etag', `"${asset.etag}"`)
  return new Response(method === 'HEAD' ? null : Uint8Array.from(atob(asset.body), (character) => character.charCodeAt(0)), { status: 200, headers })
}

function secure(response) {
  const headers = new Headers(response.headers)
  for (const [name, value] of Object.entries(securityHeaders)) if (!headers.has(name)) headers.set(name, value)
  if ((response.headers.get('content-type') || '').includes('application/json')) headers.set('cache-control', 'no-store, max-age=0')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

export default {
  async fetch(request, env) {
    const reporting = await handleReporting(request, env)
    if (reporting) return secure(reporting)
    const url = new URL(request.url)
    if (!['GET', 'HEAD'].includes(request.method)) return secure(new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD', 'content-type': 'text/plain; charset=utf-8' } }))
    let path = decodeURIComponent(url.pathname)
    if (path.includes('..') || path.includes('\\') || path.includes('\0')) return secure(new Response('Bad request', { status: 400 }))
    if (path === '/') path = '/index.html'
    const asset = ASSETS[path]
    if (asset) {
      if (request.headers.get('if-none-match') === `"${asset.etag}"`) return secure(new Response(null, { status: 304, headers: { etag: `"${asset.etag}"` } }))
      return assetResponse(asset, request.method)
    }
    return secure(ASSETS['/404.html'] ? new Response(request.method === 'HEAD' ? null : Uint8Array.from(atob(ASSETS['/404.html'].body), (character) => character.charCodeAt(0)), { status: 404, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } }) : new Response('Not found', { status: 404 }))
  }
}
