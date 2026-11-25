import { deleteAsset, getAsset, listGenerations, listStudioItems } from '@sunnygen/db'
import { DERIVED_AVATAR_KEYS } from '~/lib/avatar-derived'
import { removeAssetFile } from './media.server'

const SHEET_MIN_SIDE = 4096

/** The sheet only has to be 4096 on its long side; the panels are square 4K. */
export function assertSheetSize(width: number | null, height: number | null): void {
  if (Math.max(width ?? 0, height ?? 0) < SHEET_MIN_SIDE) {
    throw new Error(
      `The reference sheet must be at least ${SHEET_MIN_SIDE} px on its long side (this one is ${width ?? '?'} x ${height ?? '?'}).`,
    )
  }
}

/**
 * A save that seals a different panel must not inherit anything that was derived from the old
 * one. Avatars no longer show crops or boards, but older rows still carry them, and dropping
 * them here is what lets their files be deleted instead of being referenced forever.
 */
export function dataForPanelChange(
  data: Record<string, unknown>,
  panelsChanged: boolean,
): Record<string, unknown> {
  if (!panelsChanged) return data
  const next = { ...data }
  for (const key of DERIVED_AVATAR_KEYS) delete next[key]
  return next
}

/** Every asset an avatar cut for itself: the crops, the region tiles and the composed boards. */
export function derivedAssetIds(data: Record<string, unknown>): string[] {
  const ids = new Set<string>()
  for (const key of DERIVED_AVATAR_KEYS) {
    const value = data[key]
    if (!value || typeof value !== 'object') continue
    const entries = Array.isArray(value) ? value : Object.values(value)
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue
      const assetId = (entry as { assetId?: unknown }).assetId
      if (typeof assetId === 'string' && assetId.length > 0) ids.add(assetId)
    }
  }
  return [...ids]
}

/**
 * Deletes the derived files an avatar made for itself once nothing references them. Only source
 * 'studio' derived assets are candidates: a user's uploaded original ('upload') is never
 * touched. A tile another item or a generation still points at stays.
 */
export async function deleteDerivedAssets(
  itemId: string,
  oldData: Record<string, unknown>,
): Promise<string[]> {
  const candidates = derivedAssetIds(oldData)
  if (candidates.length === 0) return []
  const otherItems = listStudioItems().filter((item) => item.id !== itemId)
  const generations = listGenerations()
  const referenced = (id: string) => {
    if (otherItems.some((item) => JSON.stringify(item.data).includes(id))) return true
    return generations.some(
      (generation) => generation.inputAssetIds.includes(id) || generation.outputAssetIds.includes(id),
    )
  }

  const deleted: string[] = []
  for (const id of candidates) {
    const asset = getAsset(id)
    if (!asset || asset.source !== 'studio') continue
    if (referenced(id)) continue
    await removeAssetFile(id)
    if (deleteAsset(id)) deleted.push(id)
  }
  return deleted
}
