import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  GARMENT_SLOTS,
  GARMENT_SOURCES,
  LORA_MAX_IMAGES,
  LORA_MIN_IMAGES,
  LORA_MODEL_ID,
  LORA_TRAINER_MODEL,
  STUDIO_KINDS,
  getModel,
  garmentPrepPrompt,
  isLoraStepCount,
  loraTrainingCost,
  parseAvatarLora,
  type GarmentSlot,
  type GarmentSource,
  type StudioKind,
} from '@sunnygen/core'
import {
  deleteGeneration,
  deleteStudioItem,
  getAssetsByIds,
  getStudioItem,
  listGenerations,
  listStudioItems,
  readSetting,
  saveStudioItem,
  type StudioItemRecord,
} from '@sunnygen/db'
import sharp from 'sharp'
import { getGenerationView, submitGeneration } from './generation.functions'
import { assetUrl, readAssetBuffer, storeBuffer } from './media.server'

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

export interface TrainingImage {
  id: string
  url: string
  label: string
}

export interface AvatarTrainingSet {
  avatarId: string
  name: string
  images: TrainingImage[]
}

const PANEL_GRID = 4

export const prepareAvatarTrainingSet = createServerFn({ method: 'POST', strict: false })
  .validator(z.object({ avatarId: z.string().min(1) }))
  .handler(async ({ data }): Promise<AvatarTrainingSet> => {
    const avatar = getStudioItem(data.avatarId)
    if (!avatar || avatar.kind !== 'avatar') throw new Error('Avatar not found')
    const panelId = avatar.assetId
    if (!panelId) throw new Error('This avatar has no 4x4 panel sheet to train on.')
    const sheetId =
      typeof avatar.data.characterSheetAssetId === 'string' ? avatar.data.characterSheetAssetId : null

    const panel = await readAssetBuffer(panelId)
    if (!panel) throw new Error('The 4x4 panel sheet is missing from disk.')
    const metadata = await sharp(panel.buffer).metadata()
    const width = metadata.width ?? 0
    const height = metadata.height ?? 0
    const cellWidth = Math.floor(width / PANEL_GRID)
    const cellHeight = Math.floor(height / PANEL_GRID)
    if (cellWidth < 32 || cellHeight < 32) throw new Error('The 4x4 panel sheet is too small to crop.')

    const images: TrainingImage[] = []
    if (sheetId) images.push({ id: sheetId, url: assetUrl(sheetId), label: 'Character sheet' })

    for (let row = 0; row < PANEL_GRID; row += 1) {
      for (let column = 0; column < PANEL_GRID; column += 1) {
        const crop = await sharp(panel.buffer)
          .extract({ left: column * cellWidth, top: row * cellHeight, width: cellWidth, height: cellHeight })
          .jpeg({ quality: 92, mozjpeg: true })
          .toBuffer()
        const asset = await storeBuffer({
          buffer: crop,
          mime: 'image/jpeg',
          kind: 'image',
          source: 'training',
        })
        images.push({ id: asset.id, url: assetUrl(asset.id), label: `Panel ${row + 1}.${column + 1}` })
      }
    }

    return { avatarId: avatar.id, name: avatar.name, images }
  })

const trainSchema = z.object({
  avatarId: z.string().min(1),
  assetIds: z.array(z.string().min(1)).min(LORA_MIN_IMAGES).max(LORA_MAX_IMAGES),
  steps: z.number().int().refine(isLoraStepCount, 'Choose a training length.'),
  triggerWord: z.string().trim().min(1).max(64),
  consent: z.literal(true),
})

export interface LoraTrainingRun {
  id: string
  status: string
  error: string | null
}

export const trainAvatarLora = createServerFn({ method: 'POST', strict: false })
  .validator(trainSchema)
  .handler(async ({ data }): Promise<LoraTrainingRun> => {
    const avatar = getStudioItem(data.avatarId)
    if (!avatar || avatar.kind !== 'avatar') throw new Error('Avatar not found')

    const assets = getAssetsByIds(data.assetIds)
    if (assets.length !== data.assetIds.length) throw new Error('Some training images are missing.')
    if (assets.some((asset) => asset.kind !== 'image')) throw new Error('Training images must be stills.')

    const existing = parseAvatarLora(avatar.data.lora)
    const submitted = await submitGeneration({
      data: {
        kind: 'lora',
        model: LORA_TRAINER_MODEL.id,
        prompt: data.triggerWord,
        assetIds: data.assetIds,
        params: {
          steps: data.steps,
          triggerWord: data.triggerWord,
          avatarId: avatar.id,
          version: (existing?.version ?? 0) + 1,
          baseModel: LORA_MODEL_ID,
        },
      },
    })

    return {
      id: submitted.generation.id,
      status: submitted.generation.status,
      error: submitted.generation.error,
    }
  })

export interface LoraRunDto {
  id: string
  avatarId: string | null
  avatarName: string
  avatarUrl: string | null
  version: number
  status: 'uploading' | 'queued' | 'training' | 'done' | 'failed'
  steps: number
  cost: number
  triggerWord: string
  assetIds: string[]
  error: string | null
  createdAt: number
}

const RUN_STATUS: Record<string, LoraRunDto['status']> = {
  queued: 'uploading',
  running: 'training',
  succeeded: 'done',
  failed: 'failed',
  cancelled: 'failed',
}

export const loadLoraRuns = createServerFn({ method: 'GET', strict: false }).handler((): LoraRunDto[] => {
  const avatars = new Map(listStudioItems('avatar').map((item) => [item.id, item]))
  return listGenerations({ kind: 'lora', limit: 100 }).flatMap((generation): LoraRunDto[] => {
    const avatarId = typeof generation.params.avatarId === 'string' ? generation.params.avatarId : null
    const avatar = avatarId ? avatars.get(avatarId) : undefined
    const steps = Number(generation.params.steps) || 0
    return [
      {
        id: generation.id,
        avatarId,
        avatarName: avatar?.name ?? 'Deleted avatar',
        avatarUrl: avatar?.assetId ? assetUrl(avatar.assetId) : null,
        version: Number(generation.params.version) || 1,
        status: RUN_STATUS[generation.status] ?? 'failed',
        steps,
        cost: loraTrainingCost(steps),
        triggerWord: String(generation.params.triggerWord ?? generation.prompt ?? ''),
        assetIds: generation.inputAssetIds,
        error: generation.error,
        createdAt: generation.createdAt,
      },
    ]
  })
})
