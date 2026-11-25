import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { test } from 'node:test'
import sharp from 'sharp'
import { DEFAULT_IMAGE_LIMITS } from '@sunnygen/core'
import { normalizeAsset } from './normalize'
import { SUNRA_IMAGE_LIMITS } from './sunra/limits'
import type { ProviderAsset } from './types'

function noise(width: number, height: number, channels: 3 | 4): Promise<Buffer> {
  return sharp(randomBytes(width * height * channels), { raw: { width, height, channels } })
    .png()
    .toBuffer()
}

async function asset(buffer: Buffer, mime: string, fileName: string): Promise<ProviderAsset> {
  return { buffer, mime, fileName }
}

test('an oversized reference is downscaled to the longest side and re-encoded', async () => {
  const source = await asset(await noise(5000, 800, 3), 'image/png', 'sheet.png')
  const normalized = await normalizeAsset(source)

  const metadata = await sharp(normalized.buffer).metadata()
  assert.equal(normalized.mime, 'image/jpeg')
  assert.match(
    normalized.fileName,
    /^sheet-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-\d{8}-\d{6}\.jpg$/,
  )
  assert.ok((metadata.width ?? 0) <= DEFAULT_IMAGE_LIMITS.side)
  assert.ok((metadata.height ?? 0) <= DEFAULT_IMAGE_LIMITS.side)
  assert.ok(normalized.buffer.byteLength <= DEFAULT_IMAGE_LIMITS.bytes)
  assert.ok(Math.abs((metadata.width ?? 0) / (metadata.height ?? 1) - 5000 / 800) < 0.02)
})

test('a resized copy gets its own name so it never shadows the original at the provider', async () => {
  const buffer = await noise(5000, 800, 3)
  const first = await normalizeAsset(await asset(buffer, 'image/png', 'character sheet.png'))
  const second = await normalizeAsset(await asset(buffer, 'image/png', 'character sheet.png'))

  assert.match(first.fileName, /^character sheet-[0-9a-f-]{36}-\d{8}-\d{6}\.jpg$/)
  assert.notEqual(first.fileName, second.fileName)
  // Same bytes, different names: the upload cache key is content, not the name.
  assert.ok(first.buffer.equals(second.buffer))
})

test('a resized copy of an alpha sheet keeps the webp extension', async () => {
  const source = await asset(await noise(5000, 400, 4), 'image/png', 'panel.png')
  const normalized = await normalizeAsset(source)
  const extension = normalized.mime === 'image/webp' ? 'webp' : 'png'
  assert.match(normalized.fileName, new RegExp(`^panel-[0-9a-f-]{36}-\\d{8}-\\d{6}\\.${extension}$`))
})

test('the byte limit is met by shrinking until the encode fits', async () => {
  const limits = { bytes: 150_000, side: 4096, pixels: 16_800_000 }
  const source = await asset(await noise(1200, 1200, 3), 'image/png', 'garment.png')
  assert.ok(source.buffer.byteLength > limits.bytes)

  const normalized = await normalizeAsset(source, limits)
  const metadata = await sharp(normalized.buffer).metadata()
  assert.ok(normalized.buffer.byteLength <= limits.bytes)
  assert.ok((metadata.width ?? 0) < 1200)
  assert.equal(metadata.width, metadata.height)
})

test('a reference that already fits is passed through byte for byte', async () => {
  const buffer = await noise(64, 64, 3)
  const source = await asset(buffer, 'image/png', 'small.png')

  const normalized = await normalizeAsset(source)
  assert.equal(normalized.buffer, source.buffer)
  assert.equal(normalized.mime, 'image/png')
  assert.equal(normalized.fileName, 'small.png')
})

test('transparency survives normalization of an oversized sheet', async () => {
  const source = await asset(await noise(5000, 400, 4), 'image/png', 'panel.png')
  const normalized = await normalizeAsset(source)

  const metadata = await sharp(normalized.buffer).metadata()
  assert.ok(['image/png', 'image/webp'].includes(normalized.mime))
  assert.equal(metadata.hasAlpha, true)
})

test('EXIF orientation is applied before the resize', async () => {
  const limits = { bytes: 10 * 1024 * 1024, side: 1200, pixels: 16_800_000 }
  const buffer = await sharp(randomBytes(2400 * 1200 * 3), {
    raw: { width: 2400, height: 1200, channels: 3 },
  })
    .jpeg({ quality: 95 })
    .withMetadata({ orientation: 6 })
    .toBuffer()

  const normalized = await normalizeAsset(await asset(buffer, 'image/jpeg', 'portrait.jpg'), limits)
  const metadata = await sharp(normalized.buffer).metadata()
  assert.ok((metadata.height ?? 0) > (metadata.width ?? 0))
  assert.ok((metadata.height ?? 0) <= limits.side)
})

test('non-image payloads are left alone', async () => {
  const source = { buffer: Buffer.from('not an image'), mime: 'application/zip', fileName: 'images.zip' }
  assert.equal(await normalizeAsset(source), source)
})

test('a ~7 MB PNG is re-encoded under the Sunra input limit without shrinking it', async () => {
  // 1536 x 1536 of noise lands around 6.8 MB, the size band that gets rejected upstream.
  const source = await asset(await noise(1536, 1536, 3), 'image/png', 'board.png')
  assert.ok(source.buffer.byteLength > SUNRA_IMAGE_LIMITS.bytes)

  const normalized = await normalizeAsset(source, SUNRA_IMAGE_LIMITS)

  assert.equal(normalized.mime, 'image/jpeg')
  assert.ok(normalized.buffer.byteLength <= SUNRA_IMAGE_LIMITS.bytes)
  // Quality 80 alone was enough: the dimensions are untouched.
  const metadata = await sharp(normalized.buffer).metadata()
  assert.equal(metadata.width, 1536)
  assert.equal(metadata.height, 1536)
})

test('a board that carries an opaque alpha channel is encoded as JPEG, not WebP', async () => {
  // composeBoard composites onto a 3-channel white canvas, but sharp still writes an alpha
  // channel; nothing in it is actually transparent, so the board must take the JPEG path.
  const base = await sharp({ create: { width: 2048, height: 2048, channels: 3, background: '#ffffff' } })
    .png()
    .toBuffer()
  // Full-size detail so the board is over the limit; otherwise normalizeAsset passes it through.
  const detail = await sharp(randomBytes(2048 * 2048 * 3), {
    raw: { width: 2048, height: 2048, channels: 3 },
  })
    .png()
    .toBuffer()
  const board = await sharp(base)
    .composite([{ input: detail, top: 0, left: 0 }])
    .png()
    .toBuffer()
  assert.ok(board.byteLength > SUNRA_IMAGE_LIMITS.bytes)
  assert.equal((await sharp(board).metadata()).hasAlpha, true)

  const normalized = await normalizeAsset(
    await asset(board, 'image/png', 'face-board.png'),
    SUNRA_IMAGE_LIMITS,
  )

  assert.equal(normalized.mime, 'image/jpeg')
  assert.ok(normalized.buffer.byteLength <= SUNRA_IMAGE_LIMITS.bytes)
})
