import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  GENERATION_KINDS,
  LORA_TRAINER_MODEL,
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
import { toPublicAsset, type PublicAsset } from './media.server'
import { adapterFor, prepareGeneration, providerContext, storeProviderOutputs } from './generation.server'
import { ensurePoller } from './generation-poller.server'
import { applyAvatarLora } from './lora.server'
import { buildModelCatalog } from './model-catalog.server'
import { catalogModelDefinition } from '~/lib/catalog-model'

const submitSchema = z.object({
  kind: z.enum(GENERATION_KINDS),
  model: z.string().min(1),
  prompt: z.string().default(''),
  assetIds: z.array(z.string()).max(40).default([]),
  params: z.record(z.string(), z.unknown()).default({}),
  provider: z.enum(PROVIDER_IDS).optional(),
  folderId: z.string().nullable().optional(),
})

export interface GenerationView {
  generation: GenerationRecord
  outputs: PublicAsset[]
}

function resolveModel(id: string) {
  const builtIn = getModel(id)
  if (builtIn) return builtIn
  const entry = buildModelCatalog().entries.find((candidate) => candidate.key === id)
  if (entry && !entry.available) {
    throw new Error(
      `${entry.label} needs inputs SunnyGen does not collect${entry.limitation ? ` (${entry.limitation})` : ''}.`,
    )
  }
  return entry ? catalogModelDefinition(entry) : undefined
}

export const submitGeneration = createServerFn({ method: 'POST', strict: false })
  .validator(submitSchema)
  .handler(async ({ data }): Promise<GenerationView> => {
    const model = resolveModel(data.model)
    if (!model) throw new Error(`Unknown model: ${data.model}`)
    const isTraining = data.kind === 'lora'
    if (isTraining) {
      if (model.id !== LORA_TRAINER_MODEL.id) throw new Error(`${model.label} cannot train a LoRA`)
    } else if (model.kind !== data.kind) {
      throw new Error(`${model.label} does not generate ${data.kind}s`)
    }

    const requestedRatio = String(data.params.aspectRatio ?? '')
    const requestedQuality = String(data.params.quality ?? '')
    const params: GenerationParams = isTraining
      ? { ...data.params }
      : {
          ...data.params,
          aspectRatio: model.ratios.includes(requestedRatio)
            ? requestedRatio
            : model.kind === 'video'
              ? model.defaultRatio
              : '1:1',
          quality:
            model.kind === 'image'
              ? model.qualityOptions.includes(requestedQuality)
                ? requestedQuality
                : model.defaultQuality
              : '',
          ...(model.kind === 'video'
            ? {
                durationSeconds: model.durations.includes(Number(data.params.durationSeconds))
                  ? Number(data.params.durationSeconds)
                  : model.defaultDuration,
                resolution: model.resolutions.includes(String(data.params.resolution ?? ''))
                  ? String(data.params.resolution)
                  : model.defaultResolution,
                sound: typeof data.params.sound === 'boolean' ? data.params.sound : model.sound,
                mode: model.modes.some((entry) => entry.value === String(data.params.mode ?? ''))
                  ? String(data.params.mode)
                  : model.defaultMode,
              }
            : {}),
        }

    let prompt = data.prompt
    if (!isTraining) prompt = await applyAvatarLora(model, data.assetIds, prompt, params)

    const prepared = await prepareGeneration({
      kind: data.kind,
      model,
      prompt,
      params,
      assetIds: data.assetIds,
      provider: data.provider,
    })

    const generation = createGeneration({
      kind: data.kind,
      provider: prepared.provider,
      model: model.id,
      prompt,
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
      const message = error instanceof Error ? error.message : 'Generation failed'
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
