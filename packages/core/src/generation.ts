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
  folderId: string | null
  createdAt: number
  updatedAt: number
}

export interface AssetRecord {
  id: string
  kind: AssetKind
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
