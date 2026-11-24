import type { WallCard, WallOutput } from '~/components/home/wall-cards'
import type { FolderNode, GenerationWallItem } from '~/server/library.functions'

export type WallEntry =
  | {
      type: 'output'
      generation: GenerationWallItem
      output: WallOutput
      sortRank: number
      createdAt: number
    }
  | { type: 'job'; generation: GenerationWallItem; sortRank: number; createdAt: number }
  | {
      type: 'group'
      id: string
      title: string
      cards: WallCard[]
      outputs: WallOutput[]
      folderId?: string
      sortRank: number
      createdAt: number
    }

export function statusRank(item: GenerationWallItem): number {
  if (item.status === 'running') return 0
  if (item.status === 'queued') return 1
  if (item.status === 'failed') return 2
  return 3
}

export function generationCards(items: GenerationWallItem[]): WallCard[] {
  return items.flatMap((generation): WallCard[] => {
    if (generation.status !== 'succeeded') return [{ type: 'job', generation }]
    return generation.outputs.map((output) => ({ type: 'output', generation, output }))
  })
}

/** One batch per folder, then one card per finished image or one batch per multi-image job. */
export function buildWallEntries(generations: GenerationWallItem[], folders: FolderNode[]): WallEntry[] {
  const folderById = new Map(folders.map((folder) => [folder.id, folder]))
  const entries: WallEntry[] = []
  const generationFolders = new Map<string, GenerationWallItem[]>()
  const individual: GenerationWallItem[] = []

  for (const generation of generations) {
    if (generation.folderId && folderById.has(generation.folderId)) {
      const current = generationFolders.get(generation.folderId) ?? []
      current.push(generation)
      generationFolders.set(generation.folderId, current)
    } else {
      individual.push(generation)
    }
  }

  const addGroup = (items: GenerationWallItem[], title: string, id: string, folderId?: string) => {
    const cards = generationCards(items)
    if (cards.length === 0) return
    entries.push({
      type: 'group',
      id,
      title,
      cards,
      outputs: items.flatMap((generation) => generation.outputs),
      folderId,
      sortRank: Math.min(...items.map(statusRank)),
      createdAt: Math.max(...items.map((generation) => generation.createdAt)),
    })
  }

  for (const [folderId, items] of generationFolders) {
    const folder = folderById.get(folderId)
    if (!folder) continue
    if (items.length === 1) individual.push(items[0] as GenerationWallItem)
    else addGroup(items, folder.name, `folder:${folderId}`, folderId)
  }

  for (const generation of individual) {
    if (generation.status !== 'succeeded') {
      entries.push({
        type: 'job',
        generation,
        sortRank: statusRank(generation),
        createdAt: generation.createdAt,
      })
      continue
    }
    if (generation.outputs.length === 0) continue
    if (generation.outputs.length === 1) {
      entries.push({
        type: 'output',
        generation,
        output: generation.outputs[0] as WallOutput,
        sortRank: statusRank(generation),
        createdAt: generation.createdAt,
      })
    } else {
      addGroup([generation], generation.prompt || generation.model, `generation:${generation.id}`)
    }
  }

  return entries.sort((left, right) => left.sortRank - right.sortRank || right.createdAt - left.createdAt)
}
