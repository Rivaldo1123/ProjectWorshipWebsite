import { createServer } from 'node:http'
import worker from '../dist/server/index.js'

const hostname = '127.0.0.1'
const port = Number(process.env.PORT || 4173)
const env = { REPORTING_ENABLED: 'false', LOCAL_ALLOWED_ORIGIN: `http://${hostname}:${port}` }

createServer(async (request, response) => {
  try {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const body = chunks.length ? Buffer.concat(chunks) : undefined
    const webRequest = new Request(`http://${hostname}:${port}${request.url}`, { method: request.method, headers: request.headers, body, duplex: body ? 'half' : undefined })
    const result = await worker.fetch(webRequest, env)
    response.writeHead(result.status, Object.fromEntries(result.headers))
    response.end(Buffer.from(await result.arrayBuffer()))
  } catch {
    response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
    response.end('Local preview error')
  }
}).listen(port, hostname, () => console.log(`Project Worship website preview: http://${hostname}:${port}`))
