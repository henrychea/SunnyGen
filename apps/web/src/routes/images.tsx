import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import {
  FadeImage,
  Skeleton,
  cn,
  motionFade,
  motionFast,
  motionPop,
  motionPress,
  motionSpring,
  motionSwap,
} from '@sunnygen/ui'
import { Download, FileAudio, Images, Play, Search, Upload, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState, type ReactNode } from 'react'
import { CleanupFailedButton } from '~/components/cleanup-failed'
import { RefreshError } from '~/components/refresh-error'
import { HomeComposer } from '~/components/home/composer'
import {
  GroupCard,
  JobCard,
  OutputCard,
  WallModal,
  WALL_CARD_HEIGHT,
  WALL_FIXED_WIDTH,
  type WallCard,
} from '~/components/home/wall-cards'
import { PageScroll } from '~/components/app-shell'
import { thumbSrcSet, thumbUrl } from '~/lib/media-thumbs'
import { buildWallEntries } from '~/lib/wall-groups'
import { formatBytes } from '~/lib/format'
import { loadDashboard } from '~/server/dashboard.functions'
import {
  loadAssets,
  loadFolders,
  loadGenerationWall,
  loadReferenceLibrary,
  type FolderNode,
} from '~/server/library.functions'
import type { PublicAsset } from '~/server/media.server'

type HomeTab = 'generated' | 'uploaded'
type Preview =
  | { type: 'asset'; item: PublicAsset }
  | { type: 'folder'; folder: FolderNode; assets: PublicAsset[] }

type UploadEntry =
  | { type: 'asset'; asset: PublicAsset; createdAt: number }
  | { type: 'folder'; folder: FolderNode; assets: PublicAsset[]; createdAt: number }

export const Route = createFileRoute('/images')({
  validateSearch: (search: Record<string, unknown>): { avatar?: string } => ({
    avatar: typeof search.avatar === 'string' && search.avatar.length > 0 ? search.avatar : undefined,
  }),
  loaderDeps: ({ search }) => ({ avatar: search.avatar }),
  loader: async ({ deps }) => {
    const [dashboard, generations, folders, studio] = await Promise.all([
      loadDashboard(),
      loadGenerationWall(),
      loadFolders(),
      deps.avatar ? loadReferenceLibrary() : Promise.resolve(null),
    ])
    const initialAvatar = deps.avatar
      ? (studio?.avatars.find((avatar) => avatar.avatarId === deps.avatar) ?? null)
      : null
    return { dashboard, generations, folders, initialAvatar }
  },
  component: ImagesPage,
})

