import type { ProviderId } from './domain'
import { LORA_MODEL_ID, LORA_TRAINER_MODEL } from './lora'
import {
  bestVideoMode,
  videoModeKeys,
  type VideoModeCapability,
  type VideoModeKey,
  type VideoModes,
} from './video-modes'

export interface ModelBase {
  id: string
  label: string
  providerLabel: string
  providers: ProviderId[]
  ratios: string[]
  supportsImages: boolean
  /** False when the provider model can only run from a reference image. */
  supportsText?: boolean
  maxImages: number
  supportsQuality: boolean
  qualityOptions: string[]
  defaultQuality: string
  price?: string
  sourceId?: string
  editSourceId?: string
  schemaUrl?: string
  dynamic?: boolean
  supportsLora?: boolean
}

export interface ImageModelDefinition extends ModelBase {
  kind: 'image'
}

export interface VideoModelMode {
  value: string
  label: string
}

export interface VideoModelDefinition extends ModelBase {
  kind: 'video'
  durations: number[]
  defaultDuration: number
  defaultRatio: string
  resolutions: string[]
  defaultResolution: string
  sound: boolean
  modes: VideoModelMode[]
  defaultMode: string
  videoModes: VideoModes
  defaultVideoMode: VideoModeKey
}

export type ModelDefinition = ImageModelDefinition | VideoModelDefinition

const GEMINI_RATIOS = ['21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16']
const SEEDREAM_RATIOS = ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '21:9']
const GPT_IMAGE_RATIOS = ['auto', '1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16', '21:9']
const GROK_RATIOS = ['1:1', '2:1', '16:9', '4:3', '3:2', '2:3', '3:4', '9:16', '1:2']
const KLING_DURATIONS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
const GROK_DURATIONS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15]
const GROK_VIDEO_RATIOS = ['16:9', '4:3', '3:2', '1:1', '2:3', '3:4', '9:16']

function videoMode(
  endpoint: string,
  limits: { durations: number[]; resolutions: string[]; ratios: string[]; audio: boolean },
  images?: { fields: string[]; fieldsMode?: 'single' | 'array'; maxImages?: number },
): VideoModeCapability {
  return {
    endpoint,
    videoField: null,
    fields: images?.fields ?? [],
    fieldsMode: images?.fieldsMode ?? 'single',
    maxImages: images?.maxImages ?? 0,
    ...limits,
  }
}

