import { useQueryClient } from '@tanstack/react-query'
import { Badge, cn } from '@sunnygen/ui'
import { AlertCircle, Clock, FileAudio, Folder, Loader2 } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useState, type Ref } from 'react'
import { FailureActions } from '~/components/failure-actions'
import { MediaActionBar } from '~/components/media-action-bar'
import { MediaCard, MediaThumbStrip } from '~/components/media-preview'
import { ReferencesModal } from '~/components/references-modal'
import { deleteLibraryItemFn, type GenerationWallItem } from '~/server/library.functions'

export const WALL_CARD_HEIGHT = 'h-[180px] md:h-[230px]'
export const WALL_FIXED_WIDTH = 'w-[280px] md:w-[320px]'

const cardMotion = {
  layout: 'position',
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0 },
  transition: { duration: 0.2, ease: 'easeOut' },
} as const

export type WallOutput = GenerationWallItem['outputs'][number]
export type WallCard =
  | { type: 'output'; generation: GenerationWallItem; output: WallOutput }
  | { type: 'job'; generation: GenerationWallItem }

function outputRatio(output: WallOutput): string {
  if (output.width && output.height) return `${output.width} / ${output.height}`
  return '4 / 5'
}

export function OutputCard({
  generation,
  output,
  onOpen,
  showCount = true,
  ref,
}: {
  generation: GenerationWallItem
  output: WallOutput
  onOpen?: () => void
  showCount?: boolean
  ref?: Ref<HTMLButtonElement>
}) {
  const ratio = outputRatio(output)
  return (
    <motion.button
      {...cardMotion}
      ref={ref}
      type="button"
      onClick={onOpen}
      data-wall-card="output"
      style={{ aspectRatio: ratio }}
      className={cn(
        'group border-line bg-surface hover:border-ink/25 relative shrink-0 overflow-hidden rounded-xl border text-left shadow-[0_14px_40px_-30px_rgba(42,30,23,0.4)] transition-colors',
        WALL_CARD_HEIGHT,
        !onOpen && 'cursor-default',
      )}
    >
      {output.kind === 'video' ? (
        <video
          src={output.url}
          muted
          loop
          playsInline
          preload="metadata"
          className="size-full object-cover"
        />
      ) : output.kind === 'audio' ? (
        <div className="text-ink/30 bg-ink/[0.04] grid size-full place-items-center">
          <FileAudio size={26} />
        </div>
      ) : (
        <img
          src={output.url}
          alt={generation.prompt || 'Generated image'}
          loading="lazy"
          className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
        />
      )}
      <span className="bg-ink/70 text-canvas absolute top-2 left-2 rounded px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.05em] uppercase backdrop-blur">
        {output.kind}
      </span>
      {showCount && generation.outputs.length > 1 ? (
        <span className="bg-ink/70 text-canvas absolute top-2 right-2 rounded px-1.5 py-0.5 text-[9px] font-semibold backdrop-blur">
          {generation.outputs.length}
        </span>
      ) : null}
      <div className="from-ink/80 pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t to-transparent p-3 pt-10 opacity-0 transition-opacity group-hover:opacity-100">
        <p className="text-canvas/90 line-clamp-2 text-[10.5px] leading-snug">
          {generation.prompt || generation.model}
        </p>
      </div>
    </motion.button>
  )
}

