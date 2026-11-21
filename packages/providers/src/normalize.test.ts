import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { test } from 'node:test'
import sharp from 'sharp'
import { DEFAULT_IMAGE_LIMITS, normalizeAsset } from './normalize'
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
  assert.equal(normalized.fileName, 'sheet.jpg')
  assert.ok((metadata.width ?? 0) <= DEFAULT_IMAGE_LIMITS.side)
  assert.ok((metadata.height ?? 0) <= DEFAULT_IMAGE_LIMITS.side)
  assert.ok(normalized.buffer.byteLength <= DEFAULT_IMAGE_LIMITS.bytes)
  assert.ok(Math.abs((metadata.width ?? 0) / (metadata.height ?? 1) - 5000 / 800) < 0.02)
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
