import type { ImageModelDefinition } from '@sunnygen/core'
import { downloadOutput } from './http'
import { azureSize } from './sizes'
import {
  ProviderError,
  type AdapterContext,
  type ProviderAdapter,
  type ProviderRequest,
  type ProviderSubmit,
} from './types'

const API_VERSION = '2025-04-01-preview'

function azureQuality(quality: string | undefined): string {
  if (quality === '1k') return 'low'
  if (quality === '2k') return 'medium'
  if (quality === '4k') return 'high'
  return 'medium'
}

function requireConfig(context: AdapterContext): { key: string; baseUrl: string; deployment: string } {
  if (!context.apiKey)
    throw new ProviderError('azure', 'Azure API key is not configured. Add it in Settings.')
  if (!context.baseUrl || !context.deployment) {
    throw new ProviderError('azure', 'Azure base URL and deployment are not configured.')
  }
  return { key: context.apiKey, baseUrl: context.baseUrl.replace(/\/$/, ''), deployment: context.deployment }
}

function friendlyAzureError(status: number, payload: unknown): string {
  const code =
    payload &&
    typeof payload === 'object' &&
    'error' in payload &&
    payload.error &&
    typeof payload.error === 'object' &&
    'code' in payload.error
      ? String(payload.error.code)
      : ''
  if (code === 'EngineOverloaded') return 'The model is overloaded right now. Please try again.'
  return code || `Azure error ${status}`
}

async function submit(context: AdapterContext, request: ProviderRequest): Promise<ProviderSubmit> {
  const { key, baseUrl, deployment } = requireConfig(context)
  const model = request.model as ImageModelDefinition
  const quality = azureQuality(String(request.params.quality ?? model.defaultQuality))
  const size = azureSize(
    String(request.params.aspectRatio ?? '1:1'),
    String(request.params.quality ?? model.defaultQuality),
  )
  const prompt = request.prompt.slice(0, 20000)

  let response: Response
  if (request.assets.length > 0) {
    const form = new FormData()
    form.set('prompt', prompt)
    form.set('quality', quality)
    form.set('output_format', 'png')
    form.set('n', '1')
    if (size !== 'auto') form.set('size', size)
    for (const asset of request.assets.slice(0, model.maxImages)) {
      form.append('image[]', new Blob([new Uint8Array(asset.buffer)], { type: asset.mime }), asset.fileName)
    }
    response = await context.fetch(
      `${baseUrl}/openai/deployments/${encodeURIComponent(deployment)}/images/edits?api-version=${API_VERSION}`,
      {
        method: 'POST',
        headers: { 'api-key': key, Authorization: `Bearer ${key}` },
        body: form,
        signal: AbortSignal.timeout(900_000),
      },
    )
  } else {
    response = await context.fetch(
      `${baseUrl}/openai/deployments/${encodeURIComponent(deployment)}/images/generations?api-version=${API_VERSION}`,
      {
        method: 'POST',
        headers: { 'api-key': key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          n: 1,
          output_format: 'png',
          quality,
          ...(size !== 'auto' ? { size } : {}),
        }),
        signal: AbortSignal.timeout(900_000),
      },
    )
  }

  if (!response.ok) {
    let payload: unknown = null
    try {
      payload = await response.json()
    } catch {
      payload = null
    }
    throw new ProviderError('azure', friendlyAzureError(response.status, payload), response.status)
  }

  const json = (await response.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>
  }
  const first = json.data?.[0]
  if (!first) throw new ProviderError('azure', 'Azure returned no image data')

  if (first.b64_json) {
    return {
      providerJobId: null,
      status: 'succeeded',
      outputs: [{ buffer: Buffer.from(first.b64_json, 'base64'), mime: 'image/png' }],
    }
  }
  if (first.url) {
    const output = await downloadOutput(first.url)
    return { providerJobId: null, status: 'succeeded', outputs: [output] }
  }
  throw new ProviderError('azure', 'Azure returned no image data')
}

export const azureAdapter: ProviderAdapter = {
  id: 'azure',
  submit,
}