export const IMAGE_MODELS: ImageModelDefinition[] = [
  {
    id: 'nano-banana-2',
    label: 'Nano Banana 2',
    providerLabel: 'Google',
    kind: 'image',
    providers: ['sunra'],
    ratios: GEMINI_RATIOS,
    supportsImages: true,
    maxImages: 10,
    supportsQuality: true,
    qualityOptions: ['1k', '2k', '4k'],
    defaultQuality: '1k',
    price: '$0.045–$0.15 per image',
  },
  {
    id: 'nano-banana-pro',
    label: 'Nano Banana Pro',
    providerLabel: 'Google',
    kind: 'image',
    providers: ['sunra'],
    ratios: GEMINI_RATIOS,
    supportsImages: true,
    maxImages: 8,
    supportsQuality: true,
    qualityOptions: ['1k', '2k', '4k'],
    defaultQuality: '1k',
    price: '$0.13–$0.24 per image',
  },
  {
    id: 'seedream-5-lite',
    label: 'Seedream 5.0 Lite',
    providerLabel: 'ByteDance',
    kind: 'image',
    providers: ['sunra'],
    ratios: SEEDREAM_RATIOS,
    supportsImages: true,
    maxImages: 10,
    supportsQuality: true,
    qualityOptions: ['1k', '2k'],
    defaultQuality: '2k',
    price: '$0.035 per image',
  },
  {
    id: 'seedream-5-pro',
    label: 'Seedream 5.0 Pro',
    providerLabel: 'ByteDance',
    kind: 'image',
    providers: ['sunra'],
    ratios: SEEDREAM_RATIOS,
    supportsImages: true,
    maxImages: 10,
    supportsQuality: true,
    qualityOptions: ['1k', '2k'],
    defaultQuality: '2k',
    price: '$0.045–$0.09 per image',
  },
  {
    id: 'gpt-image-2',
    label: 'GPT Image 2',
    providerLabel: 'OpenAI',
    kind: 'image',
    providers: ['sunra', 'fal', 'azure', 'codex'],
    ratios: GPT_IMAGE_RATIOS,
    supportsImages: true,
    maxImages: 16,
    supportsQuality: true,
    qualityOptions: ['1k', '2k', '4k'],
    defaultQuality: '1k',
    price: 'Token based',
  },
  {
    id: 'grok-imagine-image',
    label: 'Grok Imagine Image',
    providerLabel: 'xAI',
    kind: 'image',
    providers: ['sunra'],
    ratios: GROK_RATIOS,
    supportsImages: true,
    maxImages: 3,
    supportsQuality: true,
    qualityOptions: ['1k', '4k'],
    defaultQuality: '1k',
    price: '$0.02–$0.05 per image',
  },
  {
    id: LORA_MODEL_ID,
    label: 'FLUX.1 LoRA',
    providerLabel: 'FLUX',
    kind: 'image',
    providers: ['fal'],
    ratios: ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '21:9'],
    supportsImages: false,
    maxImages: 0,
    supportsQuality: false,
    qualityOptions: [],
    defaultQuality: '',
    supportsLora: true,
    price: '$0.035 per megapixel',
    sourceId: 'fal-ai/flux-lora',
  },
]

