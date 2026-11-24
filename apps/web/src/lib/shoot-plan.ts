export interface ShootCombination {
  key: string
  avatarId: string
  garmentId: string
  sceneId: string | null
  poseId: string | null
}

export interface ShootPlan {
  cells: ShootCombination[]
  total: number
  dropped: number
}

export interface ShootPlanInput {
  avatarId: string | null
  garmentIds: readonly string[]
  sceneIds: readonly string[]
  poseIds: readonly string[]
  max: number
}

function combinationKey(garmentId: string, sceneId: string | null, poseId: string | null): string {
  return `${garmentId}|${sceneId ?? 'none'}|${poseId ?? 'none'}`
}

/**
 * Avatar x garment x scene x pose, in that order: garments outermost, poses
 * innermost. A missing scene or pose list means that step is skipped.
 */
export function shootCombinations(input: ShootPlanInput): ShootPlan {
  if (!input.avatarId || input.garmentIds.length === 0) {
    return { cells: [], total: 0, dropped: 0 }
  }
  const scenes: Array<string | null> = input.sceneIds.length > 0 ? [...input.sceneIds] : [null]
  const poses: Array<string | null> = input.poseIds.length > 0 ? [...input.poseIds] : [null]
  const total = input.garmentIds.length * scenes.length * poses.length
  const limit = Math.max(1, Math.floor(input.max))

  const cells: ShootCombination[] = []
  for (const garmentId of input.garmentIds) {
    for (const sceneId of scenes) {
      for (const poseId of poses) {
        if (cells.length >= limit) break
        cells.push({
          key: combinationKey(garmentId, sceneId, poseId),
          avatarId: input.avatarId,
          garmentId,
          sceneId,
          poseId,
        })
      }
      if (cells.length >= limit) break
    }
    if (cells.length >= limit) break
  }

  return { cells, total, dropped: total - cells.length }
}
