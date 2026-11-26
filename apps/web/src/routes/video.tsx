import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Skeleton, cn, motionFast, motionPop, motionSwap } from '@sunnygen/ui'
import { Search, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { PageScroll } from '~/components/app-shell'
import { CleanupFailedButton } from '~/components/cleanup-failed'
import { RefreshError } from '~/components/refresh-error'
import {
  GroupCard,
  JobCard,
  OutputCard,
  WallModal,
  WALL_CARD_HEIGHT,
  WALL_FIXED_WIDTH,
  type WallCard,
} from '~/components/home/wall-cards'
import { buildWallEntries } from '~/lib/wall-groups'
import { VideoComposer } from '~/components/video/composer'
import { loadFolders, loadGenerationWall } from '~/server/library.functions'

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
  const [groupModal, setGroupModal] = useState<{
    title: string
    cards: WallCard[]
    folderId?: string
  } | null>(null)
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
  const entries = buildWallEntries(generations, folders.data ?? [])

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
        <div className="border-line-strong bg-canvas sticky top-0 z-20 border-b">
          <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 md:px-6">
            <div className="text-ink/65 hidden text-[11px] sm:block">
              {renderCount} {renderCount === 1 ? 'render' : 'renders'}
              {activeCount > 0 ? ` · ${activeCount} active` : ''}
            </div>

            {wall.isRefetchError && (wall.data?.length ?? 0) > 0 ? (
              <RefreshError message="Could not refresh the wall." onRetry={() => void wall.refetch()} />
            ) : null}

            <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
              <CleanupFailedButton count={failedCount} />
              <label className="border-line-strong bg-surface text-ink/65 focus-within:border-accent/40 flex h-9 w-full items-center gap-1.5 rounded-xl border px-2.5 transition-colors sm:w-[min(52vw,220px)]">
                <Search size={13} className="shrink-0" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search videos"
                  aria-label="Search videos"
                  className="text-ink placeholder:text-ink/65 min-w-0 flex-1 bg-transparent text-[11.5px] outline-none"
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
                      className="text-ink/65 hover:text-ink transition-[color,transform] active:scale-90"
                    >
                      <X size={12} />
                    </motion.button>
                  </AnimatePresence>
                ) : null}
              </label>
            </div>
          </div>
        </div>

        <div className="px-3 pt-3 pb-[28rem] md:px-6 md:pb-56">
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
                ) : wall.isError && entries.length === 0 ? (
                  <EmptyWall
                    title="The wall did not load."
                    body="Reload the page. If it stays empty, check that the server is running."
                    action={
                      <button
                        type="button"
                        onClick={() => void wall.refetch()}
                        className="border-line-strong text-ink/65 hover:border-ink/60 hover:text-ink mt-4 rounded-lg border px-3 py-2 text-[11px] font-medium transition-colors"
                      >
                        Try again
                      </button>
                    }
                  />
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
                              onOpen={() =>
                                setGroupModal({
                                  title: entry.title,
                                  cards: entry.cards,
                                  folderId: entry.folderId,
                                })
                              }
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
            folderId={groupModal.folderId}
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

function EmptyWall({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div
      className={cn(
        'border-line-strong bg-surface/35 mx-auto mt-[12vh] max-w-md rounded-3xl border border-dashed px-8 py-12 text-center',
      )}
    >
      <p className="text-accent text-[11px] font-semibold">Empty wall</p>
      <h2 className="font-display text-ink mt-2 text-[21px] font-semibold tracking-tight">{title}</h2>
      <p className="text-ink/70 mt-2 text-[12.5px] leading-relaxed">{body}</p>
      {action}
    </div>
  )
}
