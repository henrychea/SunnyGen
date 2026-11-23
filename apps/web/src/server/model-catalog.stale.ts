import type { ModelCatalogEntry } from './model-catalog.types'

export const CATALOG_VERSION = 4

export interface StoredCatalogEntryShape {
  kind: ModelCatalogEntry['kind']
  supportsImages?: boolean
  supportsText?: boolean
  maxImages?: number
}

export interface StoredCatalogShape {
  version?: number
  entries: StoredCatalogEntryShape[]
}

export interface StoredEntryCapabilities {
  supportsImages: boolean
  supportsText: boolean
  maxImages: number
}

export function storedEntryCapabilities(entry: StoredCatalogEntryShape): StoredEntryCapabilities {
  return {
    supportsImages: entry.supportsImages === true,
    supportsText: entry.supportsText ?? true,
    maxImages: entry.maxImages ?? (entry.kind === 'image' ? 0 : 2),
  }
}

export function catalogNeedsResync(stored: StoredCatalogShape | null): boolean {
  if (!stored) return false
  if ((stored.version ?? 0) < CATALOG_VERSION) return true
  return stored.entries.some(
    (entry) => typeof entry.supportsImages !== 'boolean' || typeof entry.maxImages !== 'number',
  )
}
