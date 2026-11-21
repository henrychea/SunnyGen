import type { ImageModelDefinition } from '@sunnygen/core'
import { downloadOutput } from './http'
import { azureSize } from './sizes'
import {
  ProviderError,
  createAdapterFromFlows,
  type AdapterContext,
  type ProviderFlow,
  type ProviderModule,
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

export type AzureImageMode = 'generate' | 'edit'

export function azureImageEndpoint(baseUrl: string, deployment: string, mode: AzureImageMode): string {
  const path = mode === 'edit' ? 'images/edits' : 'images/generations'
  return `${baseUrl.replace(/\/$/, '')}/openai/deployments/${encodeURIComponent(deployment)}/${path}?api-version=${API_VERSION}`
}

export function azureImagePayload(request: ProviderRequest): {
  mode: AzureImageMode
  form: FormData | null
  json: Record<string, unknown> | null
  fields: Record<string, string>
  images: number
} {
  const model = request.model as ImageModelDefinition
  const quality = azureQuality(String(request.params.quality ?? model.defaultQuality))
  const aspectRatio = String(request.params.aspectRatio ?? '1:1')
  const size = azureSize(aspectRatio, String(request.params.quality ?? model.defaultQuality))
  const prompt = request.prompt.slice(0, 20000)
  const fields: Record<string, string> = {
    prompt,
    quality,
    output_format: 'png',
    n: '1',
    size,
  }
  const assets = request.assets.slice(0, model.maxImages)

  if (assets.length > 0) {
    const form = new FormData()
    for (const [key, value] of Object.entries(fields)) form.set(key, value)
    for (const asset of assets) {
      form.append('image[]', new Blob([new Uint8Array(asset.buffer)], { type: asset.mime }), asset.fileName)
    }
    return { mode: 'edit', form, json: null, fields, images: assets.length }
  }

  return { mode: 'generate', form: null, json: fields, fields, images: 0 }
}

async function submit(context: AdapterContext, request: ProviderRequest): Promise<ProviderSubmit> {
  const { key, baseUrl, deployment } = requireConfig(context)
  const payload = azureImagePayload(request)
  const response = await context.fetch(azureImageEndpoint(baseUrl, deployment, payload.mode), {
    method: 'POST',
    headers: payload.form
      ? { 'api-key': key, Authorization: `Bearer ${key}` }
      : { 'api-key': key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: payload.form ?? JSON.stringify(payload.json),
    signal: AbortSignal.timeout(900_000),
  })

  if (!response.ok) {
    let body: unknown = null
    try {
      body = await response.json()
    } catch {
      body = null
    }
    throw new ProviderError('azure', friendlyAzureError(response.status, body), response.status)
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

export const azureImageFlow: ProviderFlow = {
  id: 'azure.image',
  kind: 'image',
  matches: (model) => model.kind === 'image',
  submit,
}

const flows = [azureImageFlow]

export const azureAdapter = createAdapterFromFlows('azure', flows)

export const azureModule: ProviderModule = {
  id: 'azure',
  label: 'Azure AI Foundry',
  adapter: azureAdapter,
  flows,
}
