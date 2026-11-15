import type { ImageModelDefinition } from '@sunnygen/core'
import { FAL_IMAGE_SPECS } from '../models'
import { gptImageSize } from '../sizes'
import { ProviderError, type AdapterContext, type ProviderFlow, type ProviderRequest } from '../types'
import { FAL_PLATFORM, requireFalKey, submitFalQueue, uploadFalAsset } from './client'

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

interface FalRequestSchema {
  properties: Record<string, unknown>
  components: Record<string, unknown>
}

interface FalModelsPayload {
  models?: Array<{
    endpoint_id?: string
    openapi?: {
      paths?: Record<
        string,
        {
          post?: {
            requestBody?: {
              content?: {
                'application/json'?: { schema?: unknown }
              }
            }
          }
        }
      >
      components?: { schemas?: Record<string, unknown> }
    }
  }>
}

const schemaCache = new Map<string, Promise<FalRequestSchema | null>>()

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function variants(
  value: unknown,
  components: Record<string, unknown>,
  depth = 0,
): Array<Record<string, unknown>> {
  const record = asRecord(value)
  if (!record || depth > 4) return []
  if (typeof record.$ref === 'string') {
    const name = record.$ref.split('/').pop()
    return name && components[name] ? variants(components[name], components, depth + 1) : []
  }
  const nested: Array<Record<string, unknown>> = []
  for (const key of ['anyOf', 'oneOf', 'allOf']) {
    const list = record[key]
    if (!Array.isArray(list)) continue
    for (const entry of list) nested.push(...variants(entry, components, depth + 1))
  }
  return nested.length > 0 ? nested : [record]
}

function enumValues(property: unknown, components: Record<string, unknown>): string[] {
  const values = new Set<string>()
  for (const variant of variants(property, components)) {
    if (!Array.isArray(variant.enum)) continue
    for (const value of variant.enum) {
      if (typeof value === 'string') values.add(value)
    }
  }
  return [...values]
}

function acceptsObject(property: unknown, components: Record<string, unknown>): boolean {
  return variants(property, components).some(
    (variant) => variant.type === 'object' || asRecord(variant.properties) !== null,
  )
}

function isArrayProperty(property: unknown, components: Record<string, unknown>): boolean {
  return variants(property, components).some((variant) => variant.type === 'array')
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

async function fetchFalSchema(
  context: AdapterContext,
  endpoint: string,
): Promise<FalRequestSchema | null> {
  const cached = schemaCache.get(endpoint)
  if (cached) return cached

  const pending = (async () => {
    const key = requireFalKey(context)
    try {
      const params = new URLSearchParams({ expand: 'openapi-3.0' })
      params.append('endpoint_id', endpoint)
      const response = await context.fetch(`${FAL_PLATFORM}/v1/models?${params}`, {
        headers: { Authorization: `Key ${key}` },
        signal: AbortSignal.timeout(15_000),
      })
      if (!response.ok) return null
      const payload = (await response.json().catch(() => null)) as FalModelsPayload | null
      const model = payload?.models?.find((entry) => entry.endpoint_id === endpoint) ?? payload?.models?.[0]
      const paths = model?.openapi?.paths ?? {}
      const pathKey = Object.keys(paths).find((key) => !key.includes('{') && paths[key]?.post)
      const requestSchema = pathKey
        ? paths[pathKey]?.post?.requestBody?.content?.['application/json']?.schema
        : undefined
      const record = asRecord(requestSchema)
      const ref = typeof record?.$ref === 'string' ? record.$ref.split('/').pop() : undefined
      const components = model?.openapi?.components?.schemas ?? {}
      const resolved = ref && components[ref] ? asRecord(components[ref]) : record
      const properties = asRecord(resolved?.properties)
      return properties ? { properties, components } : null
    } catch {
      return null
    }
  })()

  schemaCache.set(endpoint, pending)
  try {
    const schema = await pending
    if (!schema) schemaCache.delete(endpoint)
    return schema
  } catch (error) {
    schemaCache.delete(endpoint)
    throw error
  }
}

function buildFallbackBody(
  model: ImageModelDefinition,
  request: ProviderRequest,
  urls: string[],
  spec?: (typeof FAL_IMAGE_SPECS)[string],
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    prompt: request.prompt
      .replace(/<<<image (\d+)>>>/gi, (_match, index: string) => `image ${index}`)
      .slice(0, spec?.promptMaxLength ?? 20_000),
    num_images: 1,
    output_format: 'png',
  }
  if (urls.length > 0) {
    if (spec) {
      body[spec.imageKey] = spec.imageMode === 'single' ? urls[0] : urls.slice(0, model.maxImages)
    } else {
      body.image_urls = urls.slice(0, model.maxImages)
    }
  }
  if (spec?.supportsSafetyChecker) body.enable_safety_checker = false
  const aspectRatio = request.params.aspectRatio
  if (aspectRatio && aspectRatio !== 'auto') body.aspect_ratio = aspectRatio
  return body
}

function buildSchemaBody(
  model: ImageModelDefinition,
  request: ProviderRequest,
  urls: string[],
  schema: FalRequestSchema,
): Record<string, unknown> {
  const { properties, components } = schema
  const body: Record<string, unknown> = {
    prompt: request.prompt
      .replace(/<<<image (\d+)>>>/gi, (_match, index: string) => `image ${index}`)
      .slice(0, 20_000),
  }
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
    const field = FAL_IMAGE_FIELDS.find((name) => name in properties)
    if (!field) {
      throw new ProviderError('fal', `${model.label} does not accept image inputs on this endpoint`)
    }
    const array = isArrayProperty(properties[field], components) || /(urls|images)$/.test(field)
    body[field] = array ? urls.slice(0, model.maxImages) : urls[0]
  }
  return body
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

    const urls = await Promise.all(request.assets.map((asset) => uploadFalAsset(context, asset)))
    const endpoint = dynamic
      ? urls.length > 0 && model.editSourceId
        ? model.editSourceId
        : (model.sourceId as string)
      : urls.length > 0 && spec?.editEndpoint
        ? spec.editEndpoint
        : (spec?.endpoint as string)
    const schema = await fetchFalSchema(context, endpoint)
    const body = schema
      ? buildSchemaBody(model, request, urls, schema)
      : buildFallbackBody(model, request, urls, spec)
    return submitFalQueue(context, endpoint, body, request.webhookUrl)
  },
}
