import {
  BOARD_ROLES,
  avatarCropPlan,
  avatarModelFamily,
  avatarReferenceLimit,
  identityClause,
  type AvatarBoard,
  type AvatarCrop,
  type AvatarCropRole,
  type AvatarProfile,
  type BoardRole,
} from '@sunnygen/core'
import type { EditReference } from './edit-prompt'

export const CROP_ROLE_LABELS: Record<AvatarCropRole, string> = {
  'face-front': 'front face',
  'face-three-quarter': 'three-quarter face',
  'body-front': 'full body',
  'body-side': 'side profile',
}

// The role text rides into the edit prompt verbatim, so each board names its tiles.
export const BOARD_SLOT_ROLES: Record<BoardRole, string> = {
  face: 'face board: front, three-quarter, side profile, expressions',
  body: 'body board: front, side profile, back, three-quarter',
  details: 'details board: hands, skin, hair, facial features, body details',
}

export interface AvatarReferenceInfo {
  id: string
  assetIds?: string[]
  sheetAssetId?: string | null
  boards?: AvatarBoard[]
  avatar?: boolean
  profile?: AvatarProfile | null
  crops?: AvatarCrop[]
  role?: string
}

export interface AvatarAssetSlot {
  id: string
  role: string
}

export function avatarAssetSlots(reference: AvatarReferenceInfo, modelId: string): AvatarAssetSlot[] {
  const assets = reference.assetIds && reference.assetIds.length > 0 ? reference.assetIds : [reference.id]
  const boards = reference.boards ?? []
  if (boards.length > 0) {
    // Identity first: face, then body, then details. A family that names fewer references
    // gets the earlier boards only, so it never loses the face.
    return [...boards]
      .sort((left, right) => BOARD_ROLES.indexOf(left.role) - BOARD_ROLES.indexOf(right.role))
      .slice(0, avatarReferenceLimit(avatarModelFamily(modelId)))
      .map((board) => ({ id: board.assetId, role: BOARD_SLOT_ROLES[board.role] }))
  }
  const crops = reference.crops ?? []
  if (crops.length === 0) {
    // The sheet drives face and identity, the panel body proportions: naming both
    // "reference sheet" leaves the model guessing which is which.
    return assets.map((id) => ({
      id,
      role: id === reference.sheetAssetId ? 'reference sheet' : '4x4 panel',
    }))
  }
  const byRole = new Map(crops.map((crop) => [crop.role, crop]))
  return avatarCropPlan(avatarModelFamily(modelId)).flatMap((role) => {
    const crop = byRole.get(role)
    return crop ? [{ id: crop.assetId, role: CROP_ROLE_LABELS[role] }] : []
  })
}

export function avatarReferenceAssets(reference: AvatarReferenceInfo, modelId: string): string[] {
  return avatarAssetSlots(reference, modelId).map((slot) => slot.id)
}

export function editReferencePlan(references: AvatarReferenceInfo[], modelId: string): EditReference[] {
  return references.flatMap((reference): EditReference[] => {
    if (!reference.avatar) {
      return [{ id: reference.id, assetIds: reference.assetIds ?? [reference.id], avatar: false }]
    }
    const profile = reference.profile ?? null
    return avatarAssetSlots(reference, modelId).map((slot) => ({
      id: slot.id,
      assetIds: [slot.id],
      avatar: true,
      profile,
      role: slot.role,
    }))
  })
}

export function flattenReferenceAssets(references: AvatarReferenceInfo[], modelId: string): string[] {
  return references.flatMap((reference) =>
    reference.avatar ? avatarReferenceAssets(reference, modelId) : (reference.assetIds ?? [reference.id]),
  )
}

export function referenceIdentity(references: AvatarReferenceInfo[]): AvatarProfile | null {
  return references.find((reference) => reference.avatar && reference.profile)?.profile ?? null
}

export function withIdentityClause(prompt: string, profile: AvatarProfile | null, modelId: string): string {
  if (!profile) return prompt
  const clause = identityClause(profile, { modelFamily: avatarModelFamily(modelId) })
  return `${prompt.trim()}\n\nAvatar identity: ${clause}.`
}
