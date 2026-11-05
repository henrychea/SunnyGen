import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  createFolder,
  deleteAsset,
  deleteFolder,
  deleteGeneration,
  getAssetsByIds,
  listAssets,
  listFolders,
  listGenerations,
  moveAssetToFolder,
  moveGenerationToFolder,
  updateFolder,
} from '@sunnygen/db'
import { assetUrl, removeAssetFile, toPublicAsset, type PublicAsset } from './media.server'

export interface GalleryItem {
  id: string
  generationId: string
  kind: 'image' | 'video'
  url: string
  urls: string[]
  width: number | null
  height: number | null
  duration: number | null
  prompt: string
  provider: string
  model: string
  outputCount: number
  folderId: string | null
  createdAt: number
}

export interface FolderNode {
  id: string
  name: string
  parentId: string | null
  color: string | null
  sortIndex: number
  createdAt: number
}

const galleryInput = z.object({
  kind: z.enum(['all', 'image', 'video']).default('all'),
  folderId: z.string().nullable().optional(),
  limit: z.number().int().min(1).max(200).default(60),
  offset: z.number().int().min(0).default(0),
})

export const loadGallery = createServerFn({ method: 'GET' })
  .validator(galleryInput)
  .handler(({ data }): GalleryItem[] => {
    const generations = listGenerations({
      status: 'succeeded',
      kind: data.kind === 'all' ? undefined : data.kind,
      folderId: data.folderId,
      limit: data.limit,
      offset: data.offset,
    })

    const outputIds = generations.flatMap((generation) => generation.outputAssetIds)
    const assets = new Map(getAssetsByIds(outputIds).map((asset) => [asset.id, asset]))

    return generations.flatMap((generation) => {
      const outputs = generation.outputAssetIds
        .map((id) => assets.get(id))
        .filter((asset) => asset !== undefined)
      const first = outputs[0]
      if (!first) return []
      return [
        {
          id: generation.id,
          generationId: generation.id,
          kind: generation.kind,
          url: assetUrl(first.id),
          urls: outputs.map((asset) => assetUrl(asset.id)),
          width: first.width,
          height: first.height,
          duration: first.duration,
          prompt: generation.prompt,
          provider: generation.provider,
          model: generation.model,
          outputCount: outputs.length,
          folderId: generation.folderId,
          createdAt: generation.createdAt,
        },
      ]
    })
  })

const assetsInput = z.object({
  kind: z.enum(['all', 'image', 'video', 'audio']).default('all'),
  source: z.enum(['all', 'generated', 'upload', 'social']).default('all'),
  folderId: z.string().nullable().optional(),
  limit: z.number().int().min(1).max(200).default(60),
  offset: z.number().int().min(0).default(0),
})

export const loadAssets = createServerFn({ method: 'GET' })
  .validator(assetsInput)
  .handler(({ data }): PublicAsset[] => {
    const assets = listAssets({
      kind: data.kind === 'all' ? undefined : data.kind,
      source: data.source === 'all' ? undefined : data.source,
      sources: data.source === 'all' ? ['upload', 'social'] : undefined,
      folderId: data.folderId,
      limit: data.limit,
      offset: data.offset,
    })
    return assets.map(toPublicAsset)
  })

export const loadFailedGenerations = createServerFn({ method: 'GET', strict: false }).handler(() =>
  listGenerations({ status: 'failed', limit: 50 }),
)

export const loadMediaAssets = createServerFn({ method: 'GET', strict: false })
  .validator(z.object({ kind: z.enum(['all', 'image', 'video', 'audio']).default('all') }))
  .handler(({ data }): PublicAsset[] =>
    listAssets({
      kind: data.kind === 'all' ? undefined : data.kind,
      sources: ['upload', 'social', 'generated'],
      limit: 200,
    }).map(toPublicAsset),
  )

export const loadFolders = createServerFn({ method: 'GET' }).handler((): FolderNode[] => {
  return listFolders().map((folder) => ({
    id: folder.id,
    name: folder.name,
    parentId: folder.parentId,
    color: folder.color,
    sortIndex: folder.sortIndex,
    createdAt: folder.createdAt,
  }))
})

export const createFolderFn = createServerFn({ method: 'POST' })
  .validator(z.object({ name: z.string().trim().min(1).max(80), parentId: z.string().nullable().optional() }))
  .handler(({ data }): FolderNode => {
    const folder = createFolder({ name: data.name, parentId: data.parentId ?? null })
    return {
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId,
      color: folder.color,
      sortIndex: folder.sortIndex,
      createdAt: folder.createdAt,
    }
  })

export const renameFolderFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string(), name: z.string().trim().min(1).max(80) }))
  .handler(({ data }) => {
    updateFolder(data.id, { name: data.name })
    return { ok: true }
  })

export const deleteFolderFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string() }))
  .handler(({ data }) => {
    deleteFolder(data.id)
    return { ok: true }
  })

export const moveLibraryItemFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      type: z.enum(['generation', 'asset']),
      id: z.string(),
      folderId: z.string().nullable(),
    }),
  )
  .handler(({ data }) => {
    if (data.type === 'generation') moveGenerationToFolder(data.id, data.folderId)
    else moveAssetToFolder(data.id, data.folderId)
    return { ok: true }
  })

export const deleteLibraryItemFn = createServerFn({ method: 'POST' })
  .validator(z.object({ type: z.enum(['generation', 'asset']), id: z.string() }))
  .handler(async ({ data }) => {
    if (data.type === 'generation') {
      deleteGeneration(data.id)
    } else {
      await removeAssetFile(data.id)
      deleteAsset(data.id)
    }
    return { ok: true }
  })
