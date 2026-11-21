import type { ImageModelDefinition, VideoModelDefinition } from '@sunnygen/core'
import type { ModelCatalogEntry } from '~/server/model-catalog.functions'

const IMAGE_RATIOS = ['21:9', '16:9', '3:2', '4:3', '1:1', '3:4', '2:3', '9:16']
const VIDEO_RATIOS = ['16:9', '9:16', '1:1']

/** Best-effort definition for provider models discovered by the catalog sync. */
export function catalogModelDefinition(
  entry: ModelCatalogEntry,
): ImageModelDefinition | VideoModelDefinition {
  const base = {
    id: entry.key,
    label: entry.label,
    providerLabel: entry.company,
    providers: [entry.provider],
    kind: entry.kind,
    supportsImages: entry.supportsImages === true,
    supportsText: entry.supportsText,
    price: entry.price ?? undefined,
    sourceId: entry.sourceId,
    editSourceId: entry.editSourceId ?? undefined,
    schemaUrl: entry.schemaUrl ?? undefined,
    dynamic: true,
  }
  if (entry.kind === 'image') {
    return {
      ...base,
      kind: 'image',
      ratios: IMAGE_RATIOS,
      maxImages: Math.max(1, entry.maxImages),
      supportsQuality: true,
      qualityOptions: ['1k', '2k', '4k'],
      defaultQuality: '1k',
    }
  }
  return {
    ...base,
    kind: 'video',
    ratios: VIDEO_RATIOS,
    maxImages: Math.max(1, entry.maxImages),
    supportsQuality: false,
    qualityOptions: [],
    defaultQuality: '',
    durations: [4, 6, 8],
    defaultDuration: 4,
    defaultRatio: '16:9',
    resolutions: ['720p', '1080p'],
    defaultResolution: '720p',
    sound: false,
    modes: [],
    defaultMode: '',
  }
}
