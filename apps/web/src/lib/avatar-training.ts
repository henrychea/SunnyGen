export interface TrainingPanel {
  /** The panel image the cells are cut from. */
  assetId: string
  /** Prefix for the cell labels, e.g. "Face panel". */
  label: string
  /** Cells per side: a 2x2 panel yields four images, the legacy 4x4 sheet sixteen. */
  grid: number
}

export interface AvatarTrainingSource {
  bodyPanelAssetId: string | null
  facePanelAssetId: string | null
}

/**
 * A two-panel avatar trains on the four cells of each panel. An avatar saved before the split
 * has one 4x4 sheet holding both, so every cell of that sheet is used instead.
 */
export function avatarTrainingPanels(source: AvatarTrainingSource): TrainingPanel[] {
  const face = source.facePanelAssetId
  if (face) {
    const body = source.bodyPanelAssetId
    return [
      { assetId: face, label: 'Face panel', grid: 2 },
      ...(body ? [{ assetId: body, label: 'Body panel', grid: 2 }] : []),
    ]
  }
  const body = source.bodyPanelAssetId
  return body ? [{ assetId: body, label: 'Panel', grid: 4 }] : []
}
