import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { GenerationStatus, ProviderId } from '@sunnygen/core'
import {
  createFolder,
  deleteAsset,
  deleteFolder,
  deleteFailedGenerations,
  deleteGeneration,
  getAssetsByIds,
  listAssets,
  listFolders,
  listGenerations,
  listStudioItems,
  moveAssetToFolder,
  moveGenerationToFolder,
  updateFolder,
} from '@sunnygen/db'
import {
  assetUrl,
  removeAssetFile,
  toInputAssets,
  toPublicAsset,
  type InputAsset,
  type PublicAsset,
} from './media.server'
import { readNsfwMode } from './nsfw.server'
import { assetMediaKind, generationMediaKind } from '~/lib/media-kind'
import { referenceAvatar, type ReferenceAvatar } from '~/lib/reference-avatar'

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
  inputAssets: InputAsset[]
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

export interface GenerationWallItem {
  id: string
  generationId: string
  kind: 'image' | 'video'
  status: GenerationStatus
  prompt: string
  provider: ProviderId
  model: string
  params: Record<string, unknown>
  inputAssetIds: string[]
  inputAssets: InputAsset[]
  url: string
  urls: string[]
  outputs: Array<{
    id: string
    url: string
    width: number | null
    height: number | null
    duration: number | null
    kind: 'image' | 'video' | 'audio'
  }>
  width: number | null
  height: number | null
  duration: number | null
  outputCount: number
  folderId: string | null
  error: string | null
  errorCode: string | null
  errorReason: string | null
  errorRetryable: boolean | null
  createdAt: number
  updatedAt: number
}

export const loadGenerationWall = createServerFn({ method: 'GET', strict: false })
  .validator(
    z
      .object({
        kind: z.enum(['all', 'video']).default('all'),
        origin: z.enum(['all', 'studio']).default('all'),
      })
      .optional(),
  )
  .handler(({ data }): GenerationWallItem[] => {
    const kind = data?.kind === 'video' ? 'video' : undefined
    const origin = data?.origin === 'studio' ? 'studio' : undefined
    const includeNsfw = readNsfwMode()
    const generations = [
      ...listGenerations({ status: 'running', kind, limit: 30, includeNsfw }),
      ...listGenerations({ status: 'queued', kind, limit: 30, includeNsfw }),
      ...listGenerations({ status: 'failed', kind, limit: 20, includeNsfw }),
      ...listGenerations({ status: 'succeeded', kind, limit: 80, includeNsfw }),
    ].filter(
      (generation) => generation.kind !== 'lora' && (origin ? generation.params.origin === 'studio' : true),
    )
    const outputIds = generations.flatMap((generation) => generation.outputAssetIds)
    const inputIds = generations.flatMap((generation) => generation.inputAssetIds)
    const assets = new Map(
      getAssetsByIds([...outputIds, ...inputIds], { includeNsfw }).map((asset) => [asset.id, asset]),
    )
    const priority: Record<string, number> = {
      running: 0,
      queued: 1,
      failed: 2,
      succeeded: 3,
    }

    return generations
      .map((generation): GenerationWallItem => {
        const outputs = generation.outputAssetIds
          .map((id) => assets.get(id))
          .filter((asset) => asset !== undefined)
        const first = outputs[0]
        return {
          id: generation.id,
          generationId: generation.id,
          kind: generationMediaKind(generation.kind),
          status: generation.status,
          prompt: generation.prompt,
          provider: generation.provider,
          model: generation.model,
          params: generation.params,
          inputAssetIds: generation.inputAssetIds,
          inputAssets: toInputAssets(generation.inputAssetIds, assets),
          url: first ? assetUrl(first.id) : '',
          urls: outputs.map((asset) => assetUrl(asset.id)),
          outputs: outputs.map((asset) => ({
            id: asset.id,
            url: assetUrl(asset.id),
            width: asset.width,
            height: asset.height,
            duration: asset.duration,
            kind: assetMediaKind(asset.kind),
          })),
          width: first?.width ?? null,
          height: first?.height ?? null,
          duration: first?.duration ?? null,
          outputCount: outputs.length,
          folderId: generation.folderId,
          error: generation.error,
          errorCode: generation.errorCode,
          errorReason: generation.errorReason,
          errorRetryable: generation.errorRetryable,
          createdAt: generation.createdAt,
          updatedAt: generation.updatedAt,
        }
      })
      .sort(
        (left, right) =>
          (priority[left.status] ?? 9) - (priority[right.status] ?? 9) || right.createdAt - left.createdAt,
      )
  })

