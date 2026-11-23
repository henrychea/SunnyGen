import type { VideoModelDefinition } from '@sunnygen/core'
import { flattenReferenceAssets, referenceIdentity, withIdentityClause } from './avatar-references'
import type { ReferenceItem } from './reference-images'

export interface VideoEditJob {
  prompt: string
  assetIds: string[]
}

export interface VideoEditInput {
  targets: ReferenceItem[]
  references: ReferenceItem[]
  prompt: string
  model: VideoModelDefinition
}

export function videoEditJobs(input: VideoEditInput): {
  error: string | null
  jobs: VideoEditJob[]
} {
  if (input.targets.length === 0) return { error: 'Add a target video to edit.', jobs: [] }
  const prompt = input.prompt.trim()
  if (prompt.length === 0 && input.references.length === 0) {
    return { error: 'Describe the change, or add a reference image.', jobs: [] }
  }
  const assetIds = flattenReferenceAssets(input.references, input.model.id)
  const text = withIdentityClause(prompt, referenceIdentity(input.references), input.model.id)
  return {
    error: null,
    jobs: input.targets.map((target) => ({ prompt: text, assetIds: [target.id, ...assetIds] })),
  }
}
