import { parseAvatarLora, type AvatarLora } from '@sunnygen/core'

export interface AvatarReference {
  id: string
  avatarId: string
  name: string
  assetIds: string[]
  lora: AvatarLora | null
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
 * Turns a saved avatar into a generation reference. Both the clean character
 * sheet and the uploaded 4x4 panel are required: the sheet drives face and
 * identity, the panel drives body proportions and alternate angles. The id is
 * the sheet asset id used for the picker preview.
 */
export function referenceAvatar(source: AvatarSource): AvatarReference | null {
  const sheet = source.data.characterSheetAssetId
  const cleanSheet = typeof sheet === 'string' && sheet.length > 0 ? sheet : null
  const assetIds = [...new Set([cleanSheet, source.assetId].filter((id): id is string => Boolean(id)))]
  if (assetIds.length === 0) return null
  return {
    id: assetIds[0] as string,
    avatarId: source.id,
    name: source.name,
    assetIds,
    lora: parseAvatarLora(source.data.lora),
  }
}
