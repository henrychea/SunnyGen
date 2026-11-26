import type { AssetKind, AssetSource, GenerationKind, GenerationStatus, ProviderId } from './domain'

export interface GenerationParams {
  aspectRatio?: string
  quality?: string
  resolution?: string
  width?: number
  height?: number
  durationSeconds?: number
  sound?: boolean
  seed?: number
  negativePrompt?: string
  /** Set on submit from the cookie-held NSFW mode; adapters use it for provider safety fields. */
  nsfw?: boolean
  [key: string]: unknown
}

export interface GenerationRequest {
  kind: GenerationKind
  provider: ProviderId
  model: string
  prompt: string
  inputAssetIds: string[]
  params: GenerationParams
}

export interface GenerationRecord {
  id: string
  kind: GenerationKind
  provider: ProviderId
  model: string
  status: GenerationStatus
  prompt: string
  params: GenerationParams
  inputAssetIds: string[]
  outputAssetIds: string[]
  providerJobId: string | null
  error: string | null
  errorCode: string | null
  errorReason: string | null
  errorRetryable: boolean | null
  folderId: string | null
  createdAt: number
  updatedAt: number
  /** Made while NSFW mode was on: hidden from every read path in safe mode. */
  nsfw: boolean
}

export interface AssetRecord {
  id: string
  kind: AssetKind
  name: string | null
  mime: string
  byteSize: number
  width: number | null
  height: number | null
  duration: number | null
  sha256: string
  source: AssetSource
  path: string
  folderId: string | null
  createdAt: number
  /** Stored while NSFW mode was on: hidden from every read path in safe mode. */
  nsfw: boolean
}

export interface ProviderSubmitResult {
  providerJobId: string | null
  status: GenerationStatus
  outputAssetIds?: string[]
  error?: string
}

export interface ProviderJobState {
  status: GenerationStatus
  outputUrls?: string[]
  error?: string
}
