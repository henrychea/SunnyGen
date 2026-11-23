import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Skeleton, cn, motionFast, motionMountRise, motionPop, motionSwap } from '@sunnygen/ui'
import { Search, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { PageScroll } from '~/components/app-shell'
import { CleanupFailedButton } from '~/components/cleanup-failed'
import {
  GroupCard,
  JobCard,
  OutputCard,
  WallModal,
  WALL_CARD_HEIGHT,
  WALL_FIXED_WIDTH,
  type WallCard,
  type WallOutput,
} from '~/components/home/wall-cards'
import { VideoComposer } from '~/components/video/composer'
import {
  loadFolders,
  loadGenerationWall,
  type FolderNode,
  type GenerationWallItem,
} from '~/server/library.functions'

type WallEntry =
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
      sortRank: number
      createdAt: number
    }

function statusRank(item: GenerationWallItem): number {
  if (item.status === 'running') return 0
  if (item.status === 'queued') return 1
  if (item.status === 'failed') return 2
  return 3
}

function generationCards(items: GenerationWallItem[]): WallCard[] {
  return items.flatMap((generation): WallCard[] => {
    if (generation.status !== 'succeeded') return [{ type: 'job', generation }]
    return generation.outputs.map((output) => ({ type: 'output', generation, output }))
  })
}

export const Route = createFileRoute('/video')({
  loader: async () => {
    const [generations, folders] = await Promise.all([
      loadGenerationWall({ data: { kind: 'video' } }),
      loadFolders(),
    ])
    return { generations, folders }
  },
  component: VideoPage,
})

