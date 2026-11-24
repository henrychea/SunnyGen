import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Skeleton, cn, motionMountRise, motionPress, toast } from '@sunnygen/ui'
import { Camera, Clapperboard, Folder, Image as ImageIcon, Shirt, Star, Trash2 } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { PageScroll } from '~/components/app-shell'
import { CleanupFailedButton } from '~/components/cleanup-failed'
import { FailureActions } from '~/components/failure-actions'
import {
  JobCard,
  OutputCard,
  WallModal,
  WALL_CARD_HEIGHT,
  WALL_FIXED_WIDTH,
  type WallCard,
} from '~/components/home/wall-cards'
import { loadToday, setGenerationReview, type TodayData } from '~/server/dashboard.functions'
import {
  deleteLibraryItemFn,
  loadFolders,
  moveLibraryItemFn,
  type GenerationWallItem,
} from '~/server/library.functions'

export const Route = createFileRoute('/')({
  loader: () => loadToday(),
  component: TodayPage,
})

const REVIEW_ACTION =
  'inline-flex h-6 items-center gap-1 rounded-md border border-line bg-surface px-1.5 text-[10px] font-medium text-ink/60 transition-[color,border-color,background-color,transform] hover:border-ink/25 hover:text-ink active:scale-[0.97] disabled:opacity-50 motion-reduce:active:scale-100'

function isLive(data: TodayData | undefined): boolean {
  return (data?.running.length ?? 0) > 0
}

