import { createHash } from 'node:crypto'
import type { ImageModelDefinition, VideoModelDefinition } from '@sunnygen/core'
import { downloadOutput, errorMessage, responseError } from './http'
import { SUNRA_IMAGE_SPECS, SUNRA_VIDEO_SPECS } from './models'
import { gptImageSize } from './sizes'
import {
  ProviderError,
  type AdapterContext,
  type ProviderAdapter,
  type ProviderAsset,
  type ProviderJob,
  type ProviderOutput,
  type ProviderPoll,
  type ProviderRequest,
  type ProviderSubmit,
} from './types'

const BASE = process.env.SUNRA_API_BASE?.replace(/\/$/, '') ?? 'https://api.sunra.ai/v1'
const uploadCache = new Map<string, Promise<string>>()

function requireKey(context: AdapterContext): string {
  if (!context.apiKey)
    throw new ProviderError('sunra', 'No Sunra.ai API key configured. Add one in Settings.')
  return context.apiKey
}

async function uploadAsset(context: AdapterContext, asset: ProviderAsset): Promise<string> {
  const key = requireKey(context)
  const hash = createHash('sha256').update(asset.buffer).digest('hex')
  const cached = uploadCache.get(hash)
  if (cached) return cached

  const pending = (async () => {
    const initiate = await context.fetch(`${BASE}/storage/upload/initiate`, {
      method: 'POST',
      headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_name: asset.fileName, content_type: asset.mime }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!initiate.ok) {
      throw new ProviderError(
        'sunra',
        await responseError(initiate, `Sunra upload failed (${initiate.status})`),
        initiate.status,
      )
    }
    const initiated = (await initiate.json()) as { upload_url?: string; file_url?: string }
    if (!initiated.upload_url || !initiated.file_url) {
      throw new ProviderError('sunra', 'Sunra upload returned no file URL')
    }
    const put = await context.fetch(initiated.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': asset.mime },
      body: new Uint8Array(asset.buffer),
      signal: AbortSignal.timeout(120_000),
    })
    if (!put.ok) {
      throw new ProviderError('sunra', `Sunra storage upload failed (${put.status})`, put.status)
    }
    return initiated.file_url
  })()

  uploadCache.set(hash, pending)
  try {
    return await pending
  } catch (error) {
    uploadCache.delete(hash)
    throw error
  }
}

function cleanPrompt(prompt: string, maxLength: number): string {
  return prompt
    .replace(/<<<image (\d+)>>>/gi, (_match, index: string) => `image ${index}`)
    .slice(0, maxLength)
}

function buildImageRequest(
  request: ProviderRequest,
  urls: string[],
): { endpoint: string; body: Record<string, unknown> } {
  const model = request.model as ImageModelDefinition
  const spec = SUNRA_IMAGE_SPECS[model.id]
  if (!spec) throw new ProviderError('sunra', `${model.label} is not available on Sunra`)

  const hasImages = urls.length > 0
  const operation = hasImages ? spec.imageOperation : spec.textOperation
  const quality = request.params.quality ?? model.defaultQuality
  const aspectRatio = request.params.aspectRatio ?? '1:1'
  const body: Record<string, unknown> = {
    prompt: cleanPrompt(request.prompt, spec.promptMaxLength),
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
    const size = gptImageSize(aspectRatio, quality)
    if (size) {
      body[spec.sizeKeys.width] = size.width
      body[spec.sizeKeys.height] = size.height
    }
  }
  if (spec.outputFormat) body.output_format = spec.outputFormat
  if (spec.extra) Object.assign(body, spec.extra)

  return { endpoint: `${BASE}/queue/${spec.apiId}/${operation}`, body }
}

function buildVideoRequest(
  request: ProviderRequest,
  urls: string[],
): { endpoint: string; body: Record<string, unknown> } {
  const model = request.model as VideoModelDefinition
  const spec = SUNRA_VIDEO_SPECS[model.id]
  if (!spec) throw new ProviderError('sunra', `${model.label} is not available on Sunra`)

  const prompt = cleanPrompt(request.prompt, spec.promptMaxLength)
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

  return { endpoint: `${BASE}/queue/${alias}/${operation}`, body }
}