export const VIDEO_MODELS: VideoModelDefinition[] = [
  {
    id: 'veo3_lite',
    label: 'Veo 3.1 Lite',
    providerLabel: 'Google',
    kind: 'video',
    providers: ['sunra'],
    ratios: ['16:9', '9:16'],
    supportsImages: true,
    maxImages: 2,
    supportsQuality: false,
    qualityOptions: [],
    defaultQuality: '',
    durations: [4, 6, 8],
    defaultDuration: 8,
    defaultRatio: '16:9',
    resolutions: ['720p', '1080p'],
    defaultResolution: '720p',
    sound: true,
    modes: [],
    defaultMode: '',
    videoModes: {
      text: videoMode('google/veo3-1-lite/text-to-video', {
        durations: [4, 6, 8],
        resolutions: ['720p', '1080p'],
        ratios: ['16:9', '9:16'],
        audio: true,
      }),
      image: videoMode(
        'google/veo3-1-lite/image-to-video',
        {
          durations: [4, 6, 8],
          resolutions: ['720p', '1080p'],
          ratios: ['auto', '16:9', '9:16'],
          audio: true,
        },
        { fields: ['image'], maxImages: 1 },
      ),
      frames: videoMode(
        'google/veo3-1-lite/image-to-video',
        {
          durations: [4, 6, 8],
          resolutions: ['720p', '1080p'],
          ratios: ['auto', '16:9', '9:16'],
          audio: true,
        },
        { fields: ['image', 'end_image'], maxImages: 2 },
      ),
    },
    defaultVideoMode: 'text',
    price: '$0.03–$0.08 per second',
  },
  {
    id: 'veo3_fast',
    label: 'Veo 3.1 Fast',
    providerLabel: 'Google',
    kind: 'video',
    providers: ['sunra'],
    ratios: ['16:9', '9:16'],
    supportsImages: true,
    maxImages: 2,
    supportsQuality: false,
    qualityOptions: [],
    defaultQuality: '',
    durations: [4, 6, 8],
    defaultDuration: 8,
    defaultRatio: '16:9',
    resolutions: ['720p', '1080p', '4k'],
    defaultResolution: '720p',
    sound: true,
    modes: [],
    defaultMode: '',
    videoModes: {
      text: videoMode('google/veo3-1-fast/text-to-video', {
        durations: [4, 6, 8],
        resolutions: ['720p', '1080p', '4k'],
        ratios: ['16:9', '9:16'],
        audio: true,
      }),
      image: videoMode(
        'google/veo3-1-fast/image-to-video',
        {
          durations: [4, 6, 8],
          resolutions: ['720p', '1080p', '4k'],
          ratios: ['auto', '16:9', '9:16'],
          audio: true,
        },
        { fields: ['image'], maxImages: 1 },
      ),
      frames: videoMode(
        'google/veo3-1-fast/image-to-video',
        {
          durations: [4, 6, 8],
          resolutions: ['720p', '1080p', '4k'],
          ratios: ['auto', '16:9', '9:16'],
          audio: true,
        },
        { fields: ['image', 'end_image'], maxImages: 2 },
      ),
    },
    defaultVideoMode: 'text',
    price: '$0.08–$0.30 per second',
  },
  {
    id: 'veo3',
    label: 'Veo 3.1 Quality',
    providerLabel: 'Google',
    kind: 'video',
    providers: ['sunra'],
    ratios: ['16:9', '9:16'],
    supportsImages: true,
    maxImages: 3,
    supportsQuality: false,
    qualityOptions: [],
    defaultQuality: '',
    durations: [4, 6, 8],
    defaultDuration: 8,
    defaultRatio: '16:9',
    resolutions: ['720p', '1080p', '4k'],
    defaultResolution: '720p',
    sound: true,
    modes: [],
    defaultMode: '',
    videoModes: {
      text: videoMode('google/veo3-1/text-to-video', {
        durations: [4, 6, 8],
        resolutions: ['720p', '1080p', '4k'],
        ratios: ['16:9', '9:16'],
        audio: true,
      }),
      image: videoMode(
        'google/veo3-1/image-to-video',
        {
          durations: [4, 6, 8],
          resolutions: ['720p', '1080p', '4k'],
          ratios: ['auto', '16:9', '9:16'],
          audio: true,
        },
        { fields: ['image'], maxImages: 1 },
      ),
      frames: videoMode(
        'google/veo3-1/image-to-video',
        {
          durations: [4, 6, 8],
          resolutions: ['720p', '1080p', '4k'],
          ratios: ['auto', '16:9', '9:16'],
          audio: true,
        },
        { fields: ['image', 'end_image'], maxImages: 2 },
      ),
      references: videoMode(
        'google/veo3-1/reference-to-video',
        {
          durations: [4, 6, 8],
          resolutions: ['720p', '1080p', '4k'],
          ratios: ['16:9', '9:16'],
          audio: true,
        },
        { fields: ['image_urls'], fieldsMode: 'array', maxImages: 3 },
      ),
    },
    defaultVideoMode: 'text',
    price: '$0.20–$0.60 per second',
  },
  {
    id: 'kling-3.0',
    label: 'Kling 3.0',
    providerLabel: 'Kling',
    kind: 'video',
    providers: ['sunra'],
    ratios: ['16:9', '9:16', '1:1'],
    supportsImages: true,
    maxImages: 3,
    supportsQuality: false,
    qualityOptions: [],
    defaultQuality: '',
    durations: [3, 4, 5, 6, 7, 8, 9, 10, 15],
    defaultDuration: 5,
    defaultRatio: '9:16',
    resolutions: [],
    defaultResolution: '',
    sound: true,
    modes: [
      { value: 'std', label: '720p' },
      { value: 'pro', label: '1080p' },
      { value: '4K', label: '4K' },
    ],
    defaultMode: 'pro',
    videoModes: {
      text: videoMode('kling/kling-v3-pro/text-to-video', {
        durations: KLING_DURATIONS,
        resolutions: [],
        ratios: ['16:9', '9:16', '1:1'],
        audio: true,
      }),
      image: videoMode(
        'kling/kling-v3-pro/image-to-video',
        { durations: KLING_DURATIONS, resolutions: [], ratios: [], audio: true },
        { fields: ['start_image_url'], maxImages: 1 },
      ),
      frames: videoMode(
        'kling/kling-v3-pro/image-to-video',
        { durations: KLING_DURATIONS, resolutions: [], ratios: [], audio: true },
        { fields: ['start_image_url', 'end_image_url'], maxImages: 2 },
      ),
    },
    defaultVideoMode: 'text',
    price: '$0.11–$0.17 per second',
  },
  {
    id: 'kling-3.0-turbo',
    label: 'Kling 3.0 Turbo',
    providerLabel: 'Kling',
    kind: 'video',
    providers: ['sunra'],
    ratios: ['16:9', '9:16', '1:1'],
    supportsImages: true,
    maxImages: 2,
    supportsQuality: false,
    qualityOptions: [],
    defaultQuality: '',
    durations: [3, 4, 5, 6, 7, 8, 9, 10, 15],
    defaultDuration: 5,
    defaultRatio: '9:16',
    resolutions: [],
    defaultResolution: '',
    sound: true,
    modes: [],
    defaultMode: '',
    videoModes: {
      text: videoMode('kling/kling-v3-standard/text-to-video', {
        durations: KLING_DURATIONS,
        resolutions: [],
        ratios: ['16:9', '9:16', '1:1'],
        audio: true,
      }),
      image: videoMode(
        'kling/kling-v3-standard/image-to-video',
        { durations: KLING_DURATIONS, resolutions: [], ratios: [], audio: true },
        { fields: ['start_image_url'], maxImages: 1 },
      ),
      frames: videoMode(
        'kling/kling-v3-standard/image-to-video',
        { durations: KLING_DURATIONS, resolutions: [], ratios: [], audio: true },
        { fields: ['start_image_url', 'end_image_url'], maxImages: 2 },
      ),
    },
    defaultVideoMode: 'text',
    price: '$0.084–$0.126 per second',
  },
  {
    id: 'grok-imagine',
    label: 'Grok Imagine Video',
    providerLabel: 'xAI',
    kind: 'video',
    providers: ['sunra'],
    ratios: ['16:9', '4:3', '3:2', '1:1', '2:3', '3:4', '9:16'],
    supportsImages: true,
    maxImages: 7,
    supportsQuality: false,
    qualityOptions: [],
    defaultQuality: '',
    durations: [1, 2, 3, 4, 5, 6, 8, 10, 12, 15],
    defaultDuration: 6,
    defaultRatio: '9:16',
    resolutions: ['480p', '720p'],
    defaultResolution: '720p',
    sound: false,
    modes: [],
    defaultMode: '',
    videoModes: {
      text: videoMode('xai/grok-imagine-video/text-to-video', {
        durations: GROK_DURATIONS,
        resolutions: ['480p', '720p'],
        ratios: GROK_VIDEO_RATIOS,
        audio: false,
      }),
      image: videoMode(
        'xai/grok-imagine-video/image-to-video',
        {
          durations: GROK_DURATIONS,
          resolutions: ['480p', '720p'],
          ratios: ['auto', ...GROK_VIDEO_RATIOS],
          audio: false,
        },
        { fields: ['image'], maxImages: 1 },
      ),
      references: videoMode(
        'xai/grok-imagine-video/reference-to-video',
        { durations: GROK_DURATIONS, resolutions: ['480p', '720p'], ratios: GROK_VIDEO_RATIOS, audio: false },
        { fields: ['reference_images'], fieldsMode: 'array', maxImages: 7 },
      ),
    },
    defaultVideoMode: 'text',
    price: '$0.05–$0.07 per second',
  },
]

