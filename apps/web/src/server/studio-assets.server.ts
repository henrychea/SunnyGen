import {
  deleteAsset,
  deleteStudioItem,
  getStudioItem,
  listStudioItems,
  studioItemAssetIds,
} from '@sunnygen/db'
import { removeAssetFile } from './media.server'

/**
 * Deletes a studio item and every file it owns, rows included. A file another studio item still
 * points at stays. A generation that used a deleted file as an input keeps its prompt and output;
 * its references list shows the missing input as a placeholder.
 */
export async function deleteStudioItemWithAssets(id: string): Promise<{ deletedAssets: number }> {
  const item = getStudioItem(id)
  if (!item) return { deletedAssets: 0 }
  const owned = studioItemAssetIds(item)
  deleteStudioItem(id)
  // Read the remaining ids after the delete: an item saved from the same upload shares its file.
  const shared = new Set(listStudioItems().flatMap((entry) => studioItemAssetIds(entry)))

  let deletedAssets = 0
  for (const assetId of owned) {
    if (shared.has(assetId)) continue
    await removeAssetFile(assetId)
    if (deleteAsset(assetId)) deletedAssets += 1
  }
  return { deletedAssets }
}