function extractUrls(output: Record<string, unknown>, kind: 'image' | 'video'): string[] {
  const urls: string[] = []
  const push = (value: unknown) => {
    if (typeof value === 'string' && value) urls.push(value)
    else if (value && typeof value === 'object' && 'url' in value && typeof value.url === 'string') {
      urls.push(value.url)
    }
  }

  push(output.video)
  if (Array.isArray(output.images)) output.images.forEach(push)
  else push(output.images)
  if (urls.length === 0 && Array.isArray(output.output)) output.output.forEach(push)
  if (urls.length === 0) push(output.output)
  if (kind === 'image' && urls.length === 0) push(output.image)

  return [...new Set(urls)]
}

async function submit(context: AdapterContext, request: ProviderRequest): Promise<ProviderSubmit> {
  const apiKey = requireKey(context)
  const urls = await Promise.all(request.assets.map((asset) => uploadAsset(context, asset)))
  const { endpoint, body } =
    request.kind === 'image' ? buildImageRequest(request, urls) : buildVideoRequest(request, urls)

  const response = await context.fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Key ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  })

  if (!response.ok) {
    const message =
      response.status === 401
        ? 'Invalid Sunra API key — update it in Settings.'
        : await responseError(response, `Sunra error ${response.status}`)
    throw new ProviderError('sunra', message, response.status)
  }

  const created = (await response.json()) as { request_id?: string }
  if (!created.request_id) throw new ProviderError('sunra', 'Sunra returned no request id')
  return { providerJobId: created.request_id, status: 'running' }
}

async function poll(context: AdapterContext, job: ProviderJob): Promise<ProviderPoll> {
  const apiKey = requireKey(context)
  const statusResponse = await context.fetch(
    `${BASE}/queue/requests/${encodeURIComponent(job.providerJobId)}/status`,
    { headers: { Authorization: `Key ${apiKey}` }, signal: AbortSignal.timeout(20_000) },
  )

  if (statusResponse.status === 401) {
    return { status: 'failed', error: 'Invalid Sunra API key — update it in Settings.' }
  }
  if (statusResponse.status === 404 || statusResponse.status === 410) {
    return { status: 'failed', error: 'Generation expired before it finished' }
  }
  if (!statusResponse.ok) return { status: 'running' }

  const status = (await statusResponse.json()) as {
    status?: string
    success?: boolean
    error?: unknown
  }
  const state = String(status.status ?? '').toUpperCase()

  if (state === 'COMPLETED' || state === 'SUCCEEDED' || state === 'SUCCESS') {
    if (status.success === false) {
      return { status: 'failed', error: errorMessage(status.error) }
    }
    const resultResponse = await context.fetch(
      `${BASE}/queue/requests/${encodeURIComponent(job.providerJobId)}`,
      { headers: { Authorization: `Key ${apiKey}` }, signal: AbortSignal.timeout(60_000) },
    )
    if (!resultResponse.ok) {
      return { status: 'failed', error: `Could not load result (HTTP ${resultResponse.status})` }
    }
    const result = (await resultResponse.json()) as Record<string, unknown>
    const urls = extractUrls(result, job.kind)
    if (urls.length === 0) return { status: 'failed', error: 'Generation returned no output' }
    const outputs: ProviderOutput[] = await Promise.all(urls.map((url) => downloadOutput(url)))
    return { status: 'succeeded', outputs }
  }

  if (state === 'CANCELED' || state === 'CANCELLED') {
    return { status: 'failed', error: 'Generation canceled' }
  }
  if (state === 'FAILED' || state === 'ERROR') {
    return { status: 'failed', error: errorMessage(status.error) }
  }
  return { status: 'running' }
}

export const sunraAdapter: ProviderAdapter = {
  id: 'sunra',
  submit,
  poll,
}
