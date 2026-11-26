import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import {
  cn,
  FadeImage,
  Select,
  motionFade,
  motionFadeRise,
  motionFast,
  motionPop,
  motionSpring,
  motionTransition,
  Skeleton,
  toast,
} from '@sunnygen/ui'
import { Columns3, ImagePlus, LayoutGrid, Loader2, RefreshCw, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { PageBody, PageHeader, PageScroll } from '~/components/app-shell'
import { RefreshError } from '~/components/refresh-error'
import { GalleryCard, GalleryWallTile } from '~/components/gallery-card'
import { FolderChips } from '~/components/folder-chips'
import { CleanupFailedButton } from '~/components/cleanup-failed'
import { FailureActions } from '~/components/failure-actions'
import { GenerateDialog } from '~/components/generate-dialog'
import { MediaActionBar } from '~/components/media-action-bar'
import { ReferencesModal } from '~/components/references-modal'
import {
  deleteLibraryItemFn,
  loadFailedGenerations,
  loadFolders,
  loadGallery,
  moveLibraryItemFn,
  type GalleryItem,
} from '~/server/library.functions'

type KindFilter = 'all' | 'image' | 'video'

export const Route = createFileRoute('/gallery')({
  validateSearch: (search: Record<string, unknown>): { view?: 'canvas' | 'grid' } => ({
    view: search.view === 'grid' ? 'grid' : search.view === 'canvas' ? 'canvas' : undefined,
  }),
  component: GalleryPage,
})

function GalleryPage() {
  const { view: viewParam } = Route.useSearch()
  const view = viewParam ?? 'canvas'
  const navigate = useNavigate()
  const [kind, setKind] = useState<KindFilter>('all')
  const [open, setOpen] = useState<GalleryItem | null>(null)
  const [referencesFor, setReferencesFor] = useState<string | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [folderId, setFolderId] = useState('all')
  const [dir, setDir] = useState(0)
  const [dismissingId, setDismissingId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const gallery = useQuery({
    queryKey: ['gallery', kind, folderId],
    queryFn: () =>
      loadGallery({
        data: {
          kind,
          limit: 120,
          folderId: folderId === 'all' ? undefined : folderId === 'unfiled' ? null : folderId,
        },
      }),
    placeholderData: keepPreviousData,
  })
  const folders = useQuery({ queryKey: ['folders'], queryFn: () => loadFolders() })
  const failures = useQuery({ queryKey: ['failures'], queryFn: () => loadFailedGenerations() })

  const move = useMutation({
    mutationFn: ({ item, target }: { item: GalleryItem; target: string | null }) =>
      moveLibraryItemFn({ data: { type: 'generation', id: item.id, folderId: target } }),
    onSuccess: async (_data, variables) => {
      setOpen((current) => (current ? { ...current, folderId: variables.target } : current))
      const folder = variables.target
        ? (folders.data ?? []).find((entry) => entry.id === variables.target)?.name
        : null
      toast(folder ? `Moved to ${folder}` : 'Moved to Unfiled', { tone: 'info' })
      await queryClient.invalidateQueries({ queryKey: ['gallery'] })
    },
    onError: (error) =>
      toast(error instanceof Error ? error.message : 'Could not move the item', { tone: 'error' }),
  })

  const remove = useMutation({
    mutationFn: (item: GalleryItem) => deleteLibraryItemFn({ data: { type: 'generation', id: item.id } }),
    onSuccess: async () => {
      setOpen(null)
      toast('Item deleted', { tone: 'info' })
      await queryClient.invalidateQueries({ queryKey: ['gallery'] })
    },
    onError: (error) =>
      toast(error instanceof Error ? error.message : 'Could not delete the item', { tone: 'error' }),
  })

  const items = gallery.data ?? []
  const folderOptions = [
    { id: 'all', label: 'All' },
    { id: 'unfiled', label: 'Unfiled' },
    ...(folders.data ?? []).map((folder) => ({ id: folder.id, label: folder.name })),
  ]
  const selectionKey = `${folderId}:${kind}:${view}`
  const pendingSwitch = gallery.isPlaceholderData
  const [displayKey, setDisplayKey] = useState(selectionKey)
  if (!pendingSwitch && displayKey !== selectionKey) setDisplayKey(selectionKey)
  const contentState = gallery.isPending ? 'loading' : items.length === 0 ? 'empty' : 'items'
  const contentKey = `${displayKey}:${contentState}`

  const selectFolder = (id: string) => {
    const from = folderOptions.findIndex((entry) => entry.id === folderId)
    const to = folderOptions.findIndex((entry) => entry.id === id)
    setDir(to >= from ? 1 : -1)
    setFolderId(id)
  }

  const selectKind = (next: KindFilter) => {
    setDir(0)
    setKind(next)
  }

  const selectView = (next: 'canvas' | 'grid') => {
    setDir(next === 'grid' ? 1 : -1)
    void navigate({ to: '/gallery', search: { view: next }, replace: true })
  }

  return (
    <>
      <PageScroll>
        <PageHeader
          eyebrow="Library"
          title="Gallery"
          description="Every finished render on this machine, newest first."
          actions={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setComposerOpen(true)}
                className="bg-accent hover:bg-accent/90 text-accent-ink inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-[12.5px] font-medium transition-transform duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100"
              >
                <ImagePlus size={13} /> New render
              </button>
              <button
                type="button"
                onClick={() => gallery.refetch()}
                className="border-line-strong bg-surface text-ink/65 hover:text-ink inline-flex size-9 items-center justify-center rounded-xl border transition-[color,border-color,scale] duration-150 ease-out active:scale-[0.94] motion-reduce:active:scale-100"
                aria-label="Refresh gallery"
              >
                <RefreshCw
                  size={14}
                  className={cn('transition-opacity', gallery.isFetching ? 'animate-spin' : undefined)}
                />
              </button>
              <Link
                to="/canvas"
                className="bg-ink text-canvas hover:bg-ink/90 inline-flex h-9 items-center rounded-xl px-3.5 text-[12.5px] font-medium transition-transform duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100"
              >
                Open canvas
              </Link>
            </div>
          }
        />
        <PageBody>
          <AnimatePresence initial={false}>
            {(failures.data ?? []).length > 0 ? (
              <motion.div
                key="failures"
                variants={motionFadeRise}
                initial="hidden"
                animate="visible"
                exit="hidden"
                className="border-error/20 bg-error/[0.04] mb-5 overflow-hidden rounded-xl border p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-error text-[11px] font-semibold">Failed lately</p>
                  <div className="flex items-center gap-2">
                    <p className="text-error text-[11px]">{failures.data?.length} unfinished</p>
                    <CleanupFailedButton count={failures.data?.length ?? 0} />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <AnimatePresence initial={false}>
                    {(failures.data ?? []).slice(0, 4).map((failure) => (
                      <motion.div
                        key={failure.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={motionFast}
                        className="bg-surface/70 rounded-lg px-2.5 py-2"
                      >
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-ink/65 truncate text-[11px] font-medium">
                              {failure.model} · {failure.prompt || 'No prompt'}
                            </p>
                            <p className="text-error line-clamp-2 text-[11px] leading-snug">
                              {failure.error ?? 'Generation failed'}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={dismissingId === failure.id}
                            onClick={async () => {
                              setDismissingId(failure.id)
                              try {
                                await deleteLibraryItemFn({ data: { type: 'generation', id: failure.id } })
                                await queryClient.invalidateQueries({ queryKey: ['failures'] })
                                toast('Failure removed', { tone: 'info' })
                              } finally {
                                setDismissingId(null)
                              }
                            }}
                            className="text-ink/65 hover:bg-ink/[0.05] hover:text-ink inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-[color,background-color,scale] duration-150 ease-out active:scale-[0.95] disabled:opacity-60 motion-reduce:active:scale-100"
                          >
                            <AnimatePresence initial={false}>
                              {dismissingId === failure.id ? (
                                <motion.span
                                  key="dismissing"
                                  initial={{ opacity: 0, width: 0 }}
                                  animate={{ opacity: 1, width: 'auto' }}
                                  exit={{ opacity: 0, width: 0 }}
                                  transition={motionFast}
                                  className="inline-flex overflow-hidden"
                                >
                                  <Loader2 size={9} className="animate-spin" />
                                </motion.span>
                              ) : null}
                            </AnimatePresence>
                            Dismiss
                          </button>
                        </div>
                        <FailureActions generation={failure} className="mt-1.5" />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
          <div className="mb-4">
            <FolderChips
              items={folderOptions}
              activeId={folderId}
              onSelect={selectFolder}
              layoutId="gallery-folder-pill"
            />
          </div>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="border-line-strong bg-surface inline-flex rounded-xl border p-0.5">
              {(['all', 'image', 'video'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => selectKind(option)}
                  className={cn(
                    'relative rounded-[10px] px-3 py-1.5 text-[11.5px] font-medium capitalize transition-colors duration-150 ease-out active:scale-[0.96] motion-reduce:active:scale-100',
                    kind === option ? 'text-canvas' : 'text-ink/65 hover:text-ink',
                  )}
                >
                  {kind === option ? (
                    <motion.span
                      layoutId="gallery-kind-pill"
                      transition={motionSpring}
                      className="bg-ink absolute inset-0 rounded-[10px]"
                    />
                  ) : null}
                  <span className="relative">{option === 'all' ? 'Everything' : `${option}s`}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <p className="text-ink/65 text-[11.5px]">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={contentState === 'items' ? `count-${items.length}` : contentState}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={motionFast}
                    className="inline-block"
                  >
                    {gallery.isPending ? 'Loading…' : `${items.length} item${items.length === 1 ? '' : 's'}`}
                  </motion.span>
                </AnimatePresence>
              </p>
              <div className="border-line-strong bg-surface inline-flex rounded-xl border p-0.5">
                <button
                  type="button"
                  onClick={() => selectView('canvas')}
                  className={cn(
                    'relative inline-flex items-center gap-1 rounded-[10px] px-2.5 py-1.5 text-[11px] font-medium transition-colors duration-150 ease-out active:scale-[0.96] motion-reduce:active:scale-100',
                    view === 'canvas' ? 'text-canvas' : 'text-ink/65 hover:text-ink',
                  )}
                >
                  {view === 'canvas' ? (
                    <motion.span
                      layoutId="gallery-view-pill"
                      transition={motionSpring}
                      className="bg-ink absolute inset-0 rounded-[10px]"
                    />
                  ) : null}
                  <span className="relative inline-flex items-center gap-1">
                    <Columns3 size={11} /> Canvas
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => selectView('grid')}
                  className={cn(
                    'relative inline-flex items-center gap-1 rounded-[10px] px-2.5 py-1.5 text-[11px] font-medium transition-colors duration-150 ease-out active:scale-[0.96] motion-reduce:active:scale-100',
                    view === 'grid' ? 'text-canvas' : 'text-ink/65 hover:text-ink',
                  )}
                >
                  {view === 'grid' ? (
                    <motion.span
                      layoutId="gallery-view-pill"
                      transition={motionSpring}
                      className="bg-ink absolute inset-0 rounded-[10px]"
                    />
                  ) : null}
                  <span className="relative inline-flex items-center gap-1">
                    <LayoutGrid size={11} /> Grid
                  </span>
                </button>
              </div>
            </div>
          </div>

          {gallery.isRefetchError ? (
            <div className="mb-3">
              <RefreshError message="Could not refresh the gallery." onRetry={() => void gallery.refetch()} />
            </div>
          ) : null}

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={contentKey}
              initial={dir === 0 ? { opacity: 0 } : { opacity: 0, x: dir * 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              transition={motionTransition}
            >
              <div
                className={cn(
                  'transition-opacity duration-200 ease-out',
                  pendingSwitch ? 'pointer-events-none opacity-55' : 'opacity-100',
                )}
              >
                {gallery.isPending ? (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {Array.from({ length: 8 }).map((_, index) => (
                      <div
                        key={index}
                        className="border-line-strong bg-surface overflow-hidden rounded-2xl border"
                      >
                        <Skeleton className="aspect-[4/5] rounded-none" />
                        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                            <Skeleton className="h-2.5 w-2/3 rounded-full" />
                            <Skeleton className="h-2 w-1/3 rounded-full" />
                          </div>
                          <Skeleton className="h-3 w-10 rounded" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : items.length === 0 ? (
                  <div className="border-line-strong bg-surface/50 rounded-2xl border border-dashed px-6 py-20 text-center">
                    <p className="font-display text-ink text-[16px] font-semibold">The wall is empty.</p>
                    <p className="text-ink/65 mx-auto mt-2 max-w-sm text-[12.5px] leading-relaxed">
                      Generate from the canvas or build an outfit in Studio. Finished images and videos land
                      here.
                    </p>
                    <div className="mt-5 flex justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setComposerOpen(true)}
                        className="bg-accent hover:bg-accent/90 text-accent-ink rounded-xl px-4 py-2 text-[12.5px] font-medium transition-[background-color,scale] duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100"
                      >
                        New render
                      </button>
                      <Link
                        to="/studio"
                        className="border-line-strong bg-surface hover:border-ink/60 hover:bg-canvas rounded-xl border px-4 py-2 text-[12.5px] font-medium transition-[background-color,border-color,scale] duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100"
                      >
                        Open Studio
                      </Link>
                    </div>
                  </div>
                ) : view === 'canvas' ? (
                  <div className="columns-2 gap-3 sm:columns-3 xl:columns-4">
                    <AnimatePresence initial={false}>
                      {items.map((item) => (
                        <motion.div
                          key={item.id}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.98 }}
                          transition={motionFast}
                          className="mb-3 break-inside-avoid"
                        >
                          <GalleryWallTile item={item} onOpen={() => setOpen(item)} />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    <AnimatePresence initial={false}>
                      {items.map((item) => (
                        <motion.div
                          key={item.id}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.98 }}
                          transition={motionFast}
                          className="min-w-0"
                        >
                          <GalleryCard item={item} onOpen={() => setOpen(item)} />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </PageBody>
      </PageScroll>

      <GenerateDialog
        open={composerOpen}
        onOpenChange={setComposerOpen}
        onGenerated={() => void queryClient.invalidateQueries({ queryKey: ['gallery'] })}
      />

      <AnimatePresence>
        {open ? (
          <motion.div
            key="gallery-detail"
            variants={motionFade}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="bg-ink/55 fixed inset-0 z-[70] flex items-center justify-center p-4"
          >
            <motion.div
              variants={motionPop}
              className="border-line-strong bg-surface shadow-dialog relative flex max-h-[92dvh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border"
            >
              <div className="border-line border-b px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="min-w-0">
                    <p className="text-ink/75 truncate text-[12px] font-medium">{open.model}</p>
                    <p className="text-ink/65 text-[11px]">
                      {open.provider} · {new Date(open.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(null)}
                    className="text-ink/65 hover:bg-ink/5 hover:text-ink ml-auto inline-flex size-8 shrink-0 items-center justify-center rounded-lg transition-[color,background-color,scale] duration-150 ease-out active:scale-[0.94] motion-reduce:active:scale-100"
                    aria-label="Close"
                  >
                    <X size={15} />
                  </button>
                </div>
                <MediaActionBar
                  prompt={open.prompt}
                  url={open.url}
                  image={open.kind === 'image'}
                  referenceCount={open.inputAssets.length}
                  onShowReferences={() => setReferencesFor(open.id)}
                  onDelete={async () => {
                    await remove.mutateAsync(open)
                  }}
                  className="mt-2"
                />
              </div>
              <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto md:grid-cols-[1.4fr_1fr]">
                <div className="bg-ink/[0.04] flex items-center justify-center p-4">
                  {open.kind === 'video' ? (
                    <video
                      src={open.url}
                      controls
                      autoPlay
                      loop
                      className="max-h-[64dvh] w-full rounded-lg"
                    />
                  ) : (
                    <FadeImage
                      shimmer
                      src={open.url}
                      width={open.width ?? undefined}
                      height={open.height ?? undefined}
                      alt={open.prompt || 'Generated image'}
                      className="max-h-[72dvh] w-full rounded-lg object-contain"
                    />
                  )}
                </div>
                <div className="flex flex-col gap-4 p-5">
                  <div>
                    <p className="text-ink/65 text-[11px] font-semibold">Prompt</p>
                    <p className="text-ink/70 mt-1.5 text-[12.5px] leading-relaxed whitespace-pre-wrap">
                      {open.prompt || 'No prompt recorded.'}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-[11.5px]">
                    <Meta label="Kind" value={open.kind} />
                    <Meta label="Outputs" value={String(open.outputCount)} />
                    <Meta label="Provider" value={open.provider} />
                    <Meta label="Model" value={open.model} />
                  </div>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-ink/65 flex items-center gap-1.5 text-[11px] font-semibold">
                      Folder
                      <AnimatePresence initial={false}>
                        {move.isPending ? (
                          <motion.span
                            key="moving"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={motionFast}
                            className="inline-flex"
                          >
                            <Loader2 size={9} className="animate-spin" />
                          </motion.span>
                        ) : null}
                      </AnimatePresence>
                    </span>
                    <Select
                      value={open.folderId ?? 'unfiled'}
                      disabled={move.isPending}
                      onChange={(event) =>
                        move.mutate({
                          item: open,
                          target: event.target.value === 'unfiled' ? null : event.target.value,
                        })
                      }
                      className="h-9 text-[11.5px]"
                    >
                      <option value="unfiled">Unfiled</option>
                      {(folders.data ?? []).map((folder) => (
                        <option key={folder.id} value={folder.id}>
                          {folder.name}
                        </option>
                      ))}
                    </Select>
                  </label>
                  {open.urls.length > 1 ? (
                    <div className="grid grid-cols-3 gap-2">
                      {open.urls.map((url, index) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="border-line-strong overflow-hidden rounded-lg border"
                        >
                          {open.kind === 'video' ? (
                            <video src={url} muted className="aspect-square w-full object-cover" />
                          ) : (
                            <FadeImage
                              shimmer
                              src={url}
                              width={open.width ?? undefined}
                              height={open.height ?? undefined}
                              alt={`Output ${index + 1}`}
                              className="aspect-square w-full object-cover"
                            />
                          )}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              <AnimatePresence>
                {referencesFor === open.id ? (
                  <ReferencesModal references={open.inputAssets} onClose={() => setReferencesFor(null)} />
                ) : null}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-line-strong bg-canvas/50 rounded-lg border px-2.5 py-2">
      <p className="text-ink/65 text-[11px] font-semibold">{label}</p>
      <p className="text-ink/70 mt-0.5 truncate text-[11.5px]">{value}</p>
    </div>
  )
}
