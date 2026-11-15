import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { buildModelCatalog, syncCatalog } from './model-catalog.server'

export type {
  CatalogProvider,
  ModelCatalogEntry,
  ModelCatalogSource,
  ModelCatalogView,
} from './model-catalog.types'

export const loadModelCatalog = createServerFn({ method: 'GET', strict: false }).handler(() =>
  buildModelCatalog(),
)

export const rebuildModelCatalog = createServerFn({ method: 'POST' })
  .validator(z.object({ provider: z.enum(['sunra', 'fal']) }))
  .handler(async ({ data }) => syncCatalog(data.provider))
