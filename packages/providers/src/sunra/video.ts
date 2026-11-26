import {
  videoModeCapability,
  type VideoModeCapability,
  type VideoModeKey,
  type VideoModelDefinition,
} from '@sunnygen/core'
import { SUNRA_VIDEO_SPECS, type SunraVideoSpec } from '../models'
import {
  conformBody,
  isArrayProperty,
  maxItemsOf,
  maxLengthOf,
  schemaValue,
  type RequestSchema,
} from '../schema'
import { ProviderError, type AdapterContext, type ProviderFlow, type ProviderRequest } from '../types'
import { applySafetyFields } from '../safety'
import { SUNRA_BASE, cleanSunraPrompt, submitSunraQueue, uploadSunraAsset } from './client'
import { fetchSunraSchema, type SunraModelSchema } from './schema'

const PROMPT_LIMIT = 20_000

const IMAGE_FIELDS = ['start_image_url', 'image', 'image_url', 'input_image'] as const
const END_IMAGE_FIELDS = ['end_image_url', 'end_image', 'last_frame_image_url', 'tail_image_url'] as const
const REFERENCE_FIELDS = ['reference_images', 'reference_image_urls', 'image_urls', 'input_images'] as const
const AUDIO_FIELDS = ['generate_audio', 'audio'] as const

function firstField(schema: RequestSchema, names: readonly string[]): string | null {
  return names.find((name) => name in schema.properties) ?? null
}

function pickOperation(
  schema: SunraModelSchema | null,
  options: { hasImage: boolean; hasReferences: boolean },
): { name: string; schema: RequestSchema } | null {
  if (!schema) return null
  const available = schema.operations
  const order = options.hasImage
    ? ['image-to-video', 'reference-to-video', 'text-to-video']
    : options.hasReferences
      ? ['reference-to-video', 'text-to-video', 'image-to-video']
      : ['text-to-video', 'reference-to-video', 'image-to-video']
  for (const name of order) {
    const operation = available[name]
    if (operation) return { name, schema: operation }
  }
  return null
}

function legacyOperation(
  spec: SunraVideoSpec,
  options: { hasImage: boolean; hasReferences: boolean },
): string {
  if (options.hasImage) return 'image-to-video'
  if (options.hasReferences && spec.operations.includes('reference-to-video')) return 'reference-to-video'
  return 'text-to-video'
}

function requestedMode(request: ProviderRequest): VideoModeKey | null {
  const mode = String(request.params.videoMode ?? '')
  return mode === 'text' || mode === 'image' || mode === 'frames' || mode === 'references' || mode === 'edit'
    ? mode
    : null
}

function capabilityPath(alias: string, capability: VideoModeCapability): string {
  const operation = capability.endpoint.split('/').filter(Boolean).pop() ?? ''
  return `${alias}/${operation}`
}

function capabilityOperation(schema: SunraModelSchema, path: string): RequestSchema | null {
  return Object.values(schema.operations).find((operation) => operation.path === `/${path}`) ?? null
}

interface VideoInputs {
  prompt: string
  duration: number
  aspectRatio: string
  resolution: string
  sound: boolean
  startFrame?: string
  endFrame?: string
  references: string[]
  sourceVideo?: string
  nsfw: boolean
}

function modeInputs(
  mode: VideoModeKey,
  capability: VideoModeCapability,
  urls: string[],
  inputs: Omit<VideoInputs, 'startFrame' | 'endFrame' | 'references'>,
): VideoInputs {
  if (mode === 'image') return { ...inputs, startFrame: urls[0], references: [] }
  if (mode === 'frames') return { ...inputs, startFrame: urls[0], endFrame: urls[1], references: [] }
  if (mode === 'references') return { ...inputs, references: urls.slice(0, capability.maxImages) }
  if (mode === 'edit') {
    return { ...inputs, sourceVideo: urls[0], references: urls.slice(1, 1 + capability.maxImages) }
  }
  return { ...inputs, references: [] }
}

function applyImages(
  body: Record<string, unknown>,
  capability: VideoModeCapability,
  inputs: VideoInputs,
  operation: RequestSchema,
  components: Record<string, unknown>,
  model: VideoModelDefinition,
): void {
  if (capability.fieldsMode === 'array') {
    const field = capability.fields[0]
    if (!field || inputs.references.length === 0) return
    const max = maxItemsOf(operation.properties[field], components) ?? capability.maxImages
    const list = inputs.references.slice(0, Math.max(0, max))
    body[field] =
      field === 'elements'
        ? list.map((url) => ({ frontal_image_url: url, reference_image_urls: [] }))
        : isArrayProperty(operation.properties[field], components)
          ? list
          : list[0]
    return
  }
  const frames = [inputs.startFrame, inputs.endFrame]
  capability.fields.forEach((field, index) => {
    const url = frames[index]
    if (url) body[field] = url
  })
  if (!model.supportsImages) return
}

