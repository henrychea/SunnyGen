import type { AvatarModelFamily } from './avatar-profile'

export const AVATAR_CROP_ROLES = ['face-front', 'face-three-quarter', 'body-front'] as const
export type AvatarCropRole = (typeof AVATAR_CROP_ROLES)[number]

export interface AvatarCrop {
  role: AvatarCropRole
  assetId: string
  width: number
  height: number
}

export const PANEL_GRID = 4
export const PANEL_CROP_MIN_SIDE = 1024

export const AVATAR_CROP_CELLS: Record<AvatarCropRole, { row: number; column: number; label: string }> = {
  // The panel prompt puts the four body angles in row 0 and the four faces in row 1.
  // Reading a face from row 0 sends the model a back view and no face at all.
  'face-front': { row: 1, column: 0, label: 'Front face' },
  'face-three-quarter': { row: 1, column: 1, label: 'Three-quarter face' },
  'body-front': { row: 0, column: 0, label: 'Full body' },
}

const FAMILY_CROPS: Record<AvatarModelFamily, readonly AvatarCropRole[]> = {
  qwen: ['face-front', 'body-front'],
  'nano-banana': AVATAR_CROP_ROLES,
  seedream: AVATAR_CROP_ROLES,
  flux: AVATAR_CROP_ROLES,
  'gpt-image': AVATAR_CROP_ROLES,
  generic: AVATAR_CROP_ROLES,
}

export function avatarReferenceLimit(family: AvatarModelFamily): number {
  return family === 'qwen' ? 2 : 4
}

export function avatarCropPlan(family: AvatarModelFamily): AvatarCropRole[] {
  return [...FAMILY_CROPS[family]]
}

export function parseAvatarCrops(value: unknown): AvatarCrop[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) return undefined
  const crops: AvatarCrop[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const role = AVATAR_CROP_ROLES.find((candidate) => candidate === record.role)
    const assetId = typeof record.assetId === 'string' ? record.assetId : ''
    if (!role || !assetId) continue
    const width = Number(record.width)
    const height = Number(record.height)
    crops.push({
      role,
      assetId,
      width: Number.isFinite(width) ? width : 0,
      height: Number.isFinite(height) ? height : 0,
    })
  }
  return crops
}

export function plannedAvatarAssets(crops: AvatarCrop[], family: AvatarModelFamily): string[] {
  const plan = avatarCropPlan(family)
  const byRole = new Map(crops.map((crop) => [crop.role, crop]))
  return plan.flatMap((role) => {
    const crop = byRole.get(role)
    return crop ? [crop.assetId] : []
  })
}

export function qualifyAvatarCrops(
  cells: Array<{ role: AvatarCropRole; assetId: string; width: number; height: number }>,
): AvatarCrop[] {
  return cells.filter((cell) => Math.min(cell.width, cell.height) >= PANEL_CROP_MIN_SIDE)
}
