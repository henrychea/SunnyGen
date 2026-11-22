export interface StudioReferenceCounts {
  garmentCount: number
  hasPose: boolean
  hasScene: boolean
  avatarCount?: number
}

export interface StudioReferenceFit extends StudioReferenceCounts {
  removed: number
}

export function trimStudioReferences(
  counts: StudioReferenceCounts,
  maxReferences: number,
): StudioReferenceFit {
  let garmentCount = counts.garmentCount
  let hasPose = counts.hasPose
  let hasScene = counts.hasScene
  let removed = 0
  const total = () => (counts.avatarCount ?? 1) + garmentCount + (hasPose ? 1 : 0) + (hasScene ? 1 : 0)

  while (total() > maxReferences) {
    if (hasScene) hasScene = false
    else if (hasPose) hasPose = false
    else if (garmentCount > 0) garmentCount -= 1
    else break
    removed += 1
  }

  return { garmentCount, hasPose, hasScene, removed }
}
