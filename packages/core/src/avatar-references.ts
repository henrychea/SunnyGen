import type { AvatarModelFamily } from './avatar-profile'

/** A 2x2 panel of 1024 px cells is the floor: 4096 px on each side. */
const PANEL_MIN_SIDE = 4096

export function panelSizeError(width: number | null, height: number | null): string | null {
  if (!width || !height) {
    return `The panel must be at least ${PANEL_MIN_SIDE} x ${PANEL_MIN_SIDE} px and its pixel size must be known.`
  }
  if (width < PANEL_MIN_SIDE || height < PANEL_MIN_SIDE) {
    return `The panel must be at least ${PANEL_MIN_SIDE} x ${PANEL_MIN_SIDE} px (this one is ${width} x ${height}).`
  }
  return null
}

export const AVATAR_IMAGE_ROLES = ['face-panel', 'body-panel', 'sheet'] as const
export type AvatarImageRole = (typeof AVATAR_IMAGE_ROLES)[number]

/** An avatar's three whole images, as stored on the studio item. */
export interface AvatarImageSource {
  facePanelAssetId?: string | null
  bodyPanelAssetId?: string | null
  sheetAssetId?: string | null
}

export interface AvatarImageSlot {
  role: AvatarImageRole
  assetId: string
}

function presentAssetId(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/**
 * qwen truncates long prompts and names two avatar images, so it takes the two panels and drops
 * the sheet; every other family takes all three.
 */
export function avatarImageLimit(family: AvatarModelFamily): number {
  return family === 'qwen' ? 2 : 3
}

/**
 * The three whole images an avatar is sent as, in send order: face panel, body panel, sheet.
 * They leave the disk at their own size and are resized only at send time. An avatar saved
 * before the split has no face panel, so this returns nothing and the caller sends the sheet
 * and the old panel whole, as it always did.
 */
export function avatarImagePlan(source: AvatarImageSource, family: AvatarModelFamily): AvatarImageSlot[] {
  const face = presentAssetId(source.facePanelAssetId)
  if (!face) return []
  const body = presentAssetId(source.bodyPanelAssetId)
  const sheet = presentAssetId(source.sheetAssetId)
  const slots: AvatarImageSlot[] = [
    { role: 'face-panel', assetId: face },
    ...(body ? [{ role: 'body-panel' as const, assetId: body }] : []),
    ...(sheet ? [{ role: 'sheet' as const, assetId: sheet }] : []),
  ]
  return slots.slice(0, avatarImageLimit(family))
}
