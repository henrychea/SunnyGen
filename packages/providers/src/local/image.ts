import type { ImageModelDefinition } from '@sunnygen/core'
import {
  ProviderError,
  type AdapterContext,
  type ProviderFlow,
  type ProviderJob,
  type ProviderPoll,
  type ProviderRequest,
  type ProviderOutput,
} from '../types'
import { boundedImageSize } from '../sizes'
import { localBase } from './client'

interface LocalJob {
  id?: string
  status?: string
  result?: { output_format?: string; images?: Array<{ b64_json?: string }> } | null
  error?: { code?: string; message?: string } | null
}

export function localImageBody(
  request: ProviderRequest,
  model: ImageModelDefinition,
): Record<string, unknown> {
  const aspectRatio = String(request.params.aspectRatio ?? model.ratios[0] ?? '1:1')
  const quality = String(request.params.quality ?? model.defaultQuality)
  const size = boundedImageSize(aspectRatio, quality)
  const body: Record<string, unknown> = { prompt: request.prompt, batch_count: 1, output_format: 'png' }
  if (size) {
    body.width = size.width
    body.height = size.height
  }
  if (typeof request.params.seed === 'number') body.seed = request.params.seed
  return body
}

function localError(payload: LocalJob | null, fallback: string): string {
  const message = payload?.error?.message?.trim()
  return message || fallback
}

export async function submitLocalImage(context: AdapterContext, request: ProviderRequest): Promise<string> {
  const model = request.model as ImageModelDefinition
  const response = await context.fetch(`${localBase(context)}/sdcpp/v1/img_gen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(localImageBody(request, model)),
    signal: AbortSignal.timeout(60_000),
  })

  const payload = (await response.json().catch(() => null)) as LocalJob | null
  if (response.status === 503) {
    throw new ProviderError(
      'local',
      'sd-server has no model loaded. Start it with --diffusion-model, --llm, --vae, and --tokenizer, then retry.',
      response.status,
    )
  }
  if (!response.ok) {
    throw new ProviderError(
      'local',
      localError(payload, `sd-server rejected the request (HTTP ${response.status})`),
      response.status,
    )
  }
  if (!payload?.id) throw new ProviderError('local', 'sd-server returned no job id')
  return payload.id
}

export async function pollLocal(context: AdapterContext, job: ProviderJob): Promise<ProviderPoll> {
  const response = await context.fetch(
    `${localBase(context)}/sdcpp/v1/jobs/${encodeURIComponent(job.providerJobId)}`,
    {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    },
  )
  if (response.status === 404 || response.status === 410) {
    return { status: 'failed', error: 'sd-server no longer has this job' }
  }
  if (!response.ok) {
    if (response.status >= 500) return { status: 'running' }
    return { status: 'failed', error: `sd-server status failed (HTTP ${response.status})` }
  }

  const payload = (await response.json().catch(() => null)) as LocalJob | null
  const status = String(payload?.status ?? '')
  if (status === 'failed') {
    return { status: 'failed', error: localError(payload, 'sd-server generation failed') }
  }
  if (status === 'cancelled') return { status: 'failed', error: 'sd-server cancelled this job' }
  if (status !== 'completed') return { status: 'running' }

  const images = payload?.result?.images ?? []
  const outputs: ProviderOutput[] = images
    .map((image) => image.b64_json)
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .map((value) => ({ buffer: Buffer.from(value, 'base64'), mime: 'image/png' }))
  if (outputs.length === 0) return { status: 'failed', error: 'sd-server returned no output' }
  return { status: 'succeeded', outputs }
}

export const localImageFlow: ProviderFlow = {
  id: 'local.image',
  kind: 'image',
  matches: (model) => model.kind === 'image',
  async submit(context, request) {
    if (request.assets.length > 0) {
      throw new ProviderError('local', 'Local sd-server generates from text only. Remove the input images.')
    }
    const providerJobId = await submitLocalImage(context, request)
    return { providerJobId, status: 'running' }
  },
}