function capabilityBody(
  model: VideoModelDefinition,
  capability: VideoModeCapability,
  inputs: VideoInputs,
  operation: RequestSchema,
  components: Record<string, unknown>,
): Record<string, unknown> {
  const properties = operation.properties
  const body: Record<string, unknown> = {
    prompt: cleanSunraPrompt(
      inputs.prompt,
      Math.min(maxLengthOf(properties.prompt, components) ?? PROMPT_LIMIT, PROMPT_LIMIT),
    ),
  }
  if (capability.videoField && inputs.sourceVideo) body[capability.videoField] = inputs.sourceVideo
  applyImages(body, capability, inputs, operation, components, model)

  const audioField = firstField(operation, AUDIO_FIELDS)
  if (audioField) body[audioField] = inputs.sound

  if ('duration' in properties) {
    const value = schemaValue('duration', operation, components, inputs.duration)
    if (value !== undefined) body.duration = value
  }
  if ('aspect_ratio' in properties) {
    const value = schemaValue('aspect_ratio', operation, components, inputs.aspectRatio)
    if (value !== undefined) body.aspect_ratio = value
  }
  if ('resolution' in properties) {
    const value = schemaValue('resolution', operation, components, inputs.resolution)
    if (value !== undefined) body.resolution = value
  }

  applySafetyFields(body, properties, components, inputs.nsfw)
  return conformBody(body, operation, components)
}

function schemaBody(
  model: VideoModelDefinition,
  inputs: VideoInputs,
  schema: SunraModelSchema,
  operation: { name: string; schema: RequestSchema },
  payload: SunraVideoSpec['payload'],
): Record<string, unknown> {
  const { components } = schema
  const properties = operation.schema.properties
  const body: Record<string, unknown> = {
    prompt: cleanSunraPrompt(
      inputs.prompt,
      Math.min(maxLengthOf(properties.prompt, components) ?? PROMPT_LIMIT, PROMPT_LIMIT),
    ),
  }

  if (inputs.startFrame) {
    const field = firstField(operation.schema, IMAGE_FIELDS)
    if (field) body[field] = inputs.startFrame
  }
  if (inputs.endFrame) {
    const endField = firstField(operation.schema, END_IMAGE_FIELDS)
    if (endField) body[endField] = inputs.endFrame
  }

  if (inputs.references.length > 0) {
    const startField = firstField(operation.schema, IMAGE_FIELDS)
    if (startField && operation.schema.required.includes(startField) && !(startField in body)) {
      body[startField] = inputs.references[0]
    }
    const field = firstField(operation.schema, REFERENCE_FIELDS)
    if (field) {
      const max = maxItemsOf(properties[field], components) ?? model.maxImages
      const list = inputs.references.slice(0, Math.max(0, max))
      body[field] = isArrayProperty(properties[field], components) ? list : list[0]
    } else if (payload === 'kling' && 'elements' in properties) {
      body.elements = inputs.references.map((url) => ({ frontal_image_url: url, reference_image_urls: [] }))
    } else {
      throw new ProviderError(
        'sunra',
        `${model.label} does not accept reference images on ${operation.name} on Sunra.ai`,
      )
    }
  }

  if ('generate_audio' in properties) body.generate_audio = inputs.sound
  if ('duration' in properties) {
    const value = schemaValue('duration', operation.schema, components, inputs.duration)
    if (value !== undefined) body.duration = value
  }
  if ('aspect_ratio' in properties) {
    const value = schemaValue('aspect_ratio', operation.schema, components, inputs.aspectRatio)
    if (value !== undefined) body.aspect_ratio = value
  }
  if ('resolution' in properties) {
    const value = schemaValue('resolution', operation.schema, components, inputs.resolution)
    if (value !== undefined) body.resolution = value
  }

  applySafetyFields(body, properties, components, inputs.nsfw)
  return conformBody(body, operation.schema, components)
}

function fallbackBody(spec: SunraVideoSpec, inputs: VideoInputs, operation: string): Record<string, unknown> {
  const prompt = cleanSunraPrompt(inputs.prompt, spec.promptMaxLength)
  const duration = inputs.duration

  if (spec.payload === 'veo') {
    const body: Record<string, unknown> = {
      prompt,
      aspect_ratio: inputs.aspectRatio,
      resolution: inputs.resolution,
      generate_audio: inputs.sound,
      duration,
    }
    if (operation === 'image-to-video' && inputs.startFrame) {
      body.image = inputs.startFrame
      if (inputs.endFrame) body.end_image = inputs.endFrame
    }
    if (operation === 'reference-to-video') body.image_urls = inputs.references.slice(0, spec.maxResources)
    return body
  }

  if (spec.payload === 'kling') {
    const body: Record<string, unknown> = {
      prompt,
      duration: String(duration),
      generate_audio: inputs.sound,
    }
    if (inputs.references.length > 0) {
      body.elements = inputs.references.map((url) => ({ frontal_image_url: url, reference_image_urls: [] }))
    }
    if (operation === 'image-to-video' && inputs.startFrame) {
      body.start_image_url = inputs.startFrame
      if (inputs.endFrame) body.end_image_url = inputs.endFrame
    } else {
      body.aspect_ratio = inputs.aspectRatio
    }
    return body
  }

  const body: Record<string, unknown> = {
    prompt,
    duration,
    aspect_ratio: inputs.aspectRatio,
    resolution: inputs.resolution,
  }
  if (operation === 'image-to-video' && inputs.startFrame) body.image = inputs.startFrame
  if (operation === 'reference-to-video') {
    body.reference_images = inputs.references.slice(0, spec.maxResources)
  }
  return body
}