const galleryInput = z.object({
  kind: z.enum(['all', 'image', 'video']).default('all'),
  folderId: z.string().nullable().optional(),
  limit: z.number().int().min(1).max(200).default(60),
  offset: z.number().int().min(0).default(0),
})

export const loadGallery = createServerFn({ method: 'GET' })
  .validator(galleryInput)
  .handler(({ data }): GalleryItem[] => {
    const includeNsfw = readNsfwMode()
    const generations = listGenerations({
      status: 'succeeded',
      kind: data.kind === 'all' ? undefined : data.kind,
      folderId: data.folderId,
      limit: data.limit,
      offset: data.offset,
      includeNsfw,
    }).filter((generation) => generation.kind !== 'lora')

    const outputIds = generations.flatMap((generation) => generation.outputAssetIds)
    const inputIds = generations.flatMap((generation) => generation.inputAssetIds)
    const assets = new Map(
      getAssetsByIds([...outputIds, ...inputIds], { includeNsfw }).map((asset) => [asset.id, asset]),
    )

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
          kind: generationMediaKind(generation.kind),
          url: assetUrl(first.id),
          urls: outputs.map((asset) => assetUrl(asset.id)),
          width: first.width,
          height: first.height,
          duration: first.duration,
          prompt: generation.prompt,
          provider: generation.provider,
          model: generation.model,
          outputCount: outputs.length,
          inputAssets: toInputAssets(generation.inputAssetIds, assets),
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
      excludeKind: 'lora',
      // A file a studio item owns is shown in the Studio, not in the library.
      excludeStudioAssets: true,
      folderId: data.folderId,
      includeNsfw: readNsfwMode(),
      limit: data.limit,
      offset: data.offset,
    })
    return assets.map(toPublicAsset)
  })

export const loadFailedGenerations = createServerFn({ method: 'GET', strict: false }).handler(() =>
  listGenerations({ status: 'failed', limit: 50, includeNsfw: readNsfwMode() }),
)

export const loadMediaAssets = createServerFn({ method: 'GET', strict: false })
  .validator(z.object({ kind: z.enum(['all', 'image', 'video', 'audio']).default('all') }))
  .handler(({ data }): PublicAsset[] =>
    listAssets({
      kind: data.kind === 'all' ? undefined : data.kind,
      sources: ['upload', 'social', 'generated'],
      excludeKind: 'lora',
      includeNsfw: readNsfwMode(),
      limit: 200,
    }).map(toPublicAsset),
  )

export interface ReferenceLibrary {
  avatars: ReferenceAvatar[]
  assets: PublicAsset[]
}

function largestImage(assets: Array<{ byteSize: number; width: number | null; height: number | null }>): {
  byteSize: number
  width: number | null
  height: number | null
} {
  return {
    byteSize: assets.reduce((total, asset) => Math.max(total, asset.byteSize), 0),
    width: assets.reduce<number | null>(
      (best, asset) => (asset.width === null ? best : Math.max(best ?? 0, asset.width)),
      null,
    ),
    height: assets.reduce<number | null>(
      (best, asset) => (asset.height === null ? best : Math.max(best ?? 0, asset.height)),
      null,
    ),
  }
}

export const loadReferenceLibrary = createServerFn({ method: 'GET', strict: false })
  .validator(z.object({ kind: z.enum(['image', 'video']).default('image') }).optional())
  .handler(async ({ data }): Promise<ReferenceLibrary> => {
    const kind = data?.kind ?? 'image'
    const includeNsfw = readNsfwMode()
    const avatars =
      kind === 'video'
        ? []
        : listStudioItems('avatar')
            .map((item) => referenceAvatar(item))
            .flatMap((reference) => {
              if (!reference) return []
              const panels = getAssetsByIds(reference.assetIds, { includeNsfw })
              // Safe mode drops a reference whose files were stored in NSFW mode.
              if (panels.length !== reference.assetIds.length) return []
              return [
                {
                  ...reference,
                  url: assetUrl(reference.id),
                  ...largestImage(panels),
                },
              ]
            })
    return {
      avatars,
      assets: listAssets({
        kind,
        sources: ['upload', 'social', 'generated', 'studio'],
        excludeKind: 'lora',
        includeNsfw,
        limit: 120,
      }).map(toPublicAsset),
    }
  })

export const cleanupFailedGenerations = createServerFn({ method: 'POST', strict: false }).handler(
  (): { deleted: number } => ({ deleted: deleteFailedGenerations() }),
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
