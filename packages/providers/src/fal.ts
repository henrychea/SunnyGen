import { createHash } from 'node:crypto'
import type { ImageModelDefinition } from '@sunnygen/core'
import { downloadOutput, errorMessage, responseError } from './http'
import { FAL_IMAGE_SPECS } from './models'
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

const QUEUE = process.env.FAL_QUEUE_BASE?.replace(/\/$/, '') ?? 'https://queue.fal.run'
const REST = process.env.FAL_REST_BASE?.replace(/\/$/, '') ?? 'https://rest.fal.ai'
const uploadCache = new Map<string, Promise<string>>()

function requireKey(context: AdapterContext): string {
  if (!context.apiKey) throw new ProviderError('fal', 'No fal.ai API key configured. Add one in Settings.')
  return context.apiKey
}

async function uploadAsset(context: AdapterContext, asset: ProviderAsset): Promise<string> {
  const key = requireKey(context)
  const hash = createHash('sha256').update(asset.buffer).digest('hex')
  const cached = uploadCache.get(hash)
  if (cached) return cached

  const pending = (async () => {
    const initiate = await context.fetch(`${REST}/storage/upload/initiate?storage_type=fal-cdn-v3`, {
      method: 'POST',
      headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content_type: asset.mime, file_name: asset.fileName }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!initiate.ok) {
      throw new ProviderError(
        'fal',
        await responseError(initiate, `fal upload failed (${initiate.status})`),
        initiate.status,
      )
    }
    const initiated = (await initiate.json()) as { upload_url?: string; file_url?: string }
    if (!initiated.upload_url || !initiated.file_url) {
      throw new ProviderError('fal', 'fal upload returned no file URL')
    }
    const put = await context.fetch(initiated.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': asset.mime },
      body: new Uint8Array(asset.buffer),
      signal: AbortSignal.timeout(120_000),
    })
    if (!put.ok) throw new ProviderError('fal', `fal upload failed (${put.status})`, put.status)
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

function buildBody(
  model: ImageModelDefinition,
  request: ProviderRequest,
  urls: string[],
  spec: {
    imageKey: string
    imageMode: 'array' | 'single'
    promptMaxLength: number
    supportsSafetyChecker: boolean
  },
) {
  const body: Record<string, unknown> = {
    prompt: request.prompt
      .replace(/<<<image (\d+)>>>/gi, (_match, index: string) => `image ${index}`)
      .slice(0, spec.promptMaxLength),
    output_format: 'png',
    num_images: 1,
  }
  if (urls.length > 0) {
    body[spec.imageKey] = spec.imageMode === 'single' ? urls[0] : urls.slice(0, model.maxImages)
  }
  if (spec.supportsSafetyChecker) body.enable_safety_checker = false
  const aspectRatio = request.params.aspectRatio
  if (aspectRatio && aspectRatio !== 'auto') body.aspect_ratio = aspectRatio
  return body
}

async function submit(context: AdapterContext, request: ProviderRequest): Promise<ProviderSubmit> {
  const key = requireKey(context)
  const model = request.model as ImageModelDefinition
  const spec = FAL_IMAGE_SPECS[model.id]
  if (!spec) throw new ProviderError('fal', `${model.label} is not available on fal.ai`)

  const urls = await Promise.all(request.assets.map((asset) => uploadAsset(context, asset)))
  const endpoint = urls.length > 0 && spec.editEndpoint ? spec.editEndpoint : spec.endpoint
  const response = await context.fetch(`${QUEUE}/${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(buildBody(model, request, urls, spec)),
    signal: AbortSignal.timeout(120_000),
  })

  if (!response.ok) {
    const message =
      response.status === 401
        ? 'Invalid fal.ai API key — update it in Settings.'
        : await responseError(response, `fal error ${response.status}`)
    throw new ProviderError('fal', message, response.status)
  }

  const created = (await response.json()) as { request_id?: string }
  if (!created.request_id) throw new ProviderError('fal', 'fal returned no request id')
  return { providerJobId: `${endpoint}|${created.request_id}`, status: 'running' }
}

async function poll(context: AdapterContext, job: ProviderJob): Promise<ProviderPoll> {
  const key = requireKey(context)
  const [endpoint, requestId] = job.providerJobId.split('|')
  if (!endpoint || !requestId) return { status: 'failed', error: 'Malformed fal job id' }

  const statusResponse = await context.fetch(`${QUEUE}/${endpoint}/requests/${requestId}/status`, {
    headers: { Authorization: `Key ${key}` },
    signal: AbortSignal.timeout(20_000),
  })
  if (statusResponse.status === 401) {
    return { status: 'failed', error: 'Invalid fal.ai API key — update it in Settings.' }
  }
  if (!statusResponse.ok) return { status: 'running' }

  const status = (await statusResponse.json()) as { status?: string; error?: unknown }
  const state = String(status.status ?? '').toUpperCase()
  if (state === 'FAILED' || state === 'CANCELED' || state === 'CANCELLED') {
    return { status: 'failed', error: errorMessage(status.error, `Generation ${state.toLowerCase()}`) }
  }
  if (state !== 'COMPLETED') {
    return status.error ? { status: 'failed', error: errorMessage(status.error) } : { status: 'running' }
  }

  const resultResponse = await context.fetch(`${QUEUE}/${endpoint}/requests/${requestId}`, {
    headers: { Authorization: `Key ${key}` },
    signal: AbortSignal.timeout(60_000),
  })
  if (!resultResponse.ok) {
    return { status: 'failed', error: `Could not load fal result (HTTP ${resultResponse.status})` }
  }

  const result = (await resultResponse.json()) as {
    images?: Array<{ url?: string }>
    image?: { url?: string }
    video?: { url?: string } | string
    detail?: unknown
    error?: unknown
  }
  if (result.error || result.detail) {
    return { status: 'failed', error: errorMessage(result.error ?? result.detail) }
  }

  const urls =
    job.kind === 'video'
      ? [typeof result.video === 'string' ? result.video : result.video?.url].filter((url): url is string =>
          Boolean(url),
        )
      : (result.images ?? (result.image ? [result.image] : []))
          .map((image) => image.url)
          .filter((url): url is string => Boolean(url))

  if (urls.length === 0) return { status: 'failed', error: 'fal returned no output' }
  const outputs: ProviderOutput[] = await Promise.all(urls.map((url) => downloadOutput(url)))
  return { status: 'succeeded', outputs }
}

export const falAdapter: ProviderAdapter = {
  id: 'fal',
  submit,
  poll,
}
