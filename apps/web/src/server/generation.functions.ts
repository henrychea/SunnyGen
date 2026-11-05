import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  GENERATION_KINDS,
  PROVIDER_IDS,
  getModel,
  type GenerationKind,
  type GenerationParams,
  type GenerationRecord,
  type GenerationStatus,
  type ProviderId,
} from '@sunnygen/core'
import {
  createGeneration,
  deleteJob,
  getAssetsByIds,
  getGeneration,
  saveJob,
  updateGeneration,
} from '@sunnygen/db'
import { ProviderError } from '@sunnygen/providers'
import { toPublicAsset, type PublicAsset } from './media.server'
import { adapterFor, prepareGeneration, providerContext, storeProviderOutputs } from './generation.server'
import { ensurePoller } from './generation-poller.server'

const submitSchema = z.object({
  kind: z.enum(GENERATION_KINDS),
  model: z.string().min(1),
  prompt: z.string().default(''),
  assetIds: z.array(z.string()).default([]),
  params: z.record(z.string(), z.unknown()).default({}),
  provider: z.enum(PROVIDER_IDS).optional(),
  folderId: z.string().nullable().optional(),
})

export interface GenerationView {
  generation: GenerationRecord
  outputs: PublicAsset[]
}

export const submitGeneration = createServerFn({ method: 'POST', strict: false })
  .validator(submitSchema)
  .handler(async ({ data }): Promise<GenerationView> => {
    const model = getModel(data.model)
    if (!model) throw new Error(`Unknown model: ${data.model}`)
    if (model.kind !== data.kind) throw new Error(`${model.label} does not generate ${data.kind}s`)

    const params: GenerationParams = {
      ...data.params,
      aspectRatio:
        (data.params.aspectRatio as string | undefined) ??
        (model.kind === 'video' ? model.defaultRatio : '1:1'),
      quality:
        (data.params.quality as string | undefined) ?? (model.kind === 'image' ? model.defaultQuality : ''),
      ...(model.kind === 'video'
        ? {
            durationSeconds: Number(data.params.durationSeconds ?? model.defaultDuration),
            resolution: (data.params.resolution as string | undefined) ?? model.defaultResolution,
            sound: Boolean(data.params.sound ?? model.sound),
            mode: (data.params.mode as string | undefined) ?? model.defaultMode,
          }
        : {}),
    }

    const prepared = await prepareGeneration({
      kind: data.kind,
      model,
      prompt: data.prompt,
      params,
      assetIds: data.assetIds,
      provider: data.provider,
    })

    const generation = createGeneration({
      kind: data.kind,
      provider: prepared.provider,
      model: model.id,
      prompt: data.prompt,
      params,
      inputAssetIds: data.assetIds,
      folderId: data.folderId ?? null,
    })

    const adapter = adapterFor(prepared.provider)
    try {
      const result = await adapter.submit(providerContext(prepared.provider), prepared.request)
      if (result.status === 'succeeded') {
        const outputIds = await storeProviderOutputs(result.outputs ?? [], data.folderId ?? null)
        const updated = updateGeneration(generation.id, {
          status: 'succeeded',
          outputAssetIds: outputIds,
          providerJobId: result.providerJobId,
        }) as GenerationRecord
        return { generation: updated, outputs: getAssetsByIds(outputIds).map(toPublicAsset) }
      }

      const updated = updateGeneration(generation.id, {
        status: 'running',
        providerJobId: result.providerJobId,
      }) as GenerationRecord
      saveJob({
        taskId: generation.id,
        generationId: generation.id,
        provider: prepared.provider,
        providerJobId: result.providerJobId,
        status: 'running',
        pollAfter: Date.now() + 3_000,
      })
      ensurePoller()
      return { generation: updated, outputs: [] }
    } catch (error) {
      const message =
        error instanceof ProviderError || error instanceof Error ? error.message : 'Generation failed'
      const failed = updateGeneration(generation.id, { status: 'failed', error: message }) as GenerationRecord
      return { generation: failed, outputs: [] }
    }
  })

const getSchema = z.object({ id: z.string().min(1) })

export const getGenerationView = createServerFn({ method: 'GET', strict: false })
  .validator(getSchema)
  .handler(({ data }): GenerationView | null => {
    const generation = getGeneration(data.id)
    if (!generation) return null
    return {
      generation,
      outputs: getAssetsByIds(generation.outputAssetIds).map(toPublicAsset),
    }
  })

export const cancelGeneration = createServerFn({ method: 'POST', strict: false })
  .validator(getSchema)
  .handler(({ data }): GenerationView | null => {
    const generation = getGeneration(data.id)
    if (!generation) return null
    const status: GenerationStatus =
      generation.status === 'succeeded' || generation.status === 'failed' ? generation.status : 'cancelled'
    updateGeneration(data.id, { status })
    deleteJob(data.id)
    return {
      generation: getGeneration(data.id) as GenerationRecord,
      outputs: getAssetsByIds(generation.outputAssetIds).map(toPublicAsset),
    }
  })

export type SubmitGenerationInput = {
  kind: GenerationKind
  model: string
  prompt?: string
  assetIds?: string[]
  params?: Record<string, unknown>
  provider?: ProviderId
  folderId?: string | null
}
