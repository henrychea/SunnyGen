import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import sharp from 'sharp'

const dataDir = mkdtempSync(join(tmpdir(), 'sunnygen-media-nsfw-'))
process.env.SUNNYGEN_DATA_DIR = dataDir
process.env.SUNNYGEN_MEDIA_DIR = join(dataDir, 'media')

const { closeDb, getAsset, listAssets } = await import('@sunnygen/db')
const { openAssetFile, openAssetThumbFile, storeBuffer } = await import('./media.server')

after(() => {
  closeDb()
  rmSync(dataDir, { recursive: true, force: true })
})

async function png(red = 20): Promise<Buffer> {
  return sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: red, g: 40, b: 60 } },
  })
    .png()
    .toBuffer()
}

function ids(rows: Array<{ id: string }>): string[] {
  return rows.map((row) => row.id)
}

async function streamBytes(stream: ReadableStream): Promise<number> {
  const reader = stream.getReader()
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return total
    total += value.byteLength
  }
}

/**
 * `/api/media/$id` answers 404 for an asset these two functions refuse, so this is the gate the
 * route relies on: a safe-mode request cannot reach the bytes or a thumbnail of an NSFW asset.
 */
test('the media gate refuses NSFW bytes and thumbs in safe mode', async () => {
  const asset = await storeBuffer({
    buffer: await png(),
    mime: 'image/png',
    kind: 'image',
    source: 'generated',
    nsfw: true,
  })
  assert.equal(asset.nsfw, true)
  assert.equal(getAsset(asset.id), null)

  assert.equal(await openAssetFile(asset.id), null)
  assert.equal(await openAssetThumbFile(asset.id, 160), null)

  const file = await openAssetFile(asset.id, undefined, { includeNsfw: true })
  assert.ok(file, 'NSFW mode must serve the bytes')
  assert.equal(file.mime, 'image/png')
  assert.ok((await streamBytes(file.stream)) > 0)

  const thumb = await openAssetThumbFile(asset.id, 160, { includeNsfw: true })
  assert.ok(thumb, 'NSFW mode must serve a thumbnail')
  assert.equal(thumb.mime, 'image/webp')
  assert.ok((await streamBytes(thumb.stream)) > 0)
})

test('a safe asset keeps opening without any mode option', async () => {
  const asset = await storeBuffer({
    buffer: await png(),
    mime: 'image/png',
    kind: 'image',
    source: 'generated',
    unique: true,
  })
  assert.equal(asset.nsfw, false)
  const file = await openAssetFile(asset.id)
  assert.ok(file)
  assert.ok((await streamBytes(file.stream)) > 0)
})

test('identical bytes stored safe then NSFW stay two rows and the NSFW one is hidden', async () => {
  const buffer = await png(120)

  const safe = await storeBuffer({ buffer, mime: 'image/png', kind: 'image', source: 'generated' })
  const hidden = await storeBuffer({
    buffer,
    mime: 'image/png',
    kind: 'image',
    source: 'generated',
    nsfw: true,
  })

  assert.notEqual(hidden.id, safe.id, 'matching bytes must not reuse the safe row')
  assert.equal(safe.nsfw, false)
  assert.equal(hidden.nsfw, true)
  assert.equal(safe.sha256, hidden.sha256)

  assert.equal(getAsset(hidden.id), null)
  assert.equal(getAsset(safe.id)?.id, safe.id)
  assert.equal(getAsset(hidden.id, { includeNsfw: true })?.nsfw, true)

  const safeList = ids(listAssets({ limit: 1000 }))
  assert.ok(safeList.includes(safe.id))
  assert.equal(safeList.includes(hidden.id), false)

  assert.ok(await openAssetFile(safe.id))
  assert.equal(await openAssetFile(hidden.id), null)
})

test('identical bytes stored NSFW then safe also stay two rows', async () => {
  const buffer = await png(121)

  const hidden = await storeBuffer({
    buffer,
    mime: 'image/png',
    kind: 'image',
    source: 'generated',
    nsfw: true,
  })
  const safe = await storeBuffer({ buffer, mime: 'image/png', kind: 'image', source: 'generated' })

  assert.notEqual(safe.id, hidden.id, 'a safe write must not adopt the NSFW row')
  assert.equal(safe.nsfw, false)
  assert.equal(hidden.nsfw, true)

  assert.equal(getAsset(safe.id)?.nsfw, false)
  assert.equal(getAsset(hidden.id), null)
  assert.equal(await openAssetFile(hidden.id), null)
  assert.ok(await openAssetFile(safe.id))
})
