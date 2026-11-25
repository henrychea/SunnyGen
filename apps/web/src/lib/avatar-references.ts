import {
  avatarImagePlan,
  avatarModelFamily,
  identityClause,
  type AvatarImageRole,
  type AvatarProfile,
} from '@sunnygen/core'
import type { EditReference } from './edit-prompt'

// The role text rides into the edit prompt verbatim, so each image names what it holds.
const IMAGE_SLOT_ROLES: Record<AvatarImageRole, string> = {
  'face-panel':
    'face panel: top-left front, top-right three-quarter, bottom-left side profile, bottom-right hands',
  'body-panel':
    'body panel: top-left front, top-right side profile, bottom-left back, bottom-right three-quarter',
  sheet:
    'character reference sheet: expressions, hair, hands, skin texture, facial features and body details',
}

// An avatar saved before the two-panel split has one 4x4 panel holding the body and faces.
const LEGACY_PANEL_ROLE = '4x4 panel'

export interface AvatarReferenceInfo {
  id: string
  assetIds?: string[]
  sheetAssetId?: string | null
  facePanelAssetId?: string | null
  bodyPanelAssetId?: string | null
  avatar?: boolean
  profile?: AvatarProfile | null
  role?: string
}

export interface AvatarAssetSlot {
  id: string
  role: string
}

function referenceAssets(reference: AvatarReferenceInfo): string[] {
  return reference.assetIds && reference.assetIds.length > 0 ? reference.assetIds : [reference.id]
}

export function avatarAssetSlots(reference: AvatarReferenceInfo, modelId: string): AvatarAssetSlot[] {
  const family = avatarModelFamily(modelId)
  const plan = avatarImagePlan(reference, family)
  if (plan.length > 0) {
    return plan.map((slot) => ({ id: slot.assetId, role: IMAGE_SLOT_ROLES[slot.role] }))
  }
  // No face panel: the avatar holds whole images already, so its id list goes as it stands.
  const assets = referenceAssets(reference)
  return assets.map((id) => ({
    id,
    role: id === reference.sheetAssetId ? 'reference sheet' : LEGACY_PANEL_ROLE,
  }))
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
