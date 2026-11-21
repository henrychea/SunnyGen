import type { GenerationKind } from '@sunnygen/core'
import { downloadOutput, errorMessage, responseError } from '../http'
import {
  ProviderError,
  type AdapterContext,
  type ProviderAsset,
  type ProviderJob,
  type ProviderOutput,
  type ProviderPoll,
  type ProviderSubmit,
} from '../types'
import {
  FAL_UPLOAD_TTL,
  assetSha256,
  cachedUpload,
  forgetUploads,
  isUrlRejection,
  rememberUpload,
} from '../uploads'
import { falWebhook } from './webhook'

export const FAL_QUEUE = process.env.FAL_QUEUE_BASE?.replace(/\/$/, '') ?? 'https://queue.fal.run'
export const FAL_REST = process.env.FAL_REST_BASE?.replace(/\/$/, '') ?? 'https://rest.fal.ai'
export const FAL_PLATFORM = process.env.FAL_PLATFORM_BASE?.replace(/\/$/, '') ?? 'https://api.fal.ai'

const uploadCache = new Map<string, Promise<string>>()

export function resetFalUploadCache(): void {
  uploadCache.clear()
}

export function requireFalKey(context: AdapterContext): string {
  if (!context.apiKey) {
    throw new ProviderError('fal', 'No fal.ai API key configured. Add one in Settings.')
  }
  return context.apiKey
}

