export interface SunraImageSpec {
  apiId: string
  textOperation: string
  imageOperation: string
  imageKey: string
  imageMode: 'array' | 'single'
  aspectRatioKey?: string
  skipAspectRatioOnEdit?: boolean
  qualityKey?: string
  qualityMap?: Record<string, string>
  outputFormat?: string
  promptMaxLength: number
  sizeKeys?: { width: string; height: string }
  extra?: Record<string, unknown>
}

export const SUNRA_IMAGE_SPECS: Record<string, SunraImageSpec> = {
  'nano-banana-2': {
    apiId: 'google/gemini-3.1-flash-image',
    textOperation: 'text-to-image',
    imageOperation: 'image-editing',
    imageKey: 'images',
    imageMode: 'array',
    aspectRatioKey: 'aspect_ratio',
    qualityKey: 'resolution',
    qualityMap: { '1k': '1K', '2k': '2K', '4k': '4K' },
    outputFormat: 'png',
    promptMaxLength: 10000,
  },
  'nano-banana-pro': {
    apiId: 'google/gemini-3-pro-image',
    textOperation: 'text-to-image',
    imageOperation: 'image-editing',
    imageKey: 'images',
    imageMode: 'array',
    aspectRatioKey: 'aspect_ratio',
    qualityKey: 'resolution',
    qualityMap: { '1k': '1K', '2k': '2K', '4k': '4K' },
    outputFormat: 'png',
    promptMaxLength: 10000,
  },
  'seedream-5-lite': {
    apiId: 'bytedance/seedream-5.0-flash',
    textOperation: 'text-to-image',
    imageOperation: 'image-editing',
    imageKey: 'images',
    imageMode: 'array',
    aspectRatioKey: 'aspect_ratio',
    qualityKey: 'resolution',
    qualityMap: { '1k': '1K', '2k': '2K' },
    promptMaxLength: 3000,
    extra: { enable_safety_checker: false },
  },
  'seedream-5-pro': {
    apiId: 'bytedance/seedream-5.0-pro',
    textOperation: 'text-to-image',
    imageOperation: 'image-editing',
    imageKey: 'images',
    imageMode: 'array',
    aspectRatioKey: 'aspect_ratio',
    qualityKey: 'resolution',
    qualityMap: { '1k': '1K', '2k': '2K' },
    outputFormat: 'jpeg',
    promptMaxLength: 3000,
    extra: { enable_safety_checker: false },
  },
  'gpt-image-2': {
    apiId: 'openai/gpt-image-2',
    textOperation: 'text-to-image',
    imageOperation: 'image-editing',
    imageKey: 'images',
    imageMode: 'array',
    qualityKey: 'quality',
    qualityMap: { '1k': 'low', '2k': 'medium', '4k': 'high' },
    outputFormat: 'png',
    promptMaxLength: 20000,
    sizeKeys: { width: 'width', height: 'height' },
    extra: { background: 'auto', n: 1 },
  },
  'grok-imagine-image': {
    apiId: 'xai/grok-imagine-image',
    textOperation: 'text-to-image',
    imageOperation: 'image-editing',
    imageKey: 'images',
    imageMode: 'array',
    aspectRatioKey: 'aspect_ratio',
    skipAspectRatioOnEdit: true,
    qualityKey: 'quality',
    qualityMap: { '1k': 'standard', '4k': 'high' },
    outputFormat: 'jpeg',
    promptMaxLength: 5000,
  },
}

export type SunraVideoPayload = 'veo' | 'kling' | 'grok'

export interface SunraVideoSpec {
  apiId: string
  apiIdByMode?: Record<string, string>
  payload: SunraVideoPayload
  operations: string[]
  promptMaxLength: number
  maxResources: number
}

export const SUNRA_VIDEO_SPECS: Record<string, SunraVideoSpec> = {
  veo3_lite: {
    apiId: 'google/veo3-1-lite',
    payload: 'veo',
    operations: ['text-to-video', 'image-to-video'],
    promptMaxLength: 10000,
    maxResources: 2,
  },
  veo3_fast: {
    apiId: 'google/veo3-1-fast',
    payload: 'veo',
    operations: ['text-to-video', 'image-to-video'],
    promptMaxLength: 10000,
    maxResources: 2,
  },
  veo3: {
    apiId: 'google/veo3-1',
    payload: 'veo',
    operations: ['text-to-video', 'image-to-video', 'reference-to-video'],
    promptMaxLength: 10000,
    maxResources: 3,
  },
  'kling-3.0': {
    apiId: 'kling/kling-v3-pro',
    apiIdByMode: {
      std: 'kling/kling-v3-standard',
      pro: 'kling/kling-v3-pro',
      '4K': 'kling/kling-v3-4k',
    },
    payload: 'kling',
    operations: ['text-to-video', 'image-to-video'],
    promptMaxLength: 2500,
    maxResources: 3,
  },
  'kling-3.0-turbo': {
    apiId: 'kling/kling-v3-standard',
    payload: 'kling',
    operations: ['text-to-video', 'image-to-video'],
    promptMaxLength: 2500,
    maxResources: 2,
  },
  'grok-imagine': {
    apiId: 'xai/grok-imagine-video',
    payload: 'grok',
    operations: ['text-to-video', 'image-to-video', 'reference-to-video'],
    promptMaxLength: 5000,
    maxResources: 7,
  },
}

export interface FalImageSpec {
  endpoint: string
  editEndpoint?: string
  imageKey?: string
  imageMode?: 'array' | 'single'
  supportsSafetyChecker: boolean
  promptMaxLength: number
  sizeNameKey?: string
}

export const FAL_IMAGE_SPECS: Record<string, FalImageSpec> = {
  'gpt-image-2': {
    endpoint: 'openai/gpt-image-2',
    editEndpoint: 'openai/gpt-image-2/edit',
    imageKey: 'image_urls',
    imageMode: 'array',
    supportsSafetyChecker: true,
    promptMaxLength: 20000,
  },
  'flux-lora': {
    endpoint: 'fal-ai/flux-lora',
    supportsSafetyChecker: true,
    promptMaxLength: 2000,
    sizeNameKey: 'image_size',
  },
}

export interface WiroImageSpec {
  /** `{owner}/{slug}` on Wiro, appended to `/v1/Run/`. */
  endpoint: string
  ratioKey?: string
  resolutionKey?: string
  qualityMap?: Record<string, string>
  /** Set on models that take reference images; uploaded as multipart `{field}`. */
  imageField?: string
  maxImages?: number
  /** Fixed extras Wiro documents per model (for example `promptExtend`). */
  extra?: Record<string, string>
}

export const WIRO_IMAGE_SPECS: Record<string, WiroImageSpec> = {
  'z-image-uncensored': {
    endpoint: 'wiro-partners/z-image-uncensored',
    ratioKey: 'ratio',
  },
  'z-image-pro-uncensored': {
    endpoint: 'wiro-partners/z-image-pro-uncensored',
    ratioKey: 'ratio',
    resolutionKey: 'resolution',
    qualityMap: { '1k': '1k', '2k': '2k' },
    extra: { promptExtend: 'false' },
  },
  'qwen-image-edit-uncensored': {
    endpoint: 'wiro-partners/qwen-image-edit-uncensored',
    imageField: 'inputImage',
    maxImages: 3,
  },
}
