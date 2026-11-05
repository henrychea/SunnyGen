import type { ProviderId } from './domain'

export interface ModelBase {
  id: string
  label: string
  providerLabel: string
  providers: ProviderId[]
  ratios: string[]
  supportsImages: boolean
  maxImages: number
  supportsQuality: boolean
  qualityOptions: string[]
  defaultQuality: string
  price?: string
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
}

export type ModelDefinition = ImageModelDefinition | VideoModelDefinition

const GEMINI_RATIOS = ['21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16']
const SEEDREAM_RATIOS = ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '21:9']
const GPT_IMAGE_RATIOS = ['auto', '1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16', '21:9']
const GROK_RATIOS = ['1:1', '2:1', '16:9', '4:3', '3:2', '2:3', '3:4', '9:16', '1:2']

export const IMAGE_MODELS: ImageModelDefinition[] = [
  {
    id: 'nano-banana-2',
    label: 'Nano Banana 2',
    providerLabel: 'Google',
    kind: 'image',
    providers: ['sunra'],
    ratios: GEMINI_RATIOS,
    supportsImages: true,
    maxImages: 14,
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
    qualityOptions: ['2k', '4k'],
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
    price: '$0.05–$0.07 per second',
  },
]

export const ALL_MODELS: ModelDefinition[] = [...IMAGE_MODELS, ...VIDEO_MODELS]

export function getModel(id: string): ModelDefinition | undefined {
  return ALL_MODELS.find((model) => model.id === id)
}

export function modelsFor(provider: ProviderId, kind?: 'image' | 'video'): ModelDefinition[] {
  return ALL_MODELS.filter((model) => model.providers.includes(provider) && (!kind || model.kind === kind))
}