export async function uploadFalAsset(context: AdapterContext, asset: ProviderAsset): Promise<string> {
  const key = requireFalKey(context)
  const hash = assetSha256(asset)
  const cached = uploadCache.get(hash)
  if (cached) return cached
  const stored = cachedUpload(context, 'fal', hash)
  if (stored) return stored

  const pending = (async () => {
    const initiate = await context.fetch(`${FAL_REST}/storage/upload/initiate?storage_type=fal-cdn-v3`, {
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
    rememberUpload(context, 'fal', hash, initiated.file_url, FAL_UPLOAD_TTL)
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

/**
 * Queue status and result URLs use only the model owner and app, not the
 * endpoint path. The submit response returns the exact URLs, so use those and
 * fall back to the scope only for older job records.
 */
function queueScope(endpoint: string): string {
  return endpoint.split('/').filter(Boolean).slice(0, 2).join('/')
}

function encodeFalJob(
  endpoint: string,
  requestId: string,
  statusUrl?: string | null,
  responseUrl?: string | null,
): string {
  const scope = `${FAL_QUEUE}/${queueScope(endpoint)}`
  const status = statusUrl || `${scope}/requests/${requestId}/status`
  const response = responseUrl || `${scope}/requests/${requestId}`
  return `${status}|${response}|${requestId}`
}

function decodeFalJob(providerJobId: string): {
  requestId: string
  statusUrl: string
  responseUrl: string
} | null {
  const parts = providerJobId.split('|')
  if (parts.length >= 3 && /^https?:\/\//.test(parts[0] ?? '')) {
    const requestId = parts.at(-1) ?? ''
    const responseUrl = parts.at(-2) ?? ''
    const statusUrl = parts.slice(0, -2).join('|')
    return requestId && responseUrl && statusUrl ? { requestId, statusUrl, responseUrl } : null
  }
  if (parts.length === 2) {
    const [endpoint, requestId] = parts
    if (!endpoint || !requestId) return null
    const scope = `${FAL_QUEUE}/${queueScope(endpoint)}`
    return {
      requestId,
      statusUrl: `${scope}/requests/${requestId}/status`,
      responseUrl: `${scope}/requests/${requestId}`,
    }
  }
  return null
}

export async function submitFalQueue(
  context: AdapterContext,
  endpoint: string,
  body: Record<string, unknown>,
  webhookUrl?: string | null,
  assets: ProviderAsset[] = [],
): Promise<ProviderSubmit> {
  const key = requireFalKey(context)
  const url = new URL(`${FAL_QUEUE}/${endpoint}`)
  if (webhookUrl) url.searchParams.set(falWebhook.queryParam, webhookUrl)
  const response = await context.fetch(url.toString(), {
    method: 'POST',
    headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  })

  if (!response.ok) {
    const detail = await responseError(response, `fal error ${response.status}`)
    const message = response.status === 401 ? `fal rejected the request (401): ${detail}` : detail
    const error = new ProviderError('fal', message, response.status)
    if (isUrlRejection(error)) forgetUploads(context, 'fal', assets)
    throw error
  }

  const created = (await response.json()) as {
    request_id?: string
    status_url?: string | null
    response_url?: string | null
  }
  if (!created.request_id) throw new ProviderError('fal', 'fal returned no request id')
  return {
    providerJobId: encodeFalJob(endpoint, created.request_id, created.status_url, created.response_url),
    status: 'running',
  }
}

function extractUrls(result: Record<string, unknown>, kind: GenerationKind): string[] {
  const urls: string[] = []
  const push = (value: unknown) => {
    if (typeof value === 'string' && value) {
      urls.push(value)
      return
    }
    if (Array.isArray(value)) {
      value.forEach(push)
      return
    }
    if (value && typeof value === 'object' && 'url' in value && typeof value.url === 'string') {
      urls.push(value.url)
    }
  }
  if (kind === 'lora') {
    push(result.diffusers_lora_file)
  } else if (kind === 'video') {
    push(result.video)
    push(result.videos)
    push(result.video_url)
  } else {
    push(result.images)
    push(result.image)
  }
  if (urls.length === 0) push(result.output)
  return [...new Set(urls)]
}

export async function pollFal(context: AdapterContext, job: ProviderJob): Promise<ProviderPoll> {
  const key = requireFalKey(context)
  const decoded = decodeFalJob(job.providerJobId)
  if (!decoded) return { status: 'failed', error: 'Malformed fal job id' }

  const statusResponse = await context.fetch(decoded.statusUrl, {
    headers: { Authorization: `Key ${key}` },
    signal: AbortSignal.timeout(20_000),
  })
  if (statusResponse.status === 401) {
    return { status: 'failed', error: 'Invalid fal.ai API key — update it in Settings.' }
  }
  if (statusResponse.status === 404 || statusResponse.status === 410) {
    return { status: 'failed', error: 'fal request not found or expired' }
  }
  if (!statusResponse.ok && statusResponse.status !== 202) {
    if (statusResponse.status >= 500) return { status: 'running' }
    return {
      status: 'failed',
      error: await responseError(statusResponse, `fal status failed (${statusResponse.status})`),
    }
  }

  const status = (await statusResponse.json().catch(() => null)) as {
    status?: string
    response_url?: string | null
    error?: unknown
    error_type?: unknown
    detail?: unknown
  } | null
  if (!status) return { status: 'running' }

  if (status.error || status.error_type) {
    return {
      status: 'failed',
      error: errorMessage(status.error ?? status.error_type, 'fal generation failed'),
    }
  }

  const state = String(status.status ?? '').toUpperCase()
  if (state === 'NOT_FOUND') return { status: 'failed', error: 'fal request not found' }
  if (state === 'FAILED' || state === 'CANCELED' || state === 'CANCELLED') {
    return { status: 'failed', error: errorMessage(status.detail, `Generation ${state.toLowerCase()}`) }
  }
  if (state !== 'COMPLETED') return { status: 'running' }

  const resultResponse = await context.fetch(status.response_url ?? decoded.responseUrl, {
    headers: { Authorization: `Key ${key}` },
    signal: AbortSignal.timeout(60_000),
  })
  if (resultResponse.status === 401) {
    return { status: 'failed', error: 'Invalid fal.ai API key — update it in Settings.' }
  }
  if (resultResponse.status === 404 || resultResponse.status === 410) {
    return { status: 'failed', error: 'fal result expired before it could be downloaded' }
  }
  if (!resultResponse.ok) {
    const message = await responseError(
      resultResponse,
      `Could not load fal result (HTTP ${resultResponse.status})`,
    )
    if (/in progress/i.test(message)) return { status: 'running' }
    return { status: 'failed', error: message }
  }

  const result = (await resultResponse.json().catch(() => null)) as Record<string, unknown> | null
  if (!result) return { status: 'failed', error: 'fal returned an empty result' }
  if (result.error || result.error_type) {
    return { status: 'failed', error: errorMessage(result.error ?? result.error_type) }
  }
  if (typeof result.detail === 'string' && /in progress/i.test(result.detail)) {
    return { status: 'running' }
  }
  if (typeof result.detail === 'string' || Array.isArray(result.detail)) {
    return { status: 'failed', error: errorMessage(result.detail) }
  }

  const urls = extractUrls(result, job.kind)
  if (urls.length === 0) return { status: 'failed', error: 'fal returned no output' }
  const outputs: ProviderOutput[] = await Promise.all(
    urls.map(async (url) => {
      const output = await downloadOutput(url)
      if (job.kind !== 'lora') return output
      return { ...output, mime: 'application/octet-stream', fileName: 'lora.safetensors', sourceUrl: url }
    }),
  )
  return { status: 'succeeded', outputs }
}