export const ALL_MODELS: ModelDefinition[] = [...IMAGE_MODELS, ...VIDEO_MODELS]

export function getModel(id: string): ModelDefinition | undefined {
  if (id === LORA_TRAINER_MODEL.id) return LORA_TRAINER_MODEL
  return ALL_MODELS.find((model) => model.id === id)
}

export function modelsFor(provider: ProviderId, kind?: 'image' | 'video'): ModelDefinition[] {
  return ALL_MODELS.filter((model) => model.providers.includes(provider) && (!kind || model.kind === kind))
}

export function videoModeCapability(
  model: VideoModelDefinition,
  mode: VideoModeKey,
): VideoModeCapability | null {
  return model.videoModes?.[mode] ?? null
}

export function videoModeDefinition(model: VideoModelDefinition, mode: VideoModeKey): VideoModelDefinition {
  const capability = videoModeCapability(model, mode)
  if (!capability) return model
  return {
    ...model,
    ratios: capability.ratios.length > 0 ? capability.ratios : model.ratios,
    durations: capability.durations.length > 0 ? capability.durations : model.durations,
    resolutions: capability.resolutions.length > 0 ? capability.resolutions : model.resolutions,
    defaultRatio: pickDefault(capability.ratios, model.defaultRatio),
    defaultDuration: pickDefault(capability.durations, model.defaultDuration),
    defaultResolution: pickDefault(capability.resolutions, model.defaultResolution),
    sound: capability.audio,
    maxImages: capability.maxImages,
  }
}

