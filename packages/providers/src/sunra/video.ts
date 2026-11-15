import type { VideoModelDefinition } from '@sunnygen/core'
import { SUNRA_VIDEO_SPECS } from '../models'
import { ProviderError, type ProviderFlow, type ProviderRequest } from '../types'
import { SUNRA_BASE, cleanSunraPrompt, submitSunraQueue, uploadSunraAsset } from './client'

function buildVideoRequest(
  request: ProviderRequest,
  urls: string[],
): { endpoint: string; body: Record<string, unknown> } {
  const model = request.model as VideoModelDefinition
  const spec = SUNRA_VIDEO_SPECS[model.id]
  if (!spec && model.dynamic && model.sourceId) {
    const operation = urls.length > 0 ? 'image-to-video' : 'text-to-video'
    const duration = Number(request.params.durationSeconds ?? model.defaultDuration)
    return {
      endpoint: `${SUNRA_BASE}/queue/${model.sourceId}/${operation}`,
      body: {
        prompt: cleanSunraPrompt(request.prompt, 10_000),
        duration,
        aspect_ratio: request.params.aspectRatio ?? model.defaultRatio,
        resolution: request.params.resolution ?? model.defaultResolution,
        ...(urls[0] ? { image: urls[0] } : {}),
        ...(urls.length > 1 ? { reference_images: urls.slice(1, 1 + model.maxImages) } : {}),
      },
    }
  }
  if (!spec) throw new ProviderError('sunra', `${model.label} is not available on Sunra`)

  const prompt = cleanSunraPrompt(request.prompt, spec.promptMaxLength)
  const duration = Number(request.params.durationSeconds ?? model.defaultDuration)
  const aspectRatio = request.params.aspectRatio ?? model.defaultRatio
  const resolution = request.params.resolution ?? model.defaultResolution
  const sound = Boolean(request.params.sound ?? true)
  const mode = String(request.params.mode ?? model.defaultMode)
  const startFrame = urls[0]
  const endFrame = urls[1]
  const references = urls.slice(2, 2 + spec.maxResources)
  const alias = spec.apiIdByMode?.[mode] ?? spec.apiId

  let operation = 'text-to-video'
  let body: Record<string, unknown> = {}

  if (spec.payload === 'veo') {
    const common = {
      prompt,
      aspect_ratio: aspectRatio,
      resolution,
      generate_audio: sound,
    }
    if (startFrame) {
      operation = 'image-to-video'
      body = { ...common, image: startFrame, duration }
      if (endFrame) body.end_image = endFrame
    } else if (references.length > 0 && model.id === 'veo3') {
      operation = 'reference-to-video'
      body = { ...common, image_urls: references.slice(0, spec.maxResources) }
    } else {
      operation = 'text-to-video'
      body = { ...common, duration }
    }
  } else if (spec.payload === 'kling') {
    if (startFrame) {
      operation = 'image-to-video'
      body = {
        prompt,
        start_image_url: startFrame,
        duration: String(duration),
        generate_audio: sound,
      }
      if (endFrame) body.end_image_url = endFrame
      if (references.length > 0) {
        body.elements = references.map((url) => ({ frontal_image_url: url, reference_image_urls: [] }))
      }
    } else if (references.length > 0) {
      operation = 'reference-to-video'
      body = {
        prompt,
        aspect_ratio: aspectRatio,
        duration: String(duration),
        generate_audio: sound,
        elements: references.map((url) => ({ frontal_image_url: url, reference_image_urls: [] })),
      }
    } else {
      operation = 'text-to-video'
      body = { prompt, aspect_ratio: aspectRatio, duration: String(duration), generate_audio: sound }
    }
  } else {
    body = { prompt, duration, resolution }
    if (startFrame) {
      operation = 'image-to-video'
      body = { ...body, image: startFrame, aspect_ratio: aspectRatio }
    } else if (references.length > 0) {
      operation = 'reference-to-video'
      body = { ...body, reference_images: references.slice(0, spec.maxResources), aspect_ratio: aspectRatio }
    } else {
      operation = 'text-to-video'
      body = { ...body, aspect_ratio: aspectRatio }
    }
  }

  return { endpoint: `${SUNRA_BASE}/queue/${alias}/${operation}`, body }
}

export const sunraVideoFlow: ProviderFlow = {
  id: 'sunra.video',
  kind: 'video',
  matches: (model) => model.kind === 'video',
  async submit(context, request) {
    const urls = await Promise.all(request.assets.map((asset) => uploadSunraAsset(context, asset)))
    const { endpoint, body } = buildVideoRequest(request, urls)
    return submitSunraQueue(context, endpoint, body, request.webhookUrl)
  },
}