function ImagesPage() {
  const data = Route.useLoaderData()
  const [tab, setTab] = useState<HomeTab>('generated')
  const [query, setQuery] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [groupModal, setGroupModal] = useState<{
    title: string
    cards: WallCard[]
    folderId?: string
  } | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const wall = useQuery({
    queryKey: ['home-generations'],
    queryFn: () => loadGenerationWall(),
    initialData: data.generations,
    placeholderData: keepPreviousData,
    refetchInterval: (query) => {
      if (pickerOpen) return false
      const items = query.state.data ?? []
      return items.some((item) => item.status === 'queued' || item.status === 'running') ? 3000 : false
    },
  })
  const uploads = useQuery({
    queryKey: ['home-uploads'],
    queryFn: () => loadAssets({ data: { source: 'all', limit: 120 } }),
    enabled: tab === 'uploaded',
    placeholderData: keepPreviousData,
  })
  const folders = useQuery({
    queryKey: ['folders'],
    queryFn: () => loadFolders(),
    initialData: data.folders,
  })

  const tabLoading = tab === 'generated' ? wall.isPending : uploads.isPending
  const tabRefreshing =
    tab === 'generated' ? wall.isPlaceholderData : uploads.isFetching && Boolean(uploads.data)

  const needle = query.trim().toLowerCase()
  const generations = (wall.data ?? []).filter((item) =>
    needle.length === 0
      ? true
      : `${item.prompt} ${item.model} ${item.provider}`.toLowerCase().includes(needle),
  )
  const files = uploads.data ?? []
  const foldersById = folders.data ?? []
  const folderById = new Map(foldersById.map((folder) => [folder.id, folder]))
  const entries = buildWallEntries(generations, foldersById)

  const uploadEntries: UploadEntry[] = []
  const uploadFolders = new Map<string, PublicAsset[]>()
  for (const asset of files) {
    if (asset.folderId && folderById.has(asset.folderId)) {
      const current = uploadFolders.get(asset.folderId) ?? []
      current.push(asset)
      uploadFolders.set(asset.folderId, current)
    } else {
      uploadEntries.push({ type: 'asset', asset, createdAt: asset.createdAt })
    }
  }
  for (const [folderId, assets] of uploadFolders) {
    const folder = folderById.get(folderId)
    if (!folder) continue
    if (assets.length === 1) {
      uploadEntries.push({
        type: 'asset',
        asset: assets[0] as PublicAsset,
        createdAt: (assets[0] as PublicAsset).createdAt,
      })
    } else {
      uploadEntries.push({
        type: 'folder',
        folder,
        assets,
        createdAt: Math.max(...assets.map((asset) => asset.createdAt)),
      })
    }
  }
  uploadEntries.sort((left, right) => right.createdAt - left.createdAt)

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
        <h1 className="sr-only">SunnyGen images</h1>
        <div className="border-line-strong bg-canvas sticky top-0 z-20 border-b">
          <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 md:px-6">
            <div className="border-line-strong bg-surface/70 flex items-center rounded-xl border p-0.5">
              <TabButton
                active={tab === 'generated'}
                onClick={() => setTab('generated')}
                icon={<Images size={12} />}
                label="Generated"
              />
              <TabButton
                active={tab === 'uploaded'}
                onClick={() => setTab('uploaded')}
                icon={<Upload size={12} />}
                label="Uploaded"
              />
            </div>

            {tab === 'generated' && wall.isRefetchError && (wall.data?.length ?? 0) > 0 ? (
              <RefreshError message="Could not refresh the wall." onRetry={() => void wall.refetch()} />
            ) : null}

            <div className="text-ink/65 hidden text-[11px] sm:block">
              {tab === 'generated'
                ? `${renderCount} ${renderCount === 1 ? 'render' : 'renders'}${
                    activeCount > 0 ? ` · ${activeCount} active` : ''
                  }`
                : uploads.isPending
                  ? 'Loading uploads'
                  : `${uploadEntries.length} ${uploadEntries.length === 1 ? 'item' : 'items'}`}
            </div>

            <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
              <div className="text-ink/65 hidden items-center gap-1.5 text-[11px] sm:flex">
                <span
                  className={cn(
                    'size-1.5 rounded-full transition-colors',
                    data.dashboard.configuredProviders > 0 ? 'bg-success' : 'bg-warning',
                  )}
                />
                {data.dashboard.configuredProviders > 0
                  ? `${data.dashboard.configuredProviders} provider${data.dashboard.configuredProviders === 1 ? '' : 's'}`
                  : 'No provider key'}
              </div>
              {tab === 'generated' ? <CleanupFailedButton count={failedCount} /> : null}
              {tab === 'generated' ? (
                <label className="border-line-strong bg-surface text-ink/65 focus-within:border-accent/40 flex h-9 w-full items-center gap-1.5 rounded-xl border px-2.5 transition-colors sm:w-[min(52vw,220px)]">
                  <Search size={13} className="shrink-0" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search renders"
                    aria-label="Search renders"
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
              ) : null}
            </div>
          </div>
        </div>

        <div className="px-3 pt-3 pb-64 md:px-6 md:pb-56">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={`${tab}:${tabLoading ? 'loading' : 'ready'}`}
              variants={motionSwap}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={motionFast}
              className="w-full"
            >
              <motion.div animate={{ opacity: tabRefreshing ? 0.55 : 1 }} transition={motionFast}>
                {tabLoading ? (
                  <WallSkeleton />
                ) : tab === 'generated' ? (
                  entries.length > 0 ? (
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
                      title={needle ? 'No renders match that search.' : 'The wall is waiting.'}
                      body={
                        needle
                          ? 'Try a different prompt, model, or provider.'
                          : 'Describe a scene in the prompt bar below. Finished renders land here.'
                      }
                    />
                  )
                ) : uploadEntries.length > 0 ? (
                  <div className="flex flex-wrap content-start gap-3">
                    {uploadEntries.map((entry) =>
                      entry.type === 'folder' ? (
                        <UploadFolderCard
                          key={entry.folder.id}
                          folder={entry.folder}
                          assets={entry.assets}
                          onOpen={() =>
                            setPreview({ type: 'folder', folder: entry.folder, assets: entry.assets })
                          }
                        />
                      ) : (
                        <UploadTile
                          key={entry.asset.id}
                          item={entry.asset}
                          onOpen={() => setPreview({ type: 'asset', item: entry.asset })}
                        />
                      ),
                    )}
                  </div>
                ) : (
                  <EmptyWall
                    title="No uploads yet."
                    body="Add files in Assets, import a Cobalt link, or attach a reference image to the prompt below."
                  />
                )}
              </motion.div>
            </motion.div>
          </AnimatePresence>
        </div>
      </PageScroll>

      <HomeComposer initialAvatar={data.initialAvatar} onPickerOpenChange={setPickerOpen} />

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

      <AnimatePresence>
        {preview ? <PreviewOverlay key="preview" preview={preview} onClose={() => setPreview(null)} /> : null}
      </AnimatePresence>
    </>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'relative flex h-8 items-center gap-1.5 rounded-[10px] px-2.5 text-[11px] font-medium transition-[color,background-color,transform]',
        motionPress,
        active ? 'text-canvas' : 'text-ink/65 hover:text-ink',
      )}
    >
      {active ? (
        <motion.span
          layoutId="home-wall-tab"
          transition={motionSpring}
          className="bg-ink absolute inset-0 rounded-[10px]"
        />
      ) : null}
      <span className="relative flex items-center gap-1.5">
        {icon}
        {label}
      </span>
    </button>
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
        'border-line-strong bg-surface/35 mx-auto mt-[12vh] max-w-md rounded-3xl border border-dashed px-8 py-12 text-center',
      )}
    >
      <p className="text-accent text-[11px] font-semibold">Empty wall</p>
      <h2 className="font-display text-ink mt-2 text-[21px] font-semibold tracking-tight">{title}</h2>
      <p className="text-ink/65 mt-2 text-[12.5px] leading-relaxed">{body}</p>
    </div>
  )
}

