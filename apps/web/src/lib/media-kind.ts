import type { AssetKind, GenerationKind } from '@sunnygen/core'

export type MediaKind = 'image' | 'video' | 'audio'

export function assetMediaKind(kind: AssetKind): MediaKind {
  return kind === 'lora' ? 'image' : kind
}

export function generationMediaKind(kind: GenerationKind): 'image' | 'video' {
  return kind === 'video' ? 'video' : 'image'
}
