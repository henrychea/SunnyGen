import type { GenerationKind } from '@sunnygen/core'
import { downloadOutput, errorMessage, responseError } from '../http'
import {
  ProviderError,
  type AdapterContext,
  type ProviderJob,
  type ProviderPoll,
  type ProviderOutput,
} from '../types'

export const WIRO_API = process.env.WIRO_API_BASE?.replace(/\/$/, '') ?? 'https://api.wiro.ai/v1'

/** Wiro answers an over-limit run with HTTP 200, `result: false`, and this error code. */
const OVER_LIMIT_CODE = 96

export interface WiroError {
  code?: number | string
  message?: string
}

interface WiroRunResponse {
  result?: boolean
  errors?: WiroError[]
  taskid?: string | null
}

export interface WiroTask {
  id?: string
  status?: string
  pexit?: string
  debugerror?: string
  totalcost?: string
  outputs?: Array<{ url?: string; contenttype?: string; name?: string }>
}

interface WiroDetailResponse {
  result?: boolean
  errors?: WiroError[]
  tasklist?: WiroTask[]
}

export function requireWiroKey(context: AdapterContext): string {
  if (!context.apiKey) throw new ProviderError('wiro', 'No Wiro API key configured. Add one in Settings.')
  return context.apiKey
}

function wiroErrorText(errors: WiroError[] | undefined, fallback: string): string {
  const first = errors?.find((entry) => entry.message)
  return first?.message?.trim() || fallback
}

function isOverLimit(errors: WiroError[] | undefined): boolean {
  return (errors ?? []).some((entry) => Number(entry.code) === OVER_LIMIT_CODE)
}

export function wiroRunUrl(endpoint: string): string {
  return `${WIRO_API}/Run/${endpoint}`
}

export async function submitWiroRun(
  context: AdapterContext,
  endpoint: string,
  body: Record<string, unknown> | FormData,
): Promise<string> {
  const key = requireWiroKey(context)
  const form = body instanceof FormData
  const response = await context.fetch(wiroRunUrl(endpoint), {
    method: 'POST',
    headers: form ? { 'x-api-key': key } : { 'x-api-key': key, 'Content-Type': 'application/json' },
    body: form ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  })

  if (!response.ok) {
    throw new ProviderError(
      'wiro',
      await responseError(response, `Wiro run failed (${response.status})`),
      response.status,
    )
  }

  const payload = (await response.json().catch(() => null)) as WiroRunResponse | null
  if (payload?.result === false) {
    if (isOverLimit(payload.errors)) {
      throw new ProviderError(
        'wiro',
        'Wiro is running as many tasks as your balance allows. Retry in a moment.',
        response.status,
        { code: 'over_limit', reason: 'rate_limit', retryable: true },
      )
    }
    throw new ProviderError(
      'wiro',
      wiroErrorText(payload.errors, 'Wiro rejected the request'),
      response.status,
    )
  }
  if (!payload?.taskid) throw new ProviderError('wiro', 'Wiro returned no task id')
  return payload.taskid
}

function outputUrls(task: WiroTask, kind: GenerationKind): string[] {
  if (kind !== 'image') return []
  return (task.outputs ?? [])
    .map((output) => output.url)
    .filter((url): url is string => typeof url === 'string' && url.length > 0)
}

export async function pollWiro(context: AdapterContext, job: ProviderJob): Promise<ProviderPoll> {
  const key = requireWiroKey(context)
  const response = await context.fetch(`${WIRO_API}/Task/Detail`, {
    method: 'POST',
    headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskid: job.providerJobId }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) {
    if (response.status >= 500) return { status: 'running' }
    return {
      status: 'failed',
      error: await responseError(response, `Wiro status failed (${response.status})`),
    }
  }

  const payload = (await response.json().catch(() => null)) as WiroDetailResponse | null
  if (!payload) return { status: 'running' }
  if (payload.result === false) {
    return { status: 'failed', error: wiroErrorText(payload.errors, 'Wiro could not read the task') }
  }
  const task = payload.tasklist?.[0]
  if (!task) return { status: 'running' }

  const status = String(task.status ?? '')
  if (status === 'task_cancel') return { status: 'failed', error: 'Wiro cancelled this task' }
  if (status !== 'task_postprocess_end') return { status: 'running' }

  if (String(task.pexit ?? '0') !== '0') {
    const reason = task.debugerror?.trim()
    return { status: 'failed', error: reason ? errorMessage(reason, reason) : 'Wiro task failed' }
  }

  const urls = outputUrls(task, job.kind)
  if (urls.length === 0) return { status: 'failed', error: 'Wiro returned no output' }
  const outputs: ProviderOutput[] = await Promise.all(urls.map((url) => downloadOutput(url)))
  return { status: 'succeeded', outputs }
}