function UploadTile({ item, onOpen }: { item: PublicAsset; onOpen: () => void }) {
  const ratio = item.width && item.height ? `${item.width} / ${item.height}` : '4 / 5'
  return (
    <button
      type="button"
      onClick={onOpen}
      style={item.kind === 'audio' ? undefined : { aspectRatio: ratio }}
      className={cn(
        'group border-line-strong bg-surface hover:border-ink/60 relative shrink-0 overflow-hidden rounded-xl border text-left transition-[border-color,transform] active:scale-[0.99] motion-reduce:active:scale-100',
        WALL_CARD_HEIGHT,
        item.kind === 'audio' && WALL_FIXED_WIDTH,
      )}
    >
      {item.kind === 'video' ? (
        <video src={item.url} muted loop playsInline preload="metadata" className="size-full object-cover" />
      ) : item.kind === 'audio' ? (
        <div className="text-ink/65 bg-ink/[0.04] grid size-full place-items-center">
          <FileAudio size={26} />
        </div>
      ) : (
        <FadeImage
          src={thumbUrl(item.url, 640)}
          srcSet={thumbSrcSet(item.url, [320, 640])}
          sizes="(min-width: 768px) 320px, 280px"
          width={item.width ?? undefined}
          height={item.height ?? undefined}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-cover duration-500 group-hover:scale-[1.02]"
        />
      )}
      <span className="bg-ink/70 text-canvas absolute top-2 left-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold">
        {item.kind === 'video' ? <Play size={8} fill="currentColor" /> : null}
        {item.kind}
      </span>
      {item.source === 'social' ? (
        <span className="bg-accent/85 text-canvas absolute top-2 right-2 rounded px-1.5 py-0.5 text-[11px] font-semibold">
          Cobalt
        </span>
      ) : null}
      <span className="bg-ink/60 text-canvas absolute right-2 bottom-2 rounded px-1.5 py-0.5 text-[11px] font-medium">
        {formatBytes(item.byteSize)}
      </span>
    </button>
  )
}

function UploadFolderCard({
  folder,
  assets,
  onOpen,
}: {
  folder: FolderNode
  assets: PublicAsset[]
  onOpen: () => void
}) {
  const previews = assets.slice(0, 4)
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'group border-line-strong bg-surface hover:border-ink/60 relative flex shrink-0 flex-col overflow-hidden rounded-xl border text-left transition-[border-color,transform] active:scale-[0.99] motion-reduce:active:scale-100',
        WALL_CARD_HEIGHT,
        WALL_FIXED_WIDTH,
      )}
    >
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
          className={cn(
            'grid size-full gap-0.5',
            previews.length === 2 ? 'grid-cols-2' : 'grid-cols-2 grid-rows-2',
          )}
        >
          {previews.map((asset, index) => (
            <div
              key={asset.id}
              className={cn('overflow-hidden', previews.length === 3 && index === 0 && 'row-span-2')}
            >
              {asset.kind === 'video' ? (
                <video
                  src={asset.url}
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  className="size-full object-cover"
                />
              ) : (
                <FadeImage
                  src={thumbUrl(asset.url, 320)}
                  srcSet={thumbSrcSet(asset.url, [160, 320])}
                  sizes="(min-width: 768px) 160px, 140px"
                  width={asset.width ?? undefined}
                  height={asset.height ?? undefined}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="size-full object-cover duration-500 group-hover:scale-[1.02]"
                />
              )}
            </div>
          ))}
        </div>
        <span className="bg-ink/70 text-canvas absolute top-2 right-2 rounded px-1.5 py-0.5 text-[11px] font-semibold">
          {assets.length}
        </span>
      </div>
      <div className="flex items-center gap-1.5 px-2.5 py-2">
        <span className="text-ink/65 shrink-0 text-[11px]">Folder</span>
        <span className="text-ink/65 truncate text-[11px] font-medium">{folder.name}</span>
      </div>
    </button>
  )
}

