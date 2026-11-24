import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { PROVIDERS, type ProviderId } from '@sunnygen/core'
import {
  countAssets,
  countGenerations,
  countStudioItems,
  getAssetsByIds,
  getGeneration,
  listGenerations,
  readSetting,
  updateGeneration,
} from '@sunnygen/db'
import { ensurePoller } from './generation-poller.server'
import { assetUrl, toInputAssets } from './media.server'
import { generationMediaKind } from '~/lib/media-kind'
import { loadGenerationWall, type GalleryItem, type GenerationWallItem } from './library.functions'

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
  const recentGenerations = listGenerations({ status: 'succeeded', limit: 6 }).filter(
    (generation) => generation.kind !== 'lora',
  )
  const outputAssets = new Map(
    getAssetsByIds([
      ...recentGenerations.flatMap((generation) => generation.outputAssetIds),
      ...recentGenerations.flatMap((generation) => generation.inputAssetIds),
    ]).map((asset) => [asset.id, asset]),
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
        kind: generationMediaKind(generation.kind),
        url: assetUrl(first.id),
        urls: outputs.map((asset) => assetUrl(asset.id)),
        width: first.width,
        height: first.height,
        duration: first.duration,
        prompt: generation.prompt,
        provider: generation.provider,
        model: generation.model,
        outputCount: outputs.length,
        inputAssets: toInputAssets(generation.inputAssetIds, outputAssets),
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

export interface TodayWeekUsage {
  provider: ProviderId
  model: string
  runs: number
}

export interface TodayData {
  running: GenerationWallItem[]
  review: GenerationWallItem[]
  failed: GenerationWallItem[]
  week: TodayWeekUsage[]
  weekStart: number
}

function startOfWeek(now: number): number {
  const date = new Date(now)
  date.setHours(0, 0, 0, 0)
  const weekday = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - weekday)
  return date.getTime()
}

export const loadToday = createServerFn({ method: 'GET', strict: false }).handler(
  async (): Promise<TodayData> => {
    ensurePoller()
    const wall = await loadGenerationWall()
    const weekStart = startOfWeek(Date.now())
    const usage = new Map<string, TodayWeekUsage>()
    for (const generation of listGenerations({ status: 'succeeded', limit: 1000 })) {
      if (generation.kind === 'lora' || generation.createdAt < weekStart) continue
      const key = `${generation.provider}|${generation.model}`
      const entry = usage.get(key) ?? { provider: generation.provider, model: generation.model, runs: 0 }
      entry.runs += 1
      usage.set(key, entry)
    }
    return {
      running: wall.filter((item) => item.status === 'queued' || item.status === 'running'),
      review: wall.filter((item) => item.status === 'succeeded' && !item.params.reviewedAt),
      failed: wall.filter((item) => item.status === 'failed'),
      week: [...usage.values()].sort((left, right) => right.runs - left.runs),
      weekStart,
    }
  },
)

export const setGenerationReview = createServerFn({ method: 'POST', strict: false })
  .validator(
    z.object({
      id: z.string().min(1),
      reviewed: z.boolean().optional(),
      starred: z.boolean().optional(),
    }),
  )
  .handler(({ data }) => {
    const generation = getGeneration(data.id)
    if (!generation) throw new Error('Generation not found')
    const params: Record<string, unknown> = { ...generation.params }
    if (data.reviewed === true) params.reviewedAt = Date.now()
    if (data.reviewed === false) delete params.reviewedAt
    if (data.starred === true) params.starred = true
    if (data.starred === false) delete params.starred
    updateGeneration(generation.id, { params })
    return { ok: true }
  })
