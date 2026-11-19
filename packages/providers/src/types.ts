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
  /** Public callback URL for providers that support terminal-state webhooks. */
  webhookUrl?: string | null
}

export interface ProviderOutput {
  buffer: Buffer
  mime: string
  fileName?: string
  sourceUrl?: string
}

export interface ProviderSubmit {
  providerJobId: string | null
  status: 'running' | 'succeeded'
  outputs?: ProviderOutput[]
}

export interface ProviderFailure {
  code: string | null
  reason: string | null
  retryable: boolean | null
}

export interface ProviderPoll {
  status: 'running' | 'succeeded' | 'failed'
  outputs?: ProviderOutput[]
  error?: string
  failure?: ProviderFailure
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

export interface ProviderFlow {
  id: string
  kind: GenerationKind
  matches(model: ModelDefinition): boolean
  submit(context: AdapterContext, request: ProviderRequest): Promise<ProviderSubmit>
}

export interface ProviderModule {
  id: ProviderId
  label: string
  adapter: ProviderAdapter
  flows: ProviderFlow[]
  /** Terminal-state callback support; omitted when the provider has none. */
  webhook?: ProviderWebhook
}

/**
 * Provider-specific webhook wire format. The callback carries only a request
 * id; output is always re-fetched through the provider API before it is stored.
 */
export interface ProviderWebhook {
  /** Query parameter that registers the callback URL on submit. */
  queryParam: string
  /** Extract the provider request id from a delivered payload. */
  requestId(payload: Record<string, unknown>): string | null
}

export function createAdapterFromFlows(
  id: ProviderId,
  flows: ProviderFlow[],
  poll?: ProviderAdapter['poll'],
): ProviderAdapter {
  return {
    id,
    async submit(context, request) {
      const flow = flows.find((entry) => entry.kind === request.kind && entry.matches(request.model))
      if (!flow) {
        throw new ProviderError(id, `No ${request.kind} flow is available for ${request.model.label}`)
      }
      return flow.submit(context, request)
    },
    ...(poll ? { poll } : {}),
  }
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