function TodayPage() {
  const initial = Route.useLoaderData()
  const queryClient = useQueryClient()
  const [movingId, setMovingId] = useState<string | null>(null)
  const [preview, setPreview] = useState<WallCard[] | null>(null)

  const today = useQuery({
    queryKey: ['today'],
    queryFn: () => loadToday(),
    initialData: initial,
    placeholderData: keepPreviousData,
    refetchInterval: (query) => (isLive(query.state.data) ? 3000 : false),
  })
  const folders = useQuery({ queryKey: ['folders'], queryFn: () => loadFolders() })

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['today'] }),
      queryClient.invalidateQueries({ queryKey: ['home-generations'] }),
      queryClient.invalidateQueries({ queryKey: ['gallery'] }),
      queryClient.invalidateQueries({ queryKey: ['folders'] }),
    ])
  }

  const review = useMutation({
    mutationFn: (input: { id: string; reviewed?: boolean; starred?: boolean }) =>
      setGenerationReview({ data: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['today'] }),
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteLibraryItemFn({ data: { type: 'generation', id } }),
    onSuccess: refresh,
  })
  const move = useMutation({
    mutationFn: (input: { id: string; folderId: string | null }) =>
      moveLibraryItemFn({ data: { type: 'generation', id: input.id, folderId: input.folderId } }),
    onSuccess: refresh,
  })
  const keepAll = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) await setGenerationReview({ data: { id, reviewed: true } })
    },
    onSuccess: refresh,
  })

  const data = today.data ?? initial
  const reviewGenerations = data.review
  const reviewOutputs = reviewGenerations.flatMap((generation) =>
    generation.outputs.map((output) => ({ generation, output })),
  )
  const weekRuns = data.week.reduce((total, row) => total + row.runs, 0)
  const folderById = new Map((folders.data ?? []).map((folder) => [folder.id, folder]))

  const keep = async (generation: GenerationWallItem) => {
    await review.mutateAsync({ id: generation.id, reviewed: true })
    toast('Kept. It left the review pile.')
  }

  const star = async (generation: GenerationWallItem) => {
    const starred = Boolean(generation.params.starred)
    await review.mutateAsync({ id: generation.id, starred: !starred })
    toast(starred ? 'Star removed.' : 'Starred.')
  }

  const dismiss = async (generation: GenerationWallItem) => {
    await remove.mutateAsync(generation.id)
    toast('Failed render dismissed.')
  }

  const discard = async (generation: GenerationWallItem) => {
    await remove.mutateAsync(generation.id)
    toast('Render deleted.')
  }

  const relocate = async (generation: GenerationWallItem, folderId: string | null) => {
    await move.mutateAsync({ id: generation.id, folderId })
    setMovingId(null)
    toast(folderId ? `Moved to ${folderById.get(folderId)?.name ?? 'folder'}.` : 'Removed from folder.')
  }

  const keepEverything = async () => {
    const ids = reviewGenerations.map((generation) => generation.id)
    await keepAll.mutateAsync(ids)
    toast(`Kept ${ids.length} ${ids.length === 1 ? 'result' : 'results'}.`)
  }

  return (
    <>
      <PageScroll>
        <div className="border-line/70 bg-canvas/85 sticky top-0 z-20 border-b backdrop-blur-xl">
          <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 md:px-6">
            <div>
              <p className="text-accent/80 text-[9.5px] font-semibold tracking-[0.14em] uppercase">Inbox</p>
              <h1 className="font-display text-ink text-[19px] leading-tight font-semibold tracking-tight">
                Today
              </h1>
            </div>
            <p className="text-ink/40 ml-1 hidden text-[10.5px] sm:block">
              {data.running.length} running · {reviewOutputs.length} to review · {data.failed.length} failed
            </p>
            <div className="ml-auto flex items-center gap-1.5">
              <QuickAction to="/images" icon={<ImageIcon size={12} />} label="Images" />
              <QuickAction to="/video" icon={<Clapperboard size={12} />} label="Video" />
              <QuickAction to="/studio" icon={<Shirt size={12} />} label="Studio" />
              <QuickAction to="/shoots" icon={<Camera size={12} />} label="New shoot" accent />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-7 px-3 py-4 md:px-6 md:py-6">
          <Section
            title="Running now"
            hint={data.running.length > 0 ? `${data.running.length} in flight` : undefined}
          >
            {today.isPending ? (
              <SkeletonRow />
            ) : data.running.length > 0 ? (
              <div className="flex flex-wrap gap-3">
                <AnimatePresence initial={false} mode="popLayout">
                  {data.running.map((generation) => (
                    <JobCard key={generation.id} generation={generation} />
                  ))}
                </AnimatePresence>
              </div>
            ) : (
              <Empty
                title="Nothing is rendering."
                body="Queue a prompt in Images or Video and it shows up here while it runs."
                action={
                  <Link
                    to="/images"
                    className="text-accent/85 hover:text-accent text-[11.5px] font-medium underline-offset-4 hover:underline"
                  >
                    Open Images
                  </Link>
                }
              />
            )}
          </Section>

          <Section
            title="New results to review"
            hint={reviewOutputs.length > 0 ? `${reviewOutputs.length} waiting` : undefined}
            action={
              reviewGenerations.length > 0 ? (
                <button
                  type="button"
                  onClick={() => void keepEverything()}
                  disabled={keepAll.isPending}
                  className={REVIEW_ACTION}
                >
                  Keep all ({reviewGenerations.length})
                </button>
              ) : undefined
            }
          >
            {reviewOutputs.length > 0 ? (
              <div className="flex flex-wrap gap-3">
                <AnimatePresence initial={false} mode="popLayout">
                  {reviewOutputs.map(({ generation, output }) => (
                    <div key={`${generation.id}-${output.id}`} className="flex shrink-0 flex-col gap-1.5">
                      <OutputCard
                        generation={generation}
                        output={output}
                        showCount={false}
                        onOpen={() => setPreview([{ type: 'output', generation, output } as WallCard])}
                      />
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void keep(generation)}
                          className={cn(REVIEW_ACTION, 'text-ink/70')}
                        >
                          Keep
                        </button>
                        <button
                          type="button"
                          onClick={() => void star(generation)}
                          aria-pressed={Boolean(generation.params.starred)}
                          aria-label={generation.params.starred ? 'Unstar' : 'Star'}
                          title={generation.params.starred ? 'Unstar' : 'Star'}
                          className={cn(
                            REVIEW_ACTION,
                            Boolean(generation.params.starred) && 'border-accent/40 text-accent',
                          )}
                        >
                          <Star size={11} fill={generation.params.starred ? 'currentColor' : 'none'} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setMovingId(movingId === generation.id ? null : generation.id)}
                          aria-label="Move to folder"
                          title="Move to folder"
                          className={REVIEW_ACTION}
                        >
                          <Folder size={11} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void discard(generation)}
                          aria-label="Delete render"
                          title="Delete render"
                          className={cn(REVIEW_ACTION, 'hover:border-error/30 hover:text-error')}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                      {movingId === generation.id ? (
                        <div className="border-line bg-surface flex max-w-[320px] flex-wrap gap-1 rounded-lg border p-1.5">
                          {(folders.data ?? []).length === 0 ? (
                            <p className="text-ink/40 px-1 py-0.5 text-[10px]">
                              No folders yet. Create one in Gallery.
                            </p>
                          ) : (
                            <>
                              {(folders.data ?? []).map((folder) => (
                                <button
                                  key={folder.id}
                                  type="button"
                                  onClick={() => void relocate(generation, folder.id)}
                                  className="bg-canvas text-ink/60 hover:text-ink max-w-full truncate rounded px-1.5 py-1 text-[10px] font-medium"
                                >
                                  {folder.name}
                                </button>
                              ))}
                              {generation.folderId ? (
                                <button
                                  type="button"
                                  onClick={() => void relocate(generation, null)}
                                  className="text-ink/40 hover:text-ink rounded px-1.5 py-1 text-[10px] font-medium"
                                >
                                  Remove
                                </button>
                              ) : null}
                            </>
                          )}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </AnimatePresence>
              </div>
            ) : (
              <Empty title="Inbox zero." body="Finished renders land here until you keep or star them." />
            )}
          </Section>

          <Section
            title="Needs attention"
            hint={data.failed.length > 0 ? `${data.failed.length} failed` : undefined}
            action={<CleanupFailedButton count={data.failed.length} />}
          >
            {data.failed.length > 0 ? (
              <div className="flex flex-wrap gap-3">
                <AnimatePresence initial={false} mode="popLayout">
                  {data.failed.map((generation) => (
                    <div key={generation.id} className="flex shrink-0 flex-col gap-1.5">
                      <div className="[&_[data-wall-card]]:h-[196px]">
                        <JobCard generation={generation} />
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void dismiss(generation)}
                          className={cn(REVIEW_ACTION, 'hover:border-error/30 hover:text-error')}
                        >
                          Dismiss
                        </button>
                        <FailureActions generation={generation} onRetried={() => toast('Retry queued.')} />
                      </div>
                    </div>
                  ))}
                </AnimatePresence>
              </div>
            ) : (
              <Empty title="Nothing needs attention." body="Failed renders show up here with a retry." />
            )}
          </Section>

          <Section
            title="This week"
            hint={weekRuns > 0 ? `${weekRuns} finished ${weekRuns === 1 ? 'run' : 'runs'}` : undefined}
          >
            <div className="border-line bg-surface/60 rounded-xl border p-3.5">
              <p className="text-ink/40 text-[10.5px] leading-relaxed">
                SunnyGen does not record what a run costs, so this counts finished runs per provider and model
                since{' '}
                {new Date(data.weekStart).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}
                .
              </p>
              {data.week.length === 0 ? (
                <p className="text-ink/35 mt-2.5 text-[11.5px]">No finished runs this week yet.</p>
              ) : (
                <ul className="mt-2.5 flex flex-col gap-1">
                  {data.week.map((row) => (
                    <li
                      key={`${row.provider}-${row.model}`}
                      className="flex items-center gap-2 text-[11.5px]"
                    >
                      <span className="text-ink/30 w-20 shrink-0 text-[9.5px] font-semibold tracking-[0.08em] uppercase">
                        {row.provider}
                      </span>
                      <span className="text-ink/65 min-w-0 flex-1 truncate">{row.model}</span>
                      <span className="text-ink/70 shrink-0 tabular-nums">
                        {row.runs} {row.runs === 1 ? 'run' : 'runs'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Section>
        </div>
      </PageScroll>

      <AnimatePresence>
        {preview ? (
          <WallModal
            key="today-preview"
            title={preview[0]?.generation.prompt || preview[0]?.generation.model || 'Preview'}
            cards={preview}
            onClose={() => setPreview(null)}
          />
        ) : null}
      </AnimatePresence>
    </>
  )
}

function QuickAction({
  to,
  icon,
  label,
  accent = false,
}: {
  to: string
  icon: ReactNode
  label: string
  accent?: boolean
}) {
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-lg border px-2 text-[10.5px] font-medium transition-[color,border-color,background-color,transform] active:scale-[0.97] motion-reduce:active:scale-100',
        motionPress,
        accent
          ? 'border-accent/30 bg-accent/[0.07] text-accent hover:bg-accent/[0.11]'
          : 'border-line bg-surface text-ink/60 hover:border-ink/25 hover:text-ink',
      )}
    >
      {icon}
      {label}
    </Link>
  )
}

function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string
  hint?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section aria-label={title}>
      <div className="mb-2.5 flex items-center gap-2">
        <h2 className="font-display text-ink text-[13px] font-semibold tracking-tight">{title}</h2>
        {hint ? <span className="text-ink/35 text-[10.5px]">{hint}</span> : null}
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
      {children}
    </section>
  )
}

function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div
      className={cn('border-line bg-surface/35 rounded-2xl border border-dashed px-5 py-6', motionMountRise)}
    >
      <p className="text-ink/65 text-[12px] font-medium">{title}</p>
      <p className="text-ink/40 mt-1 max-w-md text-[11.5px] leading-relaxed">{body}</p>
      {action ? <div className="mt-2.5">{action}</div> : null}
    </div>
  )
}

function SkeletonRow() {
  return (
    <div className="flex flex-wrap gap-3">
      {[0, 1].map((card) => (
        <Skeleton key={card} className={cn('shrink-0', WALL_CARD_HEIGHT, WALL_FIXED_WIDTH)} />
      ))}
    </div>
  )
}

export type { TodayData }
