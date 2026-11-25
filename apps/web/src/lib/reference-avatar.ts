import {
  parseAvatarBoards,
  parseAvatarCrops,
  parseAvatarLora,
  parseAvatarProfile,
  type AvatarBoard,
  type AvatarCrop,
  type AvatarLora,
  type AvatarProfile,
} from '@sunnygen/core'

export interface AvatarReference {
  id: string
  avatarId: string
  name: string
  assetIds: string[]
  sheetAssetId: string | null
  facePanelAssetId: string | null
  bodyPanelAssetId: string | null
  lora: AvatarLora | null
  profile: AvatarProfile | null
  crops: AvatarCrop[] | undefined
  boards: AvatarBoard[] | undefined
}

export interface ReferenceAvatar extends AvatarReference {
  url: string
  byteSize?: number
  width?: number | null
  height?: number | null
}

export interface AvatarSource {
  id: string
  name: string
  assetId: string | null
  data: Record<string, unknown>
}

/**
 * Turns a saved avatar into a generation reference. The three whole images ride along: the face
 * panel on `data.facePanelAssetId`, the body panel on the item's own asset and the reference
 * sheet on `data.characterSheetAssetId`. The id is the sheet asset id used for the picker
 * preview, and `assetIds` lists every whole image the item holds so the picker counts them.
 */
export function referenceAvatar(source: AvatarSource): AvatarReference | null {
  const sheet = source.data.characterSheetAssetId
  const cleanSheet = typeof sheet === 'string' && sheet.length > 0 ? sheet : null
  const facePanel = asAssetId(source.data.facePanelAssetId)
  const bodyPanel = source.assetId
  const assetIds = [...new Set([facePanel, bodyPanel, cleanSheet].filter((id): id is string => Boolean(id)))]
  if (assetIds.length === 0) return null
  return {
    id: cleanSheet ?? (assetIds[0] as string),
    avatarId: source.id,
    name: source.name,
    assetIds,
    sheetAssetId: cleanSheet,
    facePanelAssetId: facePanel,
    bodyPanelAssetId: bodyPanel,
    lora: parseAvatarLora(source.data.lora),
    profile: parseAvatarProfile(source.data.avatarProfile),
    crops: parseAvatarCrops(source.data.crops),
    boards: parseAvatarBoards(source.data.boards),
  }
}

function asAssetId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}
