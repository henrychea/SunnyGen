import { createHash } from 'node:crypto'
import type { ProviderId } from '@sunnygen/core'
import { normalizeAsset } from './normalize'
import { ProviderError, type AdapterContext, type ProviderAsset } from './types'

export const FAL_UPLOAD_TTL = 5 * 24 * 60 * 60_000
export const SUNRA_UPLOAD_TTL: number | null = null

export function assetSha256(asset: ProviderAsset): string {
  return createHash('sha256').update(asset.buffer).digest('hex')
}

export function cachedUpload(context: AdapterContext, provider: ProviderId, hash: string): string | null {
  const cache = context.uploads
  if (!cache) return null
  const entry = cache.get(provider, hash)
  if (!entry) return null
  if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
    cache.remove(provider, hash)
    return null
  }
  return entry.url
}

export function rememberUpload(
  context: AdapterContext,
  provider: ProviderId,
  hash: string,
  url: string,
  ttl: number | null,
): void {
  context.uploads?.save(provider, hash, url, ttl === null ? null : Date.now() + ttl)
}

export async function forgetUploads(
  context: AdapterContext,
  provider: ProviderId,
  assets: ProviderAsset[],
): Promise<void> {
  if (!context.uploads) return
  for (const asset of assets) {
    context.uploads.remove(provider, assetSha256(await normalizeAsset(asset)))
  }
}

const URL_REJECTIONS = new Set([400, 404, 410, 422])

export function isUrlRejection(error: unknown): boolean {
  return error instanceof ProviderError && error.status !== null && URL_REJECTIONS.has(error.status)
}
