import type { ImageModelDefinition } from '@sunnygen/core'
import { SUNRA_IMAGE_SPECS, type SunraImageSpec } from '../models'
import {
  conformBody,
  enumValues,
  isArrayProperty,
  matchEnumValue,
  maxItemsOf,
  maxLengthOf,
  schemaValue,
} from '../schema'
import { boundedImageSize } from '../sizes'
import { ProviderError, type AdapterContext, type ProviderFlow, type ProviderRequest } from '../types'
import { SUNRA_BASE, cleanSunraPrompt, submitSunraQueue, uploadSunraAsset } from './client'
import {
  fetchSunraSchema,
  sunraImageField,
  sunraImageOperations,
  type SunraModelSchema,
  type SunraOperation,
} from './schema'

const PROMPT_LIMIT = 20_000

function specAlias(model: ImageModelDefinition, spec: SunraImageSpec | undefined): string | null {
  if (spec) return spec.apiId
  return model.dynamic && model.sourceId ? model.sourceId : null
}

function schemaBody(
  model: ImageModelDefinition,
  request: ProviderRequest,
  urls: string[],
  schema: SunraModelSchema,
  operation: SunraOperation,
  spec: SunraImageSpec | undefined,
): Record<string, unknown> {
  const { components } = schema
  const properties = operation.schema.properties
  const quality = String(request.params.quality ?? model.defaultQuality)
  const aspectRatio = String(request.params.aspectRatio ?? '1:1')
  const body: Record<string, unknown> = {
    prompt: cleanSunraPrompt(
      request.prompt,
      Math.min(maxLengthOf(properties.prompt, components) ?? PROMPT_LIMIT, PROMPT_LIMIT),
    ),
  }

  if (urls.length > 0) {
    const field = sunraImageField(operation.schema)
    if (!field) {
      throw new ProviderError('sunra', `${model.label} does not accept reference images on this endpoint`)
    }
    const max = Math.min(
      maxItemsOf(properties[field], components) ?? model.maxImages,
      model.maxImages > 0 ? model.maxImages : Number.POSITIVE_INFINITY,
    )
    const limit = Number.isFinite(max) ? max : urls.length
    body[field] = isArrayProperty(properties[field], components) ? urls.slice(0, limit) : urls[0]
  }

  if ('aspect_ratio' in properties) {
    const value = schemaValue('aspect_ratio', operation.schema, components, aspectRatio)
    if (value !== undefined) body.aspect_ratio = value
  }
  if ('resolution' in properties) {
    const value = schemaValue('resolution', operation.schema, components, quality)
    if (value !== undefined) body.resolution = value
  }
  if ('quality' in properties) {
    const allowed = enumValues(properties.quality, components)
    const mapped = (spec?.qualityMap?.[quality] && matchEnumValue(allowed, spec.qualityMap[quality])) ?? null
    const value = mapped ?? schemaValue('quality', operation.schema, components, quality)
    if (value !== undefined) body.quality = value
  }
  if ('width' in properties && 'height' in properties) {
    const size = boundedImageSize(aspectRatio, quality)
    if (size) {
      body.width = size.width
      body.height = size.height
    }
  }
  if ('output_format' in properties) {
    const formats = enumValues(properties.output_format, components)
    const preferred = [spec?.outputFormat, 'png', 'jpeg'].find(
      (candidate): candidate is string => Boolean(candidate) && formats.includes(candidate as string),
    )
    if (preferred) body.output_format = preferred
  }
  if ('background' in properties) {
    const value = matchEnumValue(enumValues(properties.background, components), 'auto')
    if (value) body.background = value
  }
  if ('n' in properties) body.n = 1
  if ('enable_safety_checker' in properties) body.enable_safety_checker = false

  return conformBody(body, operation.schema, components)
}

function fallbackBody(
  request: ProviderRequest,
  urls: string[],
  model: ImageModelDefinition,
  spec: SunraImageSpec,
): Record<string, unknown> {
  const hasImages = urls.length > 0
  const quality = String(request.params.quality ?? model.defaultQuality)
  const aspectRatio = String(request.params.aspectRatio ?? '1:1')
  const body: Record<string, unknown> = {
    prompt: cleanSunraPrompt(request.prompt, spec.promptMaxLength),
  }
  if (hasImages) {
    body[spec.imageKey] = spec.imageMode === 'single' ? urls[0] : urls.slice(0, model.maxImages)
  }
  if (spec.aspectRatioKey && !(hasImages && spec.skipAspectRatioOnEdit)) {
    body[spec.aspectRatioKey] = aspectRatio
  }
  if (spec.qualityKey) {
    body[spec.qualityKey] = spec.qualityMap?.[quality] ?? quality
  }
  if (spec.sizeKeys) {
    const size = boundedImageSize(aspectRatio, quality)
    if (size) {
      body[spec.sizeKeys.width] = size.width
      body[spec.sizeKeys.height] = size.height
    }
  }
  if (spec.outputFormat) body.output_format = spec.outputFormat
  if (spec.extra) Object.assign(body, spec.extra)
  return body
}

async function buildImageRequest(
  context: AdapterContext,
  request: ProviderRequest,
  urls: string[],
): Promise<{ endpoint: string; body: Record<string, unknown> }> {
  const model = request.model as ImageModelDefinition
  const spec = SUNRA_IMAGE_SPECS[model.id]
  const alias = specAlias(model, spec)
  if (!alias) throw new ProviderError('sunra', `${model.label} is not available on Sunra`)

  const hasImages = urls.length > 0
  const schema = await fetchSunraSchema(context, alias, model.schemaUrl)
  if (schema) {
    const operations = sunraImageOperations(schema)
    const operation = hasImages ? operations.edit : operations.text
    if (!operation) {
      const reason = hasImages
        ? `${model.label} has no image edit endpoint on Sunra.ai`
        : `${model.label} only works from a reference image on Sunra.ai`
      throw new ProviderError('sunra', reason)
    }
    return {
      endpoint: `${SUNRA_BASE}/queue${operation.schema.path}`,
      body: schemaBody(model, request, urls, schema, operation, spec),
    }
  }

  if (!spec) {
    throw new ProviderError(
      'sunra',
      `${model.label} has no documented request schema on Sunra.ai right now. Try again or pick another model.`,
    )
  }

  const operation = hasImages ? spec.imageOperation : spec.textOperation
  return {
    endpoint: `${SUNRA_BASE}/queue/${spec.apiId}/${operation}`,
    body: fallbackBody(request, urls, model, spec),
  }
}

export const sunraImageFlow: ProviderFlow = {
  id: 'sunra.image',
  kind: 'image',
  matches: (model) => model.kind === 'image',
  async submit(context, request) {
    const urls = await Promise.all(request.assets.map((asset) => uploadSunraAsset(context, asset)))
    const { endpoint, body } = await buildImageRequest(context, request, urls)
    return submitSunraQueue(context, endpoint, body, request.webhookUrl)
  },
}
