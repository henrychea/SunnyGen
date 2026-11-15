export interface AvatarReference {
  id: string
  name: string
  assetIds: string[]
}

export interface ReferenceAvatar extends AvatarReference {
  url: string
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
  return { id: assetIds[0] as string, name: source.name, assetIds }
}
