import type { GenerationKind, GenerationParams, ModelDefinition, ProviderId } from '@sunnygen/core'

export interface ProviderAsset {
  buffer: Buffer
  mime: string
  fileName: string
}

export interface ProviderRequest {
  kind: GenerationKind
  model: ModelDefinition
  prompt: string
  params: GenerationParams
  assets: ProviderAsset[]
}

export interface ProviderOutput {
  buffer: Buffer
  mime: string
}

export interface ProviderSubmit {
  providerJobId: string | null
  status: 'running' | 'succeeded'
  outputs?: ProviderOutput[]
}

export interface ProviderPoll {
  status: 'running' | 'succeeded' | 'failed'
  outputs?: ProviderOutput[]
  error?: string
}

export interface ProviderJob {
  providerJobId: string
  model: ModelDefinition
  kind: GenerationKind
}

export interface AdapterContext {
  apiKey: string | null
  baseUrl: string | null
  deployment: string | null
  fetch: typeof fetch
}

export interface ProviderAdapter {
  id: ProviderId
  submit(context: AdapterContext, request: ProviderRequest): Promise<ProviderSubmit>
  poll?(context: AdapterContext, job: ProviderJob): Promise<ProviderPoll>
}

export class ProviderError extends Error {
  readonly provider: ProviderId
  readonly status: number | null

  constructor(provider: ProviderId, message: string, status: number | null = null) {
    super(message)
    this.name = 'ProviderError'
    this.provider = provider
    this.status = status
  }
}