async function buildVideoRequest(
  context: AdapterContext,
  request: ProviderRequest,
  urls: string[],
): Promise<{ endpoint: string; body: Record<string, unknown> }> {
  const model = request.model as VideoModelDefinition
  const spec = SUNRA_VIDEO_SPECS[model.id]
  const mode = requestedMode(request)
  const qualityMode = String(request.params.mode ?? model.defaultMode)
  const alias = spec?.apiIdByMode?.[qualityMode] ?? spec?.apiId ?? (model.dynamic ? model.sourceId : null)
  if (!alias) throw new ProviderError('sunra', `${model.label} is not available on Sunra`)

  const capability = mode ? videoModeCapability(model, mode) : null
  if (mode && capability) {
    const schema = await fetchSunraSchema(context, alias, model.schemaUrl)
    const path = capabilityPath(alias, capability)
    const operation = schema ? capabilityOperation(schema, path) : null
    if (!schema || !operation) {
      throw new ProviderError(
        'sunra',
        `${model.label} has no documented ${mode === 'text' ? 'text' : mode} to video endpoint on Sunra.ai`,
      )
    }
    const inputs = modeInputs(mode, capability, urls, {
      prompt: request.prompt,
      duration: Number(request.params.durationSeconds ?? model.defaultDuration),
      aspectRatio: String(request.params.aspectRatio ?? model.defaultRatio),
      resolution: String(request.params.resolution ?? model.defaultResolution),
      sound: Boolean(request.params.sound ?? capability.audio),
      nsfw: request.params.nsfw === true,
    })
    return {
      endpoint: `${SUNRA_BASE}/queue/${path}`,
      body: capabilityBody(model, capability, inputs, operation, schema.components),
    }
  }

  const schema = await fetchSunraSchema(context, alias, model.schemaUrl)
  const imageOperation = schema?.operations['image-to-video']
  const hasEndFrame = imageOperation
    ? END_IMAGE_FIELDS.some((field) => field in imageOperation.properties)
    : spec?.payload !== 'grok'
  const frameCapacity = hasEndFrame ? 2 : 1
  const referenceCapacity = spec?.maxResources ?? model.maxImages
  const useReferences =
    urls.length > frameCapacity &&
    (schema
      ? 'reference-to-video' in schema.operations
      : Boolean(spec?.operations.includes('reference-to-video')))

  const startFrame = useReferences ? undefined : urls[0]
  const endFrame = useReferences || !hasEndFrame ? undefined : urls[1]
  const references = useReferences
    ? urls.slice(0, referenceCapacity)
    : urls.slice(startFrame ? (endFrame ? 2 : 1) : 0)

  const inputs: VideoInputs = {
    prompt: request.prompt,
    duration: Number(request.params.durationSeconds ?? model.defaultDuration),
    aspectRatio: String(request.params.aspectRatio ?? model.defaultRatio),
    resolution: String(request.params.resolution ?? model.defaultResolution),
    sound: Boolean(request.params.sound ?? true),
    nsfw: request.params.nsfw === true,
    ...(startFrame ? { startFrame } : {}),
    ...(endFrame ? { endFrame } : {}),
    references,
  }

  if (schema) {
    const payload = spec?.payload ?? 'grok'
    const operation = pickOperation(schema, {
      hasImage: Boolean(startFrame),
      hasReferences: references.length > 0,
    })
    if (!operation) {
      throw new ProviderError(
        'sunra',
        `${model.label} has no ${startFrame ? 'image' : 'text'} to video endpoint on Sunra.ai`,
      )
    }
    return {
      endpoint: `${SUNRA_BASE}/queue${operation.schema.path}`,
      body: schemaBody(model, inputs, schema, operation, payload),
    }
  }

  if (!spec) {
    throw new ProviderError(
      'sunra',
      `${model.label} has no documented request schema on Sunra.ai right now. Try again or pick another model.`,
    )
  }

  const requested = legacyOperation(spec, {
    hasImage: Boolean(startFrame),
    hasReferences: references.length > 0,
  })
  const operation = spec.operations.includes(requested)
    ? requested
    : (spec.operations.find((name) => name === 'text-to-video') ?? requested)
  return {
    endpoint: `${SUNRA_BASE}/queue/${alias}/${operation}`,
    body: fallbackBody(spec, inputs, operation),
  }
}

export const sunraVideoFlow: ProviderFlow = {
  id: 'sunra.video',
  kind: 'video',
  matches: (model) => model.kind === 'video',
  async submit(context, request) {
    const urls = await Promise.all(request.assets.map((asset) => uploadSunraAsset(context, asset)))
    const { endpoint, body } = await buildVideoRequest(context, request, urls)
    return submitSunraQueue(context, endpoint, body, request.webhookUrl, request.assets)
  },
}
