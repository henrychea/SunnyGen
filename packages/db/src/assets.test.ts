import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import type { AssetSource } from '@sunnygen/core'

const dataDir = mkdtempSync(join(tmpdir(), 'sunnygen-assets-'))
process.env.SUNNYGEN_DATA_DIR = dataDir

const { closeDb } = await import('./database')
const { createAsset, sanitizeAssetName, selectStudioUploads, uniqueAssetName } =
  await import('./repositories/assets')

after(() => {
  closeDb()
  rmSync(dataDir, { recursive: true, force: true })
})

let counter = 0

function asset(source: AssetSource, options: { sha256?: string; name?: string; unique?: boolean } = {}) {
  counter += 1
  return createAsset({
    kind: 'image',
    mime: 'image/png',
    byteSize: 16,
    sha256: options.sha256 ?? `sha-${counter}`,
    source,
    path: `2026/11/${counter}.png`,
    name: options.name ?? null,
    unique: options.unique ?? false,
  })
}

test('a user upload always inserts a new row, even for identical bytes', () => {
  const first = asset('upload', { sha256: 'sha-same', name: 'door-photo.jpg', unique: true })
  const second = asset('upload', { sha256: 'sha-same', name: 'door-photo.jpg', unique: true })

  assert.notEqual(second.id, first.id)
  assert.equal(first.name, 'door-photo.jpg')
  assert.match(
    String(second.name),
    /^door-photo-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/,
  )
})

test('internal callers still reuse the asset for the same bytes', () => {
  const first = asset('generated', { sha256: 'sha-shared' })
  const second = asset('generated', { sha256: 'sha-shared' })
  assert.equal(second.id, first.id)
  assert.equal(second.name, null)
})

test('a name is only set when the caller passes one', () => {
  assert.equal(asset('upload', { name: 'with-name.png', unique: true }).name, 'with-name.png')
  assert.equal(asset('upload', { unique: true }).name, null)
})

test('names are sanitised and a taken name gets a uuid before the extension', () => {
  assert.equal(sanitizeAssetName('../../etc/passwd'), 'passwd')
  assert.equal(sanitizeAssetName('  spaces  .png '), 'spaces  .png')
  assert.equal(sanitizeAssetName(''), 'upload')
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
  assert.match(uniqueAssetName('door-photo.jpg'), new RegExp(`^door-photo-${uuid}\\.jpg$`))
  assert.match(uniqueAssetName('noext'), new RegExp(`^noext-${uuid}$`))
  assert.notEqual(uniqueAssetName('door-photo.jpg'), uniqueAssetName('door-photo.jpg'))
})

test('the studio upload selection skips crop assets', () => {
  const rows = [
    { id: 'studio-upload', source: 'studio' },
    { id: 'crop', source: 'studio' },
    { id: 'render', source: 'generated' },
  ]
  assert.deepEqual(selectStudioUploads(rows, new Set(['crop'])), ['studio-upload'])
})
