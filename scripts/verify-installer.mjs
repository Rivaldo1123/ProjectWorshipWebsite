import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdtemp, open, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const release = JSON.parse(await readFile(join(root, 'site', 'data', 'release-fallback.json'), 'utf8'))
const temporaryRoot = resolve(tmpdir())
const directory = await mkdtemp(join(temporaryRoot, 'project-worship-installer-'))
const resolvedDirectory = resolve(directory)

if (!resolvedDirectory.startsWith(`${temporaryRoot}${sep}`) || !basename(resolvedDirectory).startsWith('project-worship-installer-')) {
  throw new Error('Temporary verification directory was not safely contained')
}

const filename = join(resolvedDirectory, release.asset.name)
const startedAt = new Date().toISOString()

async function peSecurityDirectory(path) {
  const handle = await open(path, 'r')
  try {
    const buffer = Buffer.alloc(65_536)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    if (bytesRead < 256 || buffer.toString('ascii', 0, 2) !== 'MZ') throw new Error('Installer is not a valid PE file')
    const peOffset = buffer.readUInt32LE(0x3c)
    if (peOffset + 160 > bytesRead || buffer.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0') throw new Error('Installer PE header is invalid')
    const optionalOffset = peOffset + 24
    const magic = buffer.readUInt16LE(optionalOffset)
    const dataDirectoriesOffset = optionalOffset + (magic === 0x20b ? 112 : magic === 0x10b ? 96 : 0)
    if (dataDirectoriesOffset === optionalOffset) throw new Error('Installer PE optional header is unsupported')
    const securityEntry = dataDirectoriesOffset + 4 * 8
    return {
      fileOffset: buffer.readUInt32LE(securityEntry),
      size: buffer.readUInt32LE(securityEntry + 4)
    }
  } finally {
    await handle.close()
  }
}

function windowsAuthenticodeStatus(path) {
  if (process.platform !== 'win32') return { status: 'not-checked', signer: null }
  const command = '$s=Get-AuthenticodeSignature -LiteralPath $args[0]; [pscustomobject]@{status=$s.Status.ToString();signer=$s.SignerCertificate.Subject} | ConvertTo-Json -Compress'
  for (const shell of ['pwsh', 'powershell.exe']) {
    const result = spawnSync(shell, ['-NoProfile', '-NonInteractive', '-Command', command, path], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 30_000
    })
    if (result.status === 0 && result.stdout.trim()) return JSON.parse(result.stdout)
  }
  return { status: 'not-checked', signer: null }
}

try {
  const response = await fetch(release.asset.url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'ProjectWorshipWebsite-installer-verification' },
    signal: AbortSignal.timeout(180_000)
  })
  if (!response.ok || !response.body) throw new Error(`Installer download returned ${response.status}`)
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength !== release.asset.size) {
    throw new Error(`Installer Content-Length ${declaredLength} did not match ${release.asset.size}`)
  }

  await pipeline(Readable.fromWeb(response.body), createWriteStream(filename, { flags: 'wx' }))
  const downloaded = await stat(filename)
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filename)) hash.update(chunk)
  const sha256 = hash.digest('hex')
  if (downloaded.size !== release.asset.size) throw new Error(`Downloaded size ${downloaded.size} did not match ${release.asset.size}`)
  if (sha256 !== release.asset.sha256) throw new Error(`Downloaded SHA-256 ${sha256} did not match the accepted release record`)

  const securityDirectory = await peSecurityDirectory(filename)
  const signature = securityDirectory.size === 0
    ? { status: 'NotSigned', signer: null }
    : windowsAuthenticodeStatus(filename)
  console.log(JSON.stringify({
    verifiedAt: new Date().toISOString(),
    startedAt,
    version: release.version,
    filename: release.asset.name,
    bytes: downloaded.size,
    sha256,
    authenticodeStatus: signature.status,
    signer: signature.signer || null,
    authenticodeTableBytes: securityDirectory.size
  }))
} finally {
  await rm(resolvedDirectory, { recursive: true, force: true })
}
