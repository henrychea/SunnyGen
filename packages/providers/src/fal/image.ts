import { LORA_SCALE_DEFAULT, type ImageModelDefinition } from '@sunnygen/core'
import { FAL_IMAGE_SPECS } from '../models'
import {
  acceptsObject,
  conformBody,
  enumValues,
  isArrayProperty,
  maxItemsOf,
  parseOpenApi,
  type RequestSchema,
} from '../schema'
import { gptImageSize } from '../sizes'
import { ProviderError, type AdapterContext, type ProviderFlow, type ProviderRequest } from '../types'
import { requireFalKey, submitFalQueue, uploadFalAsset } from './client'

const FAL_IMAGE_FIELDS = [
  'image_urls',
  'images',
  'reference_image_urls',
  'reference_images',
  'input_images',
  'image_url',
  'input_image_url',
  'input_image',
  'image',
] as const

const FAL_SIZE_NAMES = [
  'square_hd',
  'square',
  'landscape_4_3',
  'portrait_4_3',
  'landscape_16_9',
  'portrait_16_9',
]

const MAX_SIDE = 3840
const MAX_PIXELS = 8_294_400
const SIZE_NAMES: Record<string, string[]> = {
  '1:1': ['square_hd', 'square'],
  '4:3': ['landscape_4_3'],
  '3:4': ['portrait_4_3'],
  '16:9': ['landscape_16_9'],
  '9:16': ['portrait_16_9'],
  '3:2': ['landscape_4_3'],
  '2:3': ['portrait_4_3'],
  '21:9': ['landscape_16_9'],
}

export interface FalRequestSchema {
  path: string
  properties: Record<string, unknown>
  required: string[]
  closed: boolean
  components: Record<string, unknown>
}

const schemaCache = new Map<string, Promise<FalRequestSchema | null>>()

export function resetFalSchemaCache(): void {
  schemaCache.clear()
}

function falSize(aspectRatio: string, quality: string): { width: number; height: number } | null {
  const size = gptImageSize(aspectRatio, quality)
  if (!size) return null
  let width = Math.min(size.width, MAX_SIDE)
  let height = Math.min(size.height, MAX_SIDE)
  if (width * height > MAX_PIXELS) {
    const scale = Math.sqrt(MAX_PIXELS / (width * height))
    width = Math.floor((width * scale) / 16) * 16
    height = Math.floor((height * scale) / 16) * 16
  }
  return { width, height }
}

function falSizeName(aspectRatio: string, allowed: string[]): string | undefined {
  const preferred = SIZE_NAMES[aspectRatio] ?? []
  const match = preferred.find((name) => allowed.includes(name))
  if (match) return match
  const [width, height] = aspectRatio.split(':').map(Number)
  if (!width || !height) return undefined
  const fallback = width >= height ? 'landscape_4_3' : 'portrait_4_3'
  return allowed.includes(fallback) ? fallback : undefined
}

export function falOpenApiUrl(endpoint: string): string {
  return `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=${encodeURIComponent(endpoint)}`
}

export function parseFalOpenApi(document: unknown): FalRequestSchema | null {
  const parsed = parseOpenApi(document)
  if (!parsed) return null
  const path = Object.keys(parsed.paths).find((key) => !key.includes('{'))
  const schema: RequestSchema | undefined = path ? parsed.paths[path] : undefined
  if (!path || !schema) return null
  return {
    path,
    properties: schema.properties,
    required: schema.required,
    closed: schema.closed,
    components: parsed.components,
  }
}

async function fetchFalSchema(context: AdapterContext, endpoint: string): Promise<FalRequestSchema | null> {
  const cached = schemaCache.get(endpoint)
  if (cached) return cached

  const pending = (async () => {
    try {
      const response = await context.fetch(falOpenApiUrl(endpoint), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      })
      if (!response.ok) return null
      return parseFalOpenApi(await response.json().catch(() => null))
    } catch {
      return null
    }
  })()

  schemaCache.set(endpoint, pending)
  const schema = await pending
  if (!schema) schemaCache.delete(endpoint)
  return schema
}

function fallbackPrompt(request: ProviderRequest, limit: number): string {
  return request.prompt
    .replace(/<<<image (\d+)>>>/gi, (_match, index: string) => `image ${index}`)
    .slice(0, limit)
}

function buildFallbackBody(
  model: ImageModelDefinition,
  request: ProviderRequest,
  urls: string[],
  spec?: (typeof FAL_IMAGE_SPECS)[string],
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    prompt: fallbackPrompt(request, spec?.promptMaxLength ?? 20_000),
    num_images: 1,
    output_format: 'png',
  }
  if (urls.length > 0) {
    if (spec?.imageKey) {
      body[spec.imageKey] = spec.imageMode === 'single' ? urls[0] : urls.slice(0, model.maxImages)
    } else {
      body.image_urls = urls.slice(0, model.maxImages)
    }
  }
  if (spec?.supportsSafetyChecker) body.enable_safety_checker = false
  const aspectRatio = request.params.aspectRatio
  if (aspectRatio && aspectRatio !== 'auto') {
    const name = spec?.sizeNameKey ? falSizeName(aspectRatio, FAL_SIZE_NAMES) : undefined
    if (spec?.sizeNameKey) {
      if (name) body[spec.sizeNameKey] = name
    } else {
      body.aspect_ratio = aspectRatio
    }
  }
  applyLoraWeights(body, request)
  return body
}

