import { createServerFn } from '@tanstack/react-start'
import { PROVIDERS } from '@sunnygen/core'
import {
  countAssets,
  countGenerations,
  countStudioItems,
  getAssetsByIds,
  listGenerations,
  readSetting,
} from '@sunnygen/db'
import { ensurePoller } from './generation-poller.server'
import { assetUrl } from './media.server'
import type { GalleryItem } from './library.functions'

export interface DashboardData {
  renders: number
  images: number
  videos: number
  assets: number
  avatars: number
  garments: number
  poses: number
  scenes: number
  configuredProviders: number
  recent: GalleryItem[]
}

export const loadDashboard = createServerFn({ method: 'GET' }).handler((): DashboardData => {
  ensurePoller()
  const recentGenerations = listGenerations({ status: 'succeeded', limit: 6 })
  const outputAssets = new Map(
    getAssetsByIds(recentGenerations.flatMap((generation) => generation.outputAssetIds)).map((asset) => [
      asset.id,
      asset,
    ]),
  )

  const recent = recentGenerations.flatMap((generation): GalleryItem[] => {
    const outputs = generation.outputAssetIds
      .map((id) => outputAssets.get(id))
      .filter((asset) => asset !== undefined)
    const first = outputs[0]
    if (!first) return []
    return [
      {
        id: generation.id,
        generationId: generation.id,
        kind: generation.kind,
        url: assetUrl(first.id),
        urls: outputs.map((asset) => assetUrl(asset.id)),
        width: first.width,
        height: first.height,
        duration: first.duration,
        prompt: generation.prompt,
        provider: generation.provider,
        model: generation.model,
        outputCount: outputs.length,
        folderId: generation.folderId,
        createdAt: generation.createdAt,
      },
    ]
  })

  return {
    renders: countGenerations({ status: 'succeeded' }),
    images: countGenerations({ status: 'succeeded', kind: 'image' }),
    videos: countGenerations({ status: 'succeeded', kind: 'video' }),
    assets: countAssets(),
    avatars: countStudioItems('avatar'),
    garments: countStudioItems('garment'),
    poses: countStudioItems('pose'),
    scenes: countStudioItems('scene'),
    configuredProviders: PROVIDERS.filter(
      (provider) => provider.keySetting !== null && readSetting(provider.keySetting) !== null,
    ).length,
    recent,
  }
})
