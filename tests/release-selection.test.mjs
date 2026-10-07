import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { selectAlphaRelease } from '../site/release-selection.js'

function release(version, overrides = {}) {
  const tag = `v${version}`
  const name = `Project-Worship-${version}-setup.exe`
  return {
    tag_name: tag,
    name: `Project Worship ${version}`,
    draft: false,
    prerelease: true,
    published_at: '2026-10-07T17:57:16Z',
    html_url: `https://github.com/Rivaldo1123/ProjectWorship-updates/releases/tag/${tag}`,
    body: '## Highlights\n- Safer release\n## Limitations\n- Alpha software',
    assets: [
      {
        name,
        size: 100,
        state: 'uploaded',
        digest: `sha256:${'a'.repeat(64)}`,
        browser_download_url: `https://github.com/Rivaldo1123/ProjectWorship-updates/releases/download/${tag}/${name}`
      }
    ],
    ...overrides
  }
}

test('selects alpha versions using numeric ordering', () => {
  const selected = selectAlphaRelease([release('0.1.0-alpha.9'), release('0.1.0-alpha.10')])
  assert.equal(selected.version, '0.1.0-alpha.10')
})

test('excludes drafts and keeps stable releases out of alpha', () => {
  const selected = selectAlphaRelease([
    release('0.1.0-alpha.12', { draft: true }),
    release('0.1.0-alpha.11'),
    release('0.2.0-alpha.1', { prerelease: false, tag_name: 'v0.2.0' })
  ])
  assert.equal(selected.version, '0.1.0-alpha.11')
})

test('requires exactly one expected Windows installer', () => {
  const candidate = release('0.1.0-alpha.5')
  candidate.assets = []
  assert.throws(() => selectAlphaRelease([candidate]), /complete verified Windows installer/)
})

test('rejects a missing digest', () => {
  const candidate = release('0.1.0-alpha.5')
  delete candidate.assets[0].digest
  assert.throws(() => selectAlphaRelease([candidate]), /complete verified Windows installer/)
})

test('rejects an asset URL outside the intended repository', () => {
  const candidate = release('0.1.0-alpha.5')
  candidate.assets[0].browser_download_url = 'https://example.com/setup.exe'
  assert.throws(() => selectAlphaRelease([candidate]), /complete verified Windows installer/)
})

test('offline build preserves the checked-in verified fallback', async () => {
  const projectRoot = fileURLToPath(new URL('..', import.meta.url))
  const directory = await mkdtemp(join(projectRoot, '.test-build-'))
  try {
    const result = spawnSync(process.execPath, ['scripts/build.mjs', '--offline'], {
      cwd: projectRoot,
      env: { ...process.env, BUILD_OUTPUT: directory },
      encoding: 'utf8'
    })
    assert.equal(result.status, 0, result.stderr)
    const manifest = JSON.parse(await readFile(join(directory, 'data', 'release.json'), 'utf8'))
    assert.equal(manifest.sourceStatus, 'verified-fallback')
    assert.equal(manifest.version, '0.1.0-alpha.5')
    assert.equal(manifest.asset.sha256, 'c6a9bc5b9d3bf3ad4b59aad5dcb56babaad2e0b273883fcc4948744f2d6af832')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
