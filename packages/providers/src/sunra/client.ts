import { createHash } from 'node:crypto'
import type { GenerationKind } from '@sunnygen/core'
import { downloadOutput, errorMessage, responseError } from '../http'
import {
  ProviderError,
  type AdapterContext,
  type ProviderAsset,
  type ProviderFailure,
  type ProviderJob,
  type ProviderOutput,
  type ProviderPoll,
  type ProviderSubmit,
} from '../types'
import { sunraWebhook } from './webhook'

export const SUNRA_BASE = process.env.SUNRA_API_BASE?.replace(/\/$/, '') ?? 'https://api.sunra.ai/v1'

const uploadCache = new Map<string, Promise<string>>()

export function requireSunraKey(context: AdapterContext): string {
  if (!context.apiKey) {
    throw new ProviderError('sunra', 'No Sunra.ai API key configured. Add one in Settings.')
  }
  return context.apiKey
}

function failureDetail(error: unknown): ProviderFailure {
  const record = error && typeof error === 'object' ? (error as Record<string, unknown>) : null
  return {
    code: typeof record?.code === 'string' ? record.code : null,
    reason: typeof record?.reason === 'string' ? record.reason : null,
    retryable: typeof record?.retryable === 'boolean' ? record.retryable : null,
  }
}

export async function uploadSunraAsset(context: AdapterContext, asset: ProviderAsset): Promise<string> {
  const key = requireSunraKey(context)
  const hash = createHash('sha256').update(asset.buffer).digest('hex')
  const cached = uploadCache.get(hash)
  if (cached) return cached

  const pending = (async () => {
    const initiate = await context.fetch(`${SUNRA_BASE}/storage/upload/initiate`, {
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

export function cleanSunraPrompt(prompt: string, maxLength: number): string {
  return prompt
    .replace(/<<<image (\d+)>>>/gi, (_match, index: string) => `image ${index}`)
    .slice(0, maxLength)
}

export async function submitSunraQueue(
  context: AdapterContext,
  endpoint: string,
  body: Record<string, unknown>,
  webhookUrl?: string | null,
): Promise<ProviderSubmit> {
  const apiKey = requireSunraKey(context)
  const url = new URL(endpoint)
  if (webhookUrl) url.searchParams.set(sunraWebhook.queryParam, webhookUrl)
  const response = await context.fetch(url.toString(), {
    method: 'POST',
    headers: { Authorization: `Key ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  })

  if (!response.ok) {
    const detail = await responseError(response, `Sunra error ${response.status}`)
    const message = response.status === 401 ? `Sunra rejected the request (401): ${detail}` : detail
    throw new ProviderError('sunra', message, response.status)
  }

  const created = (await response.json()) as { request_id?: string }
  if (!created.request_id) throw new ProviderError('sunra', 'Sunra returned no request id')
  return { providerJobId: created.request_id, status: 'running' }
}

function extractUrls(output: Record<string, unknown>, kind: GenerationKind): string[] {
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

export async function pollSunra(context: AdapterContext, job: ProviderJob): Promise<ProviderPoll> {
  const apiKey = requireSunraKey(context)
  const statusResponse = await context.fetch(
    `${SUNRA_BASE}/queue/requests/${encodeURIComponent(job.providerJobId)}/status`,
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
      return {
        status: 'failed',
        error: errorMessage(status.error, 'Generation failed'),
        failure: failureDetail(status.error),
      }
    }
    const resultResponse = await context.fetch(
      `${SUNRA_BASE}/queue/requests/${encodeURIComponent(job.providerJobId)}`,
      { headers: { Authorization: `Key ${apiKey}` }, signal: AbortSignal.timeout(60_000) },
    )
    if (!resultResponse.ok) {
      const payload = (await resultResponse.json().catch(() => null)) as {
        error?: unknown
        message?: unknown
        detail?: unknown
      } | null
      const source =
        payload?.error && typeof payload.error === 'object'
          ? ((payload.error as Record<string, unknown>).details ?? payload.error)
          : (payload?.error ?? payload?.message ?? payload?.detail)
      return {
        status: 'failed',
        error: errorMessage(source, `Could not load result (HTTP ${resultResponse.status})`),
        failure: failureDetail(source),
      }
    }
    const result = (await resultResponse.json()) as Record<string, unknown>
    if (result.error) {
      return {
        status: 'failed',
        error: errorMessage(result.error, 'Generation failed'),
        failure: failureDetail(result.error),
      }
    }
    const urls = extractUrls(result, job.kind)
    if (urls.length === 0) return { status: 'failed', error: 'Generation returned no output' }
    const outputs: ProviderOutput[] = await Promise.all(urls.map((url) => downloadOutput(url)))
    return { status: 'succeeded', outputs }
  }

  if (state === 'CANCELED' || state === 'CANCELLED') {
    return {
      status: 'failed',
      error: 'Generation canceled',
      failure: { code: null, reason: 'canceled', retryable: false },
    }
  }
  if (state === 'FAILED' || state === 'ERROR') {
    return {
      status: 'failed',
      error: errorMessage(status.error, 'Generation failed'),
      failure: failureDetail(status.error),
    }
  }
  return { status: 'running' }
}