function PreviewOverlay({ preview, onClose }: { preview: Preview; onClose: () => void }) {
  const [index, setIndex] = useState(0)
  const items = preview.type === 'folder' ? preview.assets : [preview.item]
  const safeIndex = Math.min(index, items.length - 1)
  const current = items[safeIndex] ?? items[0]

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!current) return null

  return (
    <motion.div
      variants={motionFade}
      initial="hidden"
      animate="visible"
      exit="hidden"
      className="bg-ink/70 fixed inset-0 z-[60] flex items-center justify-center p-3 md:p-8"
      onClick={onClose}
    >
      <motion.div
        variants={motionPop}
        onClick={(event) => event.stopPropagation()}
        className="border-line-strong bg-surface shadow-dialog flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl border"
      >
        <div className="border-line flex items-center gap-2 border-b px-3 py-2">
          <span className="text-ink/65 text-[11px] font-semibold">
            {preview.type === 'folder' ? 'Folder' : 'Upload'}
          </span>
          {preview.type === 'folder' ? (
            <span className="text-ink/65 truncate text-[11px] font-medium">{preview.folder.name}</span>
          ) : null}
          <div className="ml-auto flex items-center gap-1">
            <a
              href={current.url}
              download
              className="text-ink/65 hover:bg-ink/5 hover:text-ink grid size-8 place-items-center rounded-lg transition-[color,background-color,transform] active:scale-90"
              aria-label="Download"
            >
              <Download size={14} />
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close preview"
              title="Close preview"
              className="text-ink/65 hover:bg-ink/5 hover:text-ink grid size-8 place-items-center rounded-lg transition-[color,background-color,transform] active:scale-90"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="bg-ink/[0.03] min-h-0 flex-1 overflow-hidden p-2">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={current.id}
              variants={motionSwap}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={motionFast}
              className="w-full"
            >
              {current.kind === 'video' ? (
                <video
                  src={current.url}
                  controls
                  autoPlay
                  loop
                  playsInline
                  className="mx-auto max-h-[68vh] w-full rounded-xl object-contain"
                />
              ) : current.kind === 'audio' ? (
                <div className="grid min-h-40 place-items-center">
                  <audio src={current.url} controls autoPlay className="w-full max-w-md" />
                </div>
              ) : (
                <FadeImage
                  src={current.url}
                  width={current.width ?? undefined}
                  height={current.height ?? undefined}
                  alt=""
                  className="mx-auto max-h-[68vh] w-full rounded-xl object-contain"
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {items.length > 1 ? (
          <div className="flex gap-1.5 overflow-x-auto px-3 pt-2 pb-1">
            {items.map((item, itemIndex) => (
              <button
                key={`${item.id}-${itemIndex}`}
                type="button"
                onClick={() => setIndex(itemIndex)}
                className={cn(
                  'size-12 shrink-0 overflow-hidden rounded-lg border transition-[border-color,transform] active:scale-95 motion-reduce:active:scale-100',
                  itemIndex === safeIndex ? 'border-accent' : 'border-line-strong hover:border-ink/60',
                )}
              >
                {item.kind === 'video' ? (
                  <video src={item.url} muted preload="metadata" className="size-full object-cover" />
                ) : item.kind === 'audio' ? (
                  <span className="text-ink/65 grid size-full place-items-center">
                    <FileAudio size={16} />
                  </span>
                ) : (
                  <FadeImage
                    src={item.url}
                    width={item.width ?? undefined}
                    height={item.height ?? undefined}
                    alt=""
                    className="size-full object-cover"
                  />
                )}
              </button>
            ))}
          </div>
        ) : null}

        <div className="min-h-0 overflow-y-auto px-4 py-3">
          {preview.type === 'folder' ? (
            <p className="text-ink/65 mb-2 text-[11px]">{preview.assets.length} items in this folder</p>
          ) : null}
          <div className="text-ink/65 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
            <span className="">{current.kind}</span>
            <span>·</span>
            <span>{current.mime}</span>
            <span>·</span>
            <span>{formatBytes(current.byteSize)}</span>
            <span>·</span>
            <span>{new Date(current.createdAt).toLocaleString()}</span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
