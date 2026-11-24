import type { AvatarCrop, AvatarLora, AvatarProfile } from '@sunnygen/core'

export interface ReferenceItem {
  id: string
  name: string
  url: string
  kind?: 'image' | 'video'
  assetIds?: string[]
  sheetAssetId?: string | null
  avatar?: boolean
  avatarId?: string
  lora?: AvatarLora | null
  profile?: AvatarProfile | null
  crops?: AvatarCrop[]
  byteSize?: number
  width?: number | null
  height?: number | null
}

export function referenceImageCount(items: ReferenceItem[]): number {
  return items.reduce((total, item) => total + (item.assetIds?.length ?? 1), 0)
}

export function appendReferences(
  current: ReferenceItem[],
  items: ReferenceItem[],
  max: number,
): ReferenceItem[] {
  const next = [...current]
  let used = referenceImageCount(next)
  for (const item of items) {
    if (next.some((entry) => entry.id === item.id)) continue
    const count = item.assetIds?.length ?? 1
    if (used + count > max) continue
    next.push(item)
    used += count
  }
  return next
}

export function trimReferences(items: ReferenceItem[], max: number): ReferenceItem[] {
  const result: ReferenceItem[] = []
  let used = 0
  for (const item of items) {
    const count = item.assetIds?.length ?? 1
    if (used + count > max) continue
    result.push(item)
    used += count
  }
  return result
}