function pickDefault<T>(options: T[], fallback: T): T {
  return options.includes(fallback) ? fallback : (options[0] ?? fallback)
}

export function videoModelFromModes(input: {
  id: string
  label: string
  providerLabel: string
  providers: ProviderId[]
  videoModes: VideoModes
  maxImages?: number
  price?: string
  sourceId?: string
  schemaUrl?: string
  dynamic?: boolean
}): VideoModelDefinition {
  const modes = input.videoModes
  const keys = videoModeKeys(modes)
  const capabilities = keys.map((key) => modes[key] as VideoModeCapability)
  const unique = <T>(values: T[]): T[] => [...new Set(values)]
  const durations = unique(capabilities.flatMap((entry) => entry.durations)).sort((a, b) => a - b)
  const resolutions = unique(capabilities.flatMap((entry) => entry.resolutions))
  const ratios = unique(capabilities.flatMap((entry) => entry.ratios))
  const maxImages = Math.max(0, ...capabilities.map((entry) => entry.maxImages))
  const mode = bestVideoMode(modes)
  return {
    id: input.id,
    label: input.label,
    providerLabel: input.providerLabel,
    providers: input.providers,
    kind: 'video',
    ratios: ratios.length > 0 ? ratios : ['16:9', '9:16'],
    supportsImages: keys.some((key) => key !== 'text'),
    supportsText: modes.text !== undefined,
    maxImages: Math.max(input.maxImages ?? 1, maxImages),
    supportsQuality: false,
    qualityOptions: [],
    defaultQuality: '',
    durations: durations.length > 0 ? durations : [4, 6, 8],
    defaultDuration: durations[0] ?? 4,
    defaultRatio: ratios[0] ?? '16:9',
    resolutions: resolutions.length > 0 ? resolutions : ['720p', '1080p'],
    defaultResolution: resolutions[0] ?? '720p',
    sound: capabilities.some((entry) => entry.audio),
    modes: [],
    defaultMode: '',
    videoModes: modes,
    defaultVideoMode: mode ?? 'text',
    price: input.price,
    sourceId: input.sourceId,
    schemaUrl: input.schemaUrl,
    dynamic: input.dynamic,
  }
}

export function defaultVideoMode(model: VideoModelDefinition): VideoModeKey {
  return model.videoModes?.[model.defaultVideoMode]
    ? model.defaultVideoMode
    : (bestVideoMode(model.videoModes) ?? 'text')
}
