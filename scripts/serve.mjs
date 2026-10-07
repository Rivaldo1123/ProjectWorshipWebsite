import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'

const root = resolve('dist')
const port = Number(process.env.PORT || 4173)
const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8'
}

createServer((request, response) => {
  const requested = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
  const relative = normalize(requested).replace(/^(?:\.\.(?:[/\\]|$))+/, '').replace(/^[/\\]+/, '')
  let file = join(root, relative || 'index.html')
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
  if (!file.startsWith(root) || !existsSync(file)) {
    file = join(root, '404.html')
    response.statusCode = 404
  }
  response.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream')
  response.setHeader('Cache-Control', 'no-store')
  createReadStream(file).pipe(response)
}).listen(port, '127.0.0.1', () => {
  console.log(`Local URL: http://127.0.0.1:${port}`)
})
