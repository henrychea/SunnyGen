import {
  avatarModelFamily,
  buildStudioPrompt,
  identityClause,
  pickGarmentView,
  type AvatarProfile,
  type GarmentSlot,
  type GarmentSource,
  type GarmentView,
  type StudioAngle,
} from '@sunnygen/core'

export interface StudioShotGarment {
  id: string
  name: string
  slot: GarmentSlot
  sourceKind?: GarmentSource
  notes?: string
  views: GarmentView[]
}

export interface StudioShotInput {
  avatarAssetIds: string[]
  avatarProfile?: AvatarProfile | null
  modelId?: string
  garments: StudioShotGarment[]
  poseAssetId?: string | null
  sceneAssetId?: string | null
  angle: StudioAngle
  notes?: string
}

export interface StudioShot {
  prompt: string
  assetIds: string[]
}

/**
 * Prompt and reference order for one looked shot. The avatar images come first,
 * then one garment view per piece, then pose and scene, matching buildStudioPrompt.
 */
export function studioShot(input: StudioShotInput): StudioShot {
  const avatarCount = input.avatarAssetIds.length
  const views = input.garments.map((garment) => pickGarmentView(garment.views, input.angle))
  const hasPose = Boolean(input.poseAssetId)
  const hasScene = Boolean(input.sceneAssetId)

  const prompt = buildStudioPrompt({
    garments: input.garments.map((garment, index) => {
      const view = views[index]
      return {
        id: garment.id,
        name: garment.name,
        slot: garment.slot,
        sourceKind: garment.sourceKind ?? 'flat-lay',
        hasCleanReference: Boolean(view?.cleanAssetId),
        notes: garment.notes,
        imageIndex: index + 1 + avatarCount,
        view: view?.angle,
      }
    }),
    hasPose,
    poseImageIndex: hasPose ? 1 + avatarCount + input.garments.length : null,
    hasSceneImage: hasScene,
    sceneImageIndex: hasScene ? 1 + avatarCount + input.garments.length + (hasPose ? 1 : 0) : null,
    angle: input.angle,
    notes: input.notes,
    identityImageCount: avatarCount,
    identity: input.avatarProfile
      ? identityClause(input.avatarProfile, { modelFamily: avatarModelFamily(input.modelId ?? '') })
      : undefined,
  })

  const assetIds = [
    ...input.avatarAssetIds,
    ...views.map((view) => view?.cleanAssetId ?? view?.assetId ?? ''),
    ...(input.poseAssetId ? [input.poseAssetId] : []),
    ...(input.sceneAssetId ? [input.sceneAssetId] : []),
  ].filter(Boolean)

  return { prompt, assetIds }
}
