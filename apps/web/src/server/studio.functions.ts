import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  GARMENT_SLOTS,
  GARMENT_SOURCES,
  STUDIO_KINDS,
  getModel,
  garmentPrepPrompt,
  type GarmentSlot,
  type GarmentSource,
  type StudioKind,
} from '@sunnygen/core'
import {
  deleteGeneration,
  deleteStudioItem,
  getStudioItem,
  listStudioItems,
  readSetting,
  saveStudioItem,
  type StudioItemRecord,
} from '@sunnygen/db'
import { getGenerationView, submitGeneration } from './generation.functions'
import { assetUrl } from './media.server'

export interface StudioItemDto {
  id: string
  kind: StudioKind
  name: string
  assetId: string | null
  assetUrl: string | null
  cleanAssetId: string | null
  cleanAssetUrl: string | null
  builtin: boolean
  data: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

export interface StudioLibrary {
  avatars: StudioItemDto[]
  garments: StudioItemDto[]
  poses: StudioItemDto[]
  scenes: StudioItemDto[]
}

function toDto(item: StudioItemRecord): StudioItemDto {
  return {
    id: item.id,
    kind: item.kind,
    name: item.name,
    assetId: item.assetId,
    assetUrl: item.assetId ? assetUrl(item.assetId) : null,
    cleanAssetId: item.cleanAssetId,
    cleanAssetUrl: item.cleanAssetId ? assetUrl(item.cleanAssetId) : null,
    builtin: item.builtin,
    data: item.data,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

function ensureWhiteStudio(): void {
  const scenes = listStudioItems('scene')
  if (scenes.some((scene) => scene.builtin)) return
  saveStudioItem({
    kind: 'scene',
    name: 'White studio',
    builtin: true,
    data: { white: true },
  })
}

export const loadStudioLibrary = createServerFn({ method: 'GET', strict: false }).handler(
  (): StudioLibrary => {
    ensureWhiteStudio()
    const items = listStudioItems()
    return {
      avatars: items.filter((item) => item.kind === 'avatar').map(toDto),
      garments: items.filter((item) => item.kind === 'garment').map(toDto),
      poses: items.filter((item) => item.kind === 'pose').map(toDto),
      scenes: items
        .filter((item) => item.kind === 'scene')
        .map(toDto)
        .sort(
          (left, right) => Number(right.builtin) - Number(left.builtin) || left.createdAt - right.createdAt,
        ),
    }
  },
)

const saveSchema = z.object({
  id: z.string().optional(),
  kind: z.enum(STUDIO_KINDS),
  name: z.string().trim().min(1).max(80),
  assetId: z.string().nullable().optional(),
  cleanAssetId: z.string().nullable().optional(),
  data: z.record(z.string(), z.unknown()).default({}),
})

export const saveStudioItemFn = createServerFn({ method: 'POST', strict: false })
  .validator(saveSchema)
  .handler(({ data }): StudioItemDto => {
    if (data.kind === 'avatar') {
      const characterSheet = data.data.characterSheetAssetId
      if (typeof characterSheet !== 'string' || !characterSheet) {
        throw new Error('Upload the character sheet first.')
      }
      if (!data.assetId) throw new Error('Upload the 4x4 panel sheet first.')
    }
    if (data.kind === 'garment') {
      if (!data.assetId) throw new Error('Upload a garment photo first.')
      const slot = data.data.slot
      const sourceKind = data.data.sourceKind
      if (!GARMENT_SLOTS.includes(slot as GarmentSlot)) throw new Error('Choose a slot.')
      if (!GARMENT_SOURCES.includes(sourceKind as GarmentSource)) throw new Error('Choose a source type.')
    }
    if (data.kind === 'pose' && !data.assetId) throw new Error('Upload a pose image first.')
    if (data.kind === 'scene' && !data.assetId) throw new Error('Upload a scene image first.')

    const saved = saveStudioItem({
      id: data.id,
      kind: data.kind,
      name: data.name,
      assetId: data.assetId ?? null,
      cleanAssetId: data.cleanAssetId ?? null,
      data: data.data,
    })
    return toDto(saved)
  })

export const deleteStudioItemFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string() }))
  .handler(({ data }) => {
    const item = getStudioItem(data.id)
    if (!item) return { ok: true }
    if (item.builtin) throw new Error('The built-in white studio cannot be deleted.')
    deleteStudioItem(data.id)
    return { ok: true }
  })

export const prepareGarmentFn = createServerFn({ method: 'POST', strict: false })
  .validator(z.object({ id: z.string(), modelId: z.string().optional() }))
  .handler(async ({ data }): Promise<StudioItemDto> => {
    const item = getStudioItem(data.id)
    if (!item || item.kind !== 'garment') throw new Error('Garment not found')
    if (!item.assetId) throw new Error('Upload a garment photo first.')

    const slot = item.data.slot as GarmentSlot
    const sourceKind = item.data.sourceKind as GarmentSource
    if (!GARMENT_SLOTS.includes(slot) || !GARMENT_SOURCES.includes(sourceKind)) {
      throw new Error('This garment is missing its slot or source type.')
    }

    const modelId = data.modelId ?? readSetting('studio.prepModel') ?? 'nano-banana-2'
    const model = getModel(modelId)
    if (!model || model.kind !== 'image') throw new Error('Choose an image model for prep.')
    if (!model.supportsImages) throw new Error('The prep model needs to accept a reference image.')

    const submitted = await submitGeneration({
      data: {
        kind: 'image',
        model: model.id,
        prompt: garmentPrepPrompt(item.name, slot, String(item.data.notes ?? '')),
        assetIds: [item.assetId],
        params: { aspectRatio: '3:4', quality: model.defaultQuality },
      },
    })

    if (submitted.generation.status === 'failed') {
      throw new Error(submitted.generation.error ?? 'Prep job failed')
    }

    let outputId = submitted.generation.outputAssetIds[0]
    if (!outputId) {
      for (let attempt = 0; attempt < 450; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2_000))
        const view = await getGenerationView({ data: { id: submitted.generation.id } })
        if (!view) throw new Error('Prep job disappeared')
        if (view.generation.status === 'failed') throw new Error(view.generation.error ?? 'Prep job failed')
        if (view.generation.status === 'cancelled') throw new Error('Prep canceled')
        if (view.generation.status === 'succeeded') {
          outputId = view.generation.outputAssetIds[0]
          break
        }
      }
    }

    if (!outputId) throw new Error('Prep returned no image')
    const saved = saveStudioItem({
      id: item.id,
      kind: 'garment',
      name: item.name,
      assetId: item.assetId,
      cleanAssetId: outputId,
      data: item.data,
    })
    deleteGeneration(submitted.generation.id)
    return toDto(saved)
  })
