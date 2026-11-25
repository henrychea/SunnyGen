import type { AvatarModelFamily } from './avatar-profile'

export const AVATAR_CROP_ROLES = ['face-front', 'face-three-quarter', 'body-front', 'body-side'] as const
export type AvatarCropRole = (typeof AVATAR_CROP_ROLES)[number]

export interface AvatarCrop {
  role: AvatarCropRole
  assetId: string
  width: number
  height: number
}

// shortcut: avatars no longer cut crops or boards, so these stay only while the parked send
// path in apps/web/src/lib/avatar-references.ts still reads them; remove the other half there.
export const BOARD_ROLES = ['face', 'body', 'details'] as const
export type BoardRole = (typeof BOARD_ROLES)[number]

export interface AvatarBoard {
  role: BoardRole
  assetId: string
  width: number
  height: number
}

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

// Models weight earlier images, and a second face adds little next to a frontal crop, so the
// body lands second and the side profile third: 3-ref families name those and demote the
// three-quarter face to a supporting image, which is the trade the body shape wants.
const REFERENCE_ORDER: readonly AvatarCropRole[] = [
  'face-front',
  'body-front',
  'body-side',
  'face-three-quarter',
]

const FAMILY_CROPS: Record<AvatarModelFamily, readonly AvatarCropRole[]> = {
  qwen: ['face-front', 'body-front'],
  'nano-banana': REFERENCE_ORDER,
  seedream: REFERENCE_ORDER,
  flux: REFERENCE_ORDER,
  'gpt-image': REFERENCE_ORDER,
  grok: REFERENCE_ORDER,
  wan: REFERENCE_ORDER,
  generic: REFERENCE_ORDER,
}

export function avatarReferenceLimit(family: AvatarModelFamily): number {
  return family === 'qwen' ? 2 : 4
}

export function avatarCropPlan(family: AvatarModelFamily): AvatarCropRole[] {
  return [...FAMILY_CROPS[family]]
}
