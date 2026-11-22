import type { ProviderId, VideoModes } from '@sunnygen/core'

export type CatalogProvider = 'sunra' | 'fal'

export interface ModelCatalogEntry {
  key: string
  label: string
  company: string
  provider: ProviderId
  providerLabel: string
  kind: 'image' | 'video'
  price: string | null
  sourceId: string
  editSourceId: string | null
  schemaUrl: string | null
  supported: boolean
  available: boolean
  limitation: string | null
  modelId: string | null
  supportsImages: boolean
  supportsText: boolean
  maxImages: number
  videoModes?: VideoModes
}

export interface ModelCatalogSource {
  id: CatalogProvider
  label: string
  docsUrl: string
  updatedAt: number | null
  priced: boolean
  count: number
}

export interface ModelCatalogView {
  entries: ModelCatalogEntry[]
  sources: ModelCatalogSource[]
  updatedAt: number | null
}