function schemaImageField(
  properties: Record<string, unknown>,
  components: Record<string, unknown>,
): { field: string; max: number | null } | null {
  const field = FAL_IMAGE_FIELDS.find((name) => name in properties)
  if (!field) return null
  return { field, max: maxItemsOf(properties[field], components) }
}

function buildSchemaBody(
  model: ImageModelDefinition,
  request: ProviderRequest,
  urls: string[],
  schema: FalRequestSchema,
): Record<string, unknown> {
  const { properties, components } = schema
  const body: Record<string, unknown> = {}
  if ('prompt' in properties) body.prompt = fallbackPrompt(request, 20_000)
  if ('num_images' in properties) body.num_images = 1
  if ('output_format' in properties) {
    const formats = enumValues(properties.output_format, components)
    if (formats.length === 0 || formats.includes('png')) body.output_format = 'png'
    else if (formats.includes('jpeg')) body.output_format = 'jpeg'
  }
  if ('enable_safety_checker' in properties) body.enable_safety_checker = false

  const aspectRatio = request.params.aspectRatio
  if (aspectRatio && aspectRatio !== 'auto') {
    if ('aspect_ratio' in properties) {
      const allowed = enumValues(properties.aspect_ratio, components)
      if (allowed.length === 0 || allowed.includes(aspectRatio)) body.aspect_ratio = aspectRatio
    } else if ('image_size' in properties) {
      const allowed = enumValues(properties.image_size, components)
      if (acceptsObject(properties.image_size, components)) {
        const size = falSize(aspectRatio, String(request.params.quality ?? model.defaultQuality))
        if (size) body.image_size = size
      } else {
        const name = falSizeName(aspectRatio, allowed)
        if (name) body.image_size = name
      }
    }
  }

  if ('resolution' in properties) {
    const quality = String(request.params.quality ?? model.defaultQuality)
    const resolution = quality === '1k' ? '1K' : quality === '2k' ? '2K' : quality === '4k' ? '4K' : null
    const allowed = enumValues(properties.resolution, components)
    if (resolution && (allowed.length === 0 || allowed.includes(resolution))) {
      body.resolution = resolution
    }
  }

  if (urls.length > 0) {
    const image = schemaImageField(properties, components)
    if (!image) {
      throw new ProviderError('fal', `${model.label} does not accept image inputs on this endpoint`)
    }
    const array = isArrayProperty(properties[image.field], components) || /(urls|images)$/.test(image.field)
    const max = Math.min(
      image.max ?? model.maxImages,
      model.maxImages > 0 ? model.maxImages : Number.POSITIVE_INFINITY,
    )
    const limit = Number.isFinite(max) ? max : urls.length
    body[image.field] = array ? urls.slice(0, limit) : urls[0]
  }
  applyLoraWeights(body, request)
  return conformBody(body, schema, components)
}

function applyLoraWeights(body: Record<string, unknown>, request: ProviderRequest): void {
  if (!request.model.supportsLora) return
  const lora = request.params.lora as { path?: unknown; scale?: unknown } | undefined
  if (!lora || typeof lora.path !== 'string' || !lora.path) return
  const scale = Number(lora.scale)
  body.loras = [{ path: lora.path, scale: Number.isFinite(scale) && scale > 0 ? scale : LORA_SCALE_DEFAULT }]
}

export const falImageFlow: ProviderFlow = {
  id: 'fal.image',
  kind: 'image',
  matches: (model) => model.kind === 'image',
  async submit(context, request) {
    const model = request.model as ImageModelDefinition
    const spec = FAL_IMAGE_SPECS[model.id]
    const dynamic = !spec && model.dynamic && model.sourceId
    if (!spec && !dynamic) {
      throw new ProviderError('fal', `${model.label} is not available on fal.ai`)
    }

    requireFalKey(context)
    const wantsImages = request.assets.length > 0
    const endpoint = dynamic
      ? wantsImages && model.editSourceId
        ? model.editSourceId
        : (model.sourceId as string)
      : wantsImages && spec?.editEndpoint
        ? spec.editEndpoint
        : (spec?.endpoint as string)
    const schema = await fetchFalSchema(context, endpoint)
    if (schema && wantsImages && !schemaImageField(schema.properties, schema.components)) {
      throw new ProviderError('fal', `${model.label} can't edit images. Pick a model that supports Edit.`)
    }
    const urls = await Promise.all(request.assets.map((asset) => uploadFalAsset(context, asset)))
    const body = schema
      ? buildSchemaBody(model, request, urls, schema)
      : buildFallbackBody(model, request, urls, spec)
    return submitFalQueue(context, endpoint, body, request.webhookUrl)
  },
}

export interface FalImageCapabilities {
  supportsImages: boolean
  supportsText: boolean
  imageField: string | null
  maxImages: number
}

export const DEFAULT_FAL_IMAGE_LIMIT = 10

export function falImageCapabilities(schema: FalRequestSchema | null): FalImageCapabilities {
  if (!schema) {
    return { supportsImages: false, supportsText: false, imageField: null, maxImages: 0 }
  }
  const image = schemaImageField(schema.properties, schema.components)
  const array = image ? isArrayProperty(schema.properties[image.field], schema.components) : false
  return {
    supportsImages: Boolean(image),
    supportsText: 'prompt' in schema.properties,
    imageField: image?.field ?? null,
    maxImages: image ? (image.max ?? (array ? DEFAULT_FAL_IMAGE_LIMIT : 1)) : 0,
  }
}