export function JobCard({ generation, ref }: { generation: GenerationWallItem; ref?: Ref<HTMLDivElement> }) {
  const failed = generation.status === 'failed'
  const running = generation.status === 'running'
  return (
    <motion.div
      {...cardMotion}
      ref={ref}
      data-wall-card="job"
      className={cn(
        'border-line bg-surface relative flex shrink-0 flex-col overflow-hidden rounded-xl border',
        failed ? 'h-[220px] md:h-[260px]' : WALL_CARD_HEIGHT,
        WALL_FIXED_WIDTH,
      )}
    >
      <div
        className={cn(
          'flex items-center gap-2 border-b px-3 py-2.5',
          failed ? 'border-error/15 bg-error/[0.04]' : 'border-line/70 bg-canvas/40',
        )}
      >
        <Badge tone={failed ? 'error' : running ? 'accent' : 'warning'}>
          {failed ? 'Failed' : running ? 'Rendering' : 'Queued'}
        </Badge>
        <span className="text-ink/30 ml-auto text-[9.5px] tabular-nums">
          {new Date(generation.createdAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
      {failed ? (
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-3">
          <div className="flex items-start gap-1.5">
            <AlertCircle size={14} className="text-error/60 mt-0.5 shrink-0" />
            <p className="text-error/75 line-clamp-2 text-[10.5px] leading-snug">
              {generation.error ?? 'Generation failed'}
            </p>
          </div>
          <p className="text-ink/65 line-clamp-2 text-[11.5px] leading-snug">
            {generation.prompt || 'No prompt recorded.'}
          </p>
          <p className="text-ink/30 truncate text-[9.5px]">
            {generation.model} · {generation.provider}
          </p>
          <FailureActions generation={generation} className="mt-auto pt-0.5" />
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-2 p-3">
          {running ? (
            <Loader2 size={20} className="text-accent/70 animate-spin" />
          ) : (
            <Clock size={20} className="text-warning/60" />
          )}
          <p className="text-ink/75 line-clamp-3 text-[12px] leading-relaxed">
            {generation.prompt || 'No prompt recorded.'}
          </p>
          <p className="text-ink/30 mt-auto truncate text-[10px]">
            {generation.model} · {generation.provider}
          </p>
        </div>
      )}
    </motion.div>
  )
}

export function GroupCard({
  title,
  count,
  failed,
  outputs,
  onOpen,
  ref,
}: {
  title: string
  count: number
  failed: number
  outputs: WallOutput[]
  onOpen: () => void
  ref?: Ref<HTMLButtonElement>
}) {
  const previews = outputs.slice(0, 4)
  return (
    <motion.button
      {...cardMotion}
      ref={ref}
      type="button"
      onClick={onOpen}
      data-wall-card="group"
      className={cn(
        'group border-line bg-surface hover:border-ink/25 relative flex shrink-0 flex-col overflow-hidden rounded-xl border text-left shadow-[0_14px_40px_-30px_rgba(42,30,23,0.4)] transition-colors',
        WALL_CARD_HEIGHT,
        WALL_FIXED_WIDTH,
      )}
    >
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {previews.length > 0 ? (
          <div
            className={cn(
              'grid size-full gap-0.5',
              previews.length === 2 ? 'grid-cols-2' : 'grid-cols-2 grid-rows-2',
            )}
          >
            {previews.map((output, index) => (
              <div
                key={output.id}
                className={cn('overflow-hidden', previews.length === 3 && index === 0 && 'row-span-2')}
              >
                {output.kind === 'video' ? (
                  <video
                    src={output.url}
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    className="size-full object-cover"
                  />
                ) : (
                  <img
                    src={output.url}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                  />
                )}
              </div>
            ))}
          </div>
        ) : failed > 0 ? (
          <div className="bg-error/[0.04] text-error/45 grid size-full place-items-center">
            <AlertCircle size={26} />
          </div>
        ) : (
          <div className="text-ink/25 bg-ink/[0.03] grid size-full place-items-center">
            <Folder size={26} />
          </div>
        )}
        {failed > 0 ? (
          <span className="bg-error/90 absolute top-2 left-2 rounded px-1.5 py-0.5 text-[9px] font-semibold text-white backdrop-blur">
            {failed} failed
          </span>
        ) : null}
        <span className="bg-ink/70 text-canvas absolute top-2 right-2 rounded px-1.5 py-0.5 text-[9px] font-semibold backdrop-blur">
          {count}
        </span>
      </div>
      <div className="flex items-center gap-1.5 px-2.5 py-2">
        <Folder size={12} className="text-ink/40 shrink-0" />
        <span className="text-ink/65 truncate text-[10.5px] font-medium">{title}</span>
      </div>
    </motion.button>
  )
}

export function WallModal({
  title,
  cards,
  onClose,
}: {
  title: string
  cards: WallCard[]
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const outputs = cards.filter(
    (card): card is Extract<WallCard, { type: 'output' }> => card.type === 'output',
  )
  const jobs = cards.length - outputs.length

  return (
    <div
      className="bg-ink/70 fixed inset-0 z-[60] flex items-center justify-center p-3 backdrop-blur-sm md:p-8"
      onClick={onClose}
    >
      {cards.length === 1 && cards[0]?.type === 'output' ? (
        <OutputModal card={cards[0]} onClose={onClose} />
      ) : outputs.length > 0 ? (
        <CollectionModal title={title} cards={outputs} jobs={jobs} onClose={onClose} />
      ) : (
        <div
          onClick={(event) => event.stopPropagation()}
          className="border-line bg-surface flex max-h-[90dvh] w-full max-w-[1400px] flex-col overflow-hidden rounded-2xl border shadow-2xl"
        >
          <div className="border-line flex items-center gap-3 border-b px-4 py-3">
            <div className="min-w-0">
              <h2 className="font-display text-ink truncate text-[14px] font-semibold">{title}</h2>
              <p className="text-ink/35 mt-0.5 text-[10.5px]">
                {cards.length} {cards.length === 1 ? 'card' : 'cards'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close folder"
              className="text-ink/40 hover:bg-ink/5 hover:text-ink ml-auto grid size-8 place-items-center rounded-lg"
            >
              ×
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-wrap content-start gap-3 overflow-y-auto p-3">
            {cards.map((card) =>
              card.type === 'job' ? (
                <JobCard key={`job-${card.generation.id}`} generation={card.generation} />
              ) : (
                <OutputCard
                  key={`${card.generation.id}-${card.output.id}`}
                  generation={card.generation}
                  output={card.output}
                  showCount={false}
                />
              ),
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function CollectionModal({
  title,
  cards,
  jobs,
  onClose,
}: {
  title: string
  cards: Array<Extract<WallCard, { type: 'output' }>>
  jobs: number
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())
  const [index, setIndex] = useState(0)
  const [showReferences, setShowReferences] = useState(false)
  const visible = cards.filter((card) => !hidden.has(card.generation.id))
  const safeIndex = Math.min(index, visible.length - 1)
  const selected = visible[safeIndex]

  useEffect(() => {
    if (visible.length === 0) onClose()
  }, [visible.length, onClose])

  if (!selected) return null

  const { generation, output } = selected
  const image = output.kind === 'image'

  const remove = async () => {
    await deleteLibraryItemFn({ data: { type: 'generation', id: generation.id } })
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['home-generations'] }),
      queryClient.invalidateQueries({ queryKey: ['gallery'] }),
      queryClient.invalidateQueries({ queryKey: ['folders'] }),
    ])
    setHidden((current) => new Set(current).add(generation.id))
  }

  return (
    <div
      onClick={(event) => event.stopPropagation()}
      className="border-line bg-surface flex max-h-[90dvh] w-full max-w-[1200px] flex-col overflow-hidden rounded-2xl border shadow-2xl"
    >
      <div className="border-line border-b px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-ink truncate text-[14px] font-semibold">{title}</h2>
            <p className="text-ink/35 mt-0.5 text-[10.5px]">
              {visible.length} {visible.length === 1 ? 'image' : 'images'} · {safeIndex + 1} /{' '}
              {visible.length}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close folder"
            className="text-ink/40 hover:bg-ink/5 hover:text-ink ml-auto grid size-8 shrink-0 place-items-center rounded-lg"
          >
            ×
          </button>
        </div>
        <MediaActionBar
          prompt={generation.prompt}
          url={output.url}
          image={image}
          referenceCount={generation.inputAssets.length}
          onShowReferences={() => setShowReferences(true)}
          onDelete={remove}
          className="mt-2"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 md:p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            <MediaCard
              url={output.url}
              kind={output.kind}
              alt={generation.prompt || 'Generated image'}
              mediaClassName="max-h-[calc(90dvh-26rem)] lg:max-h-[calc(90dvh-16rem)]"
            />
            <MediaThumbStrip
              items={visible.map((card) => ({
                id: `${card.generation.id}-${card.output.id}`,
                url: card.output.url,
                kind: card.output.kind,
              }))}
              index={safeIndex}
              onSelect={setIndex}
              label="Choose an image"
            />
          </div>
          <div className="min-w-0">
            <PreviewDetails generation={generation} output={output} />
            {jobs > 0 ? (
              <p className="text-ink/40 mt-3 text-[10.5px]">
                {jobs} queued or failed {jobs === 1 ? 'render is' : 'renders are'} not shown.
              </p>
            ) : null}
          </div>
        </div>
      </div>
      {showReferences ? (
        <ReferencesModal references={generation.inputAssets} onClose={() => setShowReferences(false)} />
      ) : null}
    </div>
  )
}

function OutputModal({
  card,
  onClose,
}: {
  card: Extract<WallCard, { type: 'output' }>
  onClose: () => void
}) {
  const { generation, output } = card
  const image = output.kind === 'image'
  const queryClient = useQueryClient()
  const [showReferences, setShowReferences] = useState(false)

  const remove = async () => {
    await deleteLibraryItemFn({ data: { type: 'generation', id: generation.id } })
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['home-generations'] }),
      queryClient.invalidateQueries({ queryKey: ['gallery'] }),
      queryClient.invalidateQueries({ queryKey: ['folders'] }),
    ])
    onClose()
  }

  return (
    <div
      onClick={(event) => event.stopPropagation()}
      className="border-line bg-surface flex max-h-[90dvh] w-fit max-w-[min(92vw,1200px)] min-w-[min(92vw,420px)] flex-col overflow-hidden rounded-2xl border shadow-2xl"
    >
      <div className="border-line border-b px-4 py-2.5">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-ink text-[14px] font-semibold">Preview</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="text-ink/40 hover:bg-ink/5 hover:text-ink ml-auto grid size-8 shrink-0 place-items-center rounded-lg"
          >
            ×
          </button>
        </div>
        <MediaActionBar
          prompt={generation.prompt}
          url={output.url}
          image={image}
          referenceCount={generation.inputAssets.length}
          onShowReferences={() => setShowReferences(true)}
          onDelete={remove}
          className="mt-2"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 md:p-4">
        <MediaCard
          url={output.url}
          kind={output.kind}
          alt={generation.prompt || 'Generated image'}
          mediaClassName="max-h-[calc(90dvh-25rem)]"
        />
        <PreviewDetails generation={generation} output={output} className="mt-3" />
      </div>
      {showReferences ? (
        <ReferencesModal references={generation.inputAssets} onClose={() => setShowReferences(false)} />
      ) : null}
    </div>
  )
}

function PreviewDetails({
  generation,
  output,
  className,
}: {
  generation: GenerationWallItem
  output: WallOutput
  className?: string
}) {
  return (
    <div className={cn('border-line bg-canvas/40 rounded-xl border p-3.5', className)}>
      <p className="text-ink/40 text-[9.5px] font-semibold tracking-[0.09em] uppercase">Prompt</p>
      <p className="text-ink/70 mt-1.5 text-[12.5px] leading-relaxed whitespace-pre-wrap">
        {generation.prompt || 'No prompt recorded.'}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Detail label="Created" value={new Date(generation.createdAt).toLocaleString()} />
        <Detail label="Model" value={generation.model} />
        <Detail label="Provider" value={generation.provider} />
        {output.width && output.height ? (
          <Detail label="Size" value={`${output.width}×${output.height}`} />
        ) : null}
      </div>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-line/70 bg-surface/60 min-w-0 rounded-lg border px-2.5 py-2">
      <p className="text-ink/35 text-[9.5px] font-semibold tracking-[0.08em] uppercase">{label}</p>
      <p className="text-ink/70 mt-0.5 truncate text-[11.5px]" title={value}>
        {value}
      </p>
    </div>
  )
}
