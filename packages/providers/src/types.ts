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

/** The model refused the prompt or the images: a decision, not a transient fault. */
export const DECLINED_FAILURE: ProviderFailure = {
  code: 'invalid_request',
  reason: 'declined',
  retryable: false,
}

export const DECLINED_ERROR =
  'The model declined this request (no charge). Try a different target photo or model.'

export interface ProviderPoll {
  status: 'running' | 'succeeded' | 'failed'
  outputs?: ProviderOutput[]
  error?: string
  failure?: ProviderFailure
  /** The provider could not fetch an input we uploaded: that cached upload URL must not be reused. */
  inputsStale?: boolean
}

export interface ProviderJob {
  providerJobId: string
  model: ModelDefinition
  kind: GenerationKind
}

export interface ProviderUpload {
  url: string
  expiresAt: number | null
}

export interface ProviderUploadCache {
  get(provider: ProviderId, sha256: string): ProviderUpload | null
  save(provider: ProviderId, sha256: string, url: string, expiresAt: number | null): void
  remove(provider: ProviderId, sha256: string): void
}

export interface AdapterContext {
  apiKey: string | null
  baseUrl: string | null
  deployment: string | null
  fetch: typeof fetch
  uploads?: ProviderUploadCache | null
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
  /** Drop the cached upload URLs for these inputs so the next attempt uploads them again. */
  forgetUploads?(context: AdapterContext, assets: ProviderAsset[]): Promise<void>
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
  readonly failure: ProviderFailure | null

  constructor(
    provider: ProviderId,
    message: string,
    status: number | null = null,
    failure: ProviderFailure | null = null,
  ) {
    super(message)
    this.name = 'ProviderError'
    this.provider = provider
    this.status = status
    this.failure = failure
  }
}
