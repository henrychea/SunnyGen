import {
  videoModeCapability,
  type VideoModeCapability,
  type VideoModeKey,
  type VideoModelDefinition,
} from '@sunnygen/core'
import {
  asRecord,
  conformBody,
  maxLengthOf,
  missingRequired,
  schemaValue,
  variants,
  type RequestSchema,
} from '../schema'
import { ProviderError, type ProviderFlow, type ProviderRequest } from '../types'
import { fetchFalSchema } from './image'
import { submitFalQueue, uploadFalAsset } from './client'

const PROMPT_LIMIT = 20_000

function requestedVideoCapability(
  model: VideoModelDefinition,
  request: ProviderRequest,
): VideoModeCapability | null {
  const mode = String(request.params.videoMode ?? '')
  if (mode !== 'text' && mode !== 'image' && mode !== 'frames' && mode !== 'references' && mode !== 'edit') {
    return null
  }
  return videoModeCapability(model, mode satisfies VideoModeKey)
}

function imageBody(capability: VideoModeCapability, urls: string[]): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (capability.fieldsMode === 'array') {
    const field = capability.fields[0]
    if (!field) return body
    const list = urls.slice(0, capability.maxImages)
    body[field] =
      field === 'elements' ? list.map((url) => ({ frontal_image_url: url, reference_image_urls: [] })) : list
    return body
  }
  capability.fields.forEach((field, index) => {
    const url = urls[index]
    if (url) body[field] = url
  })
  return body
}

function applyRequiredDefaults(
  body: Record<string, unknown>,
  schema: RequestSchema,
  components: Record<string, unknown>,
): void {
  for (const key of schema.required) {
    if (body[key] !== undefined) continue
    const property = asRecord(schema.properties[key])
    if (!property) continue
    const variant = variants(property, components).find((entry) => entry.default !== undefined)
    if (variant?.default !== undefined) body[key] = variant.default
  }
}

export const falVideoFlow: ProviderFlow = {
  id: 'fal.video',
  kind: 'video',
  matches: (model) => model.kind === 'video',
  async submit(context, request) {
    const model = request.model as VideoModelDefinition
    const capability = requestedVideoCapability(model, request)
    const endpoint = capability?.endpoint ?? (model.dynamic ? model.sourceId : null)
    if (!endpoint) {
      throw new ProviderError(
        'fal',
        request.params.videoMode
          ? `${model.label} does not document ${String(request.params.videoMode)} video on fal.ai`
          : `${model.label} is not available on fal.ai`,
      )
    }

    const urls = await Promise.all(request.assets.map((asset) => uploadFalAsset(context, asset)))
    if (!capability) {
      const body: Record<string, unknown> = {
        prompt: request.prompt.slice(0, PROMPT_LIMIT),
        duration: request.params.durationSeconds ?? model.defaultDuration,
        resolution: request.params.resolution ?? model.defaultResolution,
      }
      if (urls[0]) body.image_url = urls[0]
      if (urls.length > 1) body.reference_image_urls = urls.slice(1, 1 + Math.max(0, model.maxImages - 1))
      return submitFalQueue(context, endpoint, body, request.webhookUrl, request.assets)
    }

    const schema = await fetchFalSchema(context, endpoint)
    const body: Record<string, unknown> = { prompt: request.prompt.slice(0, PROMPT_LIMIT) }

    const videoField = capability.videoField
    const sourceVideo = videoField ? urls[0] : undefined
    if (videoField && sourceVideo) body[videoField] = sourceVideo
    Object.assign(body, imageBody(capability, videoField ? urls.slice(1) : urls))
    if ('generate_audio' in (schema?.properties ?? {})) body.generate_audio = Boolean(request.params.sound)
    else if ('audio' in (schema?.properties ?? {})) body.audio = Boolean(request.params.sound)
    if (schema) {
      body.prompt = request.prompt.slice(
        0,
        maxLengthOf(schema.properties.prompt, schema.components) ?? PROMPT_LIMIT,
      )
      const duration = Number(request.params.durationSeconds)
      if (Number.isFinite(duration) && duration > 0 && 'duration' in schema.properties) {
        body.duration = schemaValue('duration', schema, schema.components, duration) ?? duration
      }
      for (const key of ['aspect_ratio', 'resolution'] as const) {
        if (!(key in schema.properties)) continue
        const wanted = request.params[key === 'aspect_ratio' ? 'aspectRatio' : 'resolution']
        if (wanted === undefined || wanted === null || wanted === '') continue
        const value = schemaValue(key, schema, schema.components, wanted)
        if (value !== undefined) body[key] = value
      }
    }

    if (!schema) {
      throw new ProviderError('fal', `${model.label} has no documented request schema on fal.ai right now.`)
    }

    applyRequiredDefaults(body, schema, schema.components)
    const conformed = conformBody(body, schema, schema.components)
    const missing = missingRequired(conformed, schema)
    if (missing.length > 0) {
      throw new ProviderError(
        'fal',
        `${model.label} needs ${missing.join(', ')} on the ${endpoint} endpoint.`,
      )
    }
    return submitFalQueue(context, endpoint, conformed, request.webhookUrl, request.assets)
  },
}
