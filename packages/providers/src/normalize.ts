import sharp from 'sharp'
import type { ProviderAsset } from './types'

export interface ImageLimits {
  bytes: number
  side: number
  pixels: number
}

export const DEFAULT_IMAGE_LIMITS: ImageLimits = {
  bytes: 10 * 1024 * 1024,
  side: 4096,
  pixels: 16_800_000,
}

const ATTEMPTS = 6
const SHRINK = 0.8
const JPEG_QUALITY = 90
const WEBP_QUALITY = 90
const PNG_COMPRESSION = 9

function reencoded(asset: ProviderAsset, buffer: Buffer, mime: string): ProviderAsset {
  const base = asset.fileName.replace(/\.[^./\\]+$/, '') || 'image'
  const extension = mime === 'image/jpeg' ? 'jpg' : (mime.split('/')[1] ?? 'bin')
  return { buffer, mime, fileName: `${base}.${extension}` }
}

async function encode(asset: ProviderAsset, alpha: boolean, side: number): Promise<ProviderAsset[]> {
  const pipeline = sharp(asset.buffer)
    .rotate()
    .resize({ width: side, height: side, fit: 'inside', withoutEnlargement: true })
  if (!alpha) {
    const jpeg = await pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer()
    return [reencoded(asset, jpeg, 'image/jpeg')]
  }
  const png = await pipeline.clone().png({ compressionLevel: PNG_COMPRESSION }).toBuffer()
  const webp = await pipeline.clone().webp({ quality: WEBP_QUALITY }).toBuffer()
  return [reencoded(asset, png, 'image/png'), reencoded(asset, webp, 'image/webp')]
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
  const withinLimits =
    width > 0 &&
    height > 0 &&
    width <= limits.side &&
    height <= limits.side &&
    width * height <= limits.pixels &&
    asset.buffer.byteLength <= limits.bytes
  if (withinLimits) return asset

  let side = Math.min(limits.side, Math.max(width, height))
  let smallest: ProviderAsset | null = null
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const candidates = await encode(asset, Boolean(metadata.hasAlpha), side)
    const fits = candidates.find((candidate) => candidate.buffer.byteLength <= limits.bytes)
    if (fits) return fits
    smallest = candidates.at(-1) ?? smallest
    side = Math.round(side * SHRINK)
  }
  return smallest ?? asset
}