function VideoPage() {
  const data = Route.useLoaderData()
  const [query, setQuery] = useState('')
  const [groupModal, setGroupModal] = useState<{ title: string; cards: WallCard[] } | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const wall = useQuery({
    queryKey: ['video-wall'],
    queryFn: () => loadGenerationWall({ data: { kind: 'video' } }),
    initialData: data.generations,
    placeholderData: keepPreviousData,
    refetchInterval: (query) => {
      if (pickerOpen) return false
      const items = query.state.data ?? []
      return items.some((item) => item.status === 'queued' || item.status === 'running') ? 3000 : false
    },
  })
  const folders = useQuery({
    queryKey: ['folders'],
    queryFn: () => loadFolders(),
    initialData: data.folders,
  })

  const needle = query.trim().toLowerCase()
  const generations = (wall.data ?? []).filter((item) =>
    needle.length === 0
      ? true
      : `${item.prompt} ${item.model} ${item.provider}`.toLowerCase().includes(needle),
  )
  const folderById = new Map<string, FolderNode>((folders.data ?? []).map((folder) => [folder.id, folder]))
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

  const addGroup = (items: GenerationWallItem[], title: string, id: string) => {
    const cards = generationCards(items)
    if (cards.length === 0) return
    const outputs = items.flatMap((generation) => generation.outputs)
    entries.push({
      type: 'group',
      id,
      title,
      cards,
      outputs,
      sortRank: Math.min(...items.map(statusRank)),
      createdAt: Math.max(...items.map((generation) => generation.createdAt)),
    })
  }

  for (const [folderId, items] of generationFolders) {
    const folder = folderById.get(folderId)
    if (!folder) continue
    if (items.length === 1) individual.push(items[0] as GenerationWallItem)
    else addGroup(items, folder.name, `folder:${folderId}`)
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

  entries.sort((left, right) => left.sortRank - right.sortRank || right.createdAt - left.createdAt)

  const renderCount = generations
    .filter((generation) => generation.status === 'succeeded')
    .reduce((total, generation) => total + generation.outputs.length, 0)
  const activeCount = generations.filter(
    (generation) => generation.status === 'queued' || generation.status === 'running',
  ).length
  const failedCount = (wall.data ?? []).filter((generation) => generation.status === 'failed').length

  return (
    <>
      <PageScroll>
        <h1 className="sr-only">SunnyGen video</h1>
        <div className="border-line/70 bg-canvas/85 sticky top-0 z-20 border-b backdrop-blur-xl">
          <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 md:px-6">
            <div className="text-ink/35 hidden text-[10.5px] sm:block">
              {renderCount} {renderCount === 1 ? 'render' : 'renders'}
              {activeCount > 0 ? ` · ${activeCount} active` : ''}
            </div>

            <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
              <CleanupFailedButton count={failedCount} />
              <label className="border-line bg-surface text-ink/45 focus-within:border-accent/40 flex h-9 w-full items-center gap-1.5 rounded-xl border px-2.5 transition-colors sm:w-[min(52vw,220px)]">
                <Search size={13} className="shrink-0" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search videos"
                  aria-label="Search videos"
                  className="text-ink placeholder:text-ink/30 min-w-0 flex-1 bg-transparent text-[11.5px] outline-none"
                />
                {query ? (
                  <AnimatePresence initial={false} mode="popLayout">
                    <motion.button
                      key="clear-search"
                      type="button"
                      variants={motionPop}
                      initial="hidden"
                      animate="visible"
                      exit="hidden"
                      transition={motionFast}
                      onClick={() => setQuery('')}
                      aria-label="Clear search"
                      className="text-ink/35 hover:text-ink transition-[color,transform] active:scale-90"
                    >
                      <X size={12} />
                    </motion.button>
                  </AnimatePresence>
                ) : null}
              </label>
            </div>
          </div>
        </div>

        <div className="px-3 pt-3 pb-64 md:px-6 md:pb-56">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={wall.isPending ? 'loading' : 'ready'}
              variants={motionSwap}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={motionFast}
              className="w-full"
            >
              <motion.div animate={{ opacity: wall.isPlaceholderData ? 0.55 : 1 }} transition={motionFast}>
                {wall.isPending ? (
                  <WallSkeleton />
                ) : entries.length > 0 ? (
                  <div className="relative flex flex-wrap content-start gap-3">
                    <AnimatePresence initial={false} mode="popLayout">
                      {entries.map((entry) => {
                        if (entry.type === 'job') {
                          return <JobCard key={entry.generation.id} generation={entry.generation} />
                        }
                        if (entry.type === 'group') {
                          return (
                            <GroupCard
                              key={entry.id}
                              title={entry.title}
                              count={entry.cards.length}
                              failed={
                                entry.cards.filter(
                                  (card) => card.type === 'job' && card.generation.status === 'failed',
                                ).length
                              }
                              outputs={entry.outputs}
                              onOpen={() => setGroupModal({ title: entry.title, cards: entry.cards })}
                            />
                          )
                        }
                        return (
                          <OutputCard
                            key={entry.output.id}
                            generation={entry.generation}
                            output={entry.output}
                            onOpen={() =>
                              setGroupModal({
                                title: entry.generation.prompt || entry.generation.model,
                                cards: [
                                  {
                                    type: 'output',
                                    generation: entry.generation,
                                    output: entry.output,
                                  },
                                ],
                              })
                            }
                          />
                        )
                      })}
                    </AnimatePresence>
                  </div>
                ) : (
                  <EmptyWall
                    title={needle ? 'No videos match that search.' : 'The wall is waiting.'}
                    body={
                      needle
                        ? 'Try a different prompt, model, or provider.'
                        : 'Describe a shot in the prompt bar below, or edit a video you already made.'
                    }
                  />
                )}
              </motion.div>
            </motion.div>
          </AnimatePresence>
        </div>
      </PageScroll>

      <VideoComposer onPickerOpenChange={setPickerOpen} />

      <AnimatePresence>
        {groupModal ? (
          <WallModal
            key="wall-modal"
            title={groupModal.title}
            cards={groupModal.cards}
            onClose={() => setGroupModal(null)}
          />
        ) : null}
      </AnimatePresence>
    </>
  )
}

const SKELETON_CARDS = [0, 1, 2, 3, 4, 5, 6, 7]

function WallSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading wall" className="flex flex-wrap content-start gap-3">
      {SKELETON_CARDS.map((card) => (
        <Skeleton key={card} className={cn('shrink-0', WALL_CARD_HEIGHT, WALL_FIXED_WIDTH)} />
      ))}
    </div>
  )
}

function EmptyWall({ title, body }: { title: string; body: string }) {
  return (
    <div
      className={cn(
        'border-line bg-surface/35 mx-auto mt-[12vh] max-w-md rounded-3xl border border-dashed px-8 py-12 text-center',
        motionMountRise,
      )}
    >
      <p className="text-accent/75 text-[10px] font-semibold tracking-[0.16em] uppercase">Empty wall</p>
      <h2 className="font-display text-ink mt-2 text-[21px] font-semibold tracking-tight">{title}</h2>
      <p className="text-ink/45 mt-2 text-[12.5px] leading-relaxed">{body}</p>
    </div>
  )
}
