import { randomUUID } from 'node:crypto'
import { DEFAULT_IMAGE_LIMITS, isOversizedImage, type ImageLimits } from '@sunnygen/core'
import sharp from 'sharp'
import type { ProviderAsset } from './types'

const ATTEMPTS = 6
const SHRINK = 0.8
// Send-time only: the stored original is never touched.
const JPEG_QUALITY = 80
const WEBP_QUALITY = 90
const PNG_COMPRESSION = 9

/**
 * A resized copy keeps the original stem but gets its own name, so a provider never sees two
 * different files under one name and a resized copy can't shadow the original at the provider.
 */
function reencoded(asset: ProviderAsset, buffer: Buffer, mime: string): ProviderAsset {
  const base = asset.fileName.replace(/\.[^./\\]+$/, '') || 'image'
  const extension = mime === 'image/jpeg' ? 'jpg' : (mime.split('/')[1] ?? 'bin')
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
  return { buffer, mime, fileName: `${base}-${randomUUID()}-${stamp}.${extension}` }
}

async function encode(asset: ProviderAsset, alpha: boolean, side: number): Promise<ProviderAsset[]> {
  const pipeline = sharp(asset.buffer)
    .rotate()
    .resize({ width: side, height: side, fit: 'inside', withoutEnlargement: true })
  if (!alpha) {
    // An alpha channel that is fully opaque (composited boards carry one) still goes to JPEG.
    const jpeg = await pipeline
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer()
    return [reencoded(asset, jpeg, 'image/jpeg')]
  }
  const png = await pipeline.clone().png({ compressionLevel: PNG_COMPRESSION }).toBuffer()
  const webp = await pipeline.clone().webp({ quality: WEBP_QUALITY }).toBuffer()
  return [reencoded(asset, png, 'image/png'), reencoded(asset, webp, 'image/webp')]
}

/** hasAlpha only says a channel exists; a composited board is fully opaque and still wants JPEG. */
async function hasRealTransparency(buffer: Buffer, hasAlpha: boolean): Promise<boolean> {
  if (!hasAlpha) return false
  const stats = await sharp(buffer)
    .stats()
    .catch(() => null)
  const alpha = stats?.channels[3]
  return Boolean(alpha && alpha.min < 255)
}

export async function normalizeAsset(
  asset: ProviderAsset,
  limits: ImageLimits = DEFAULT_IMAGE_LIMITS,
): Promise<ProviderAsset> {
  if (!asset.mime.startsWith('image/')) return asset
  const metadata = await sharp(asset.buffer)
    .metadata()
    .catch(() => null)
  if (!metadata) return asset

  const width = metadata.autoOrient.width
  const height = metadata.autoOrient.height
  const oversized = isOversizedImage({ bytes: asset.buffer.byteLength, width, height }, limits)
  if (width > 0 && height > 0 && !oversized) return asset

  const alpha = await hasRealTransparency(asset.buffer, Boolean(metadata.hasAlpha))
  let side = Math.min(limits.side, Math.max(width, height))
  let smallest: ProviderAsset | null = null
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const candidates = await encode(asset, alpha, side)
    const fits = candidates.find((candidate) => candidate.buffer.byteLength <= limits.bytes)
    if (fits) return fits
    smallest = candidates.at(-1) ?? smallest
    side = Math.round(side * SHRINK)
  }
  return smallest ?? asset
}
