import type { ModelDefinition } from '@sunnygen/core'

export interface EditCandidate {
  label: string
  modelId: string | null
  definition?: ModelDefinition
}

export function canEditImages(definition: ModelDefinition | null | undefined): boolean {
  return definition?.kind === 'image' && definition.supportsImages === true
}

export function editModeSwitch(
  current: EditCandidate,
  candidates: readonly EditCandidate[],
): { modelId: string; message: string } | null {
  if (canEditImages(current.definition)) return null
  for (const candidate of candidates) {
    if (!canEditImages(candidate.definition)) continue
    const modelId = candidate.definition?.id ?? candidate.modelId
    if (!modelId) continue
    return {
      modelId,
      message: `${current.label} can't edit images. Switched to ${candidate.label}.`,
    }
  }
  return null
}
