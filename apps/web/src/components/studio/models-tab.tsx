import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogSurface,
  FadeImage,
  Skeleton,
  motionFadeRise,
  motionFast,
  motionList,
  motionListItem,
} from '@sunnygen/ui'
import { Check, Cpu, Loader2, RotateCcw, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { formatDate } from '~/lib/format'
import { thumbSrcSet, thumbUrl } from '~/lib/media-thumbs'
import type { LoraRunDto, StudioItemDto } from '~/server/studio.functions'

const STATUS: Record<
  LoraRunDto['status'],
  { label: string; tone: 'neutral' | 'accent' | 'success' | 'error' }
> = {
  uploading: { label: 'Uploading', tone: 'neutral' },
  queued: { label: 'Queued', tone: 'neutral' },
  training: { label: 'Training', tone: 'accent' },
  done: { label: 'Done', tone: 'success' },
  failed: { label: 'Failed', tone: 'error' },
}

const RUNNING: LoraRunDto['status'][] = ['uploading', 'queued', 'training']

export function StudioModelsTab({
  runs,
  avatars,
  loading,
  busyId,
  onTrain,
  onRetry,
  onUse,
}: {
  runs: LoraRunDto[]
  avatars: StudioItemDto[]
  loading: boolean
  busyId: string | null
  onTrain: (avatar: StudioItemDto) => void
  onRetry: (run: LoraRunDto) => void
  onUse: (run: LoraRunDto) => void
}) {
  const [picking, setPicking] = useState(false)
  const [dismissed, setDismissed] = useState<string[]>([])

  const notice =
    runs
      .filter((run) => run.status === 'done' && !dismissed.includes(run.id))
      .sort((left, right) => right.createdAt - left.createdAt)[0] ?? null

  if (loading && runs.length === 0) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="border-line bg-surface overflow-hidden rounded-2xl border">
            <Skeleton className="aspect-[4/3] rounded-none" />
            <div className="flex flex-col gap-2 p-3">
              <Skeleton className="h-2.5 w-2/3 rounded-full" />
              <Skeleton className="h-2 w-1/3 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <AnimatePresence initial={false}>
        {notice ? (
          <motion.div
            key={notice.id}
            variants={motionFadeRise}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="border-success/25 bg-success/[0.08] flex items-center gap-2 rounded-xl border px-3 py-2"
          >
            <Check size={13} className="text-success shrink-0" />
            <span className="text-ink/70 text-[11.5px]">
              {notice.avatarName} · v{notice.version} is ready.
            </span>
            <Button size="sm" className="ml-auto h-7 text-[10.5px]" onClick={() => onUse(notice)}>
              Use now
            </Button>
            <button
              type="button"
              onClick={() => setDismissed((current) => [...current, notice.id])}
              aria-label="Dismiss notice"
              className="text-ink/35 hover:text-ink grid size-6 place-items-center rounded-md transition-colors"
            >
              <X size={12} />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="border-line bg-surface/50 text-ink/40 hover:border-accent/40 hover:text-accent hover:bg-surface flex min-h-44 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed transition-[color,border-color,background-color,scale] duration-200 ease-out active:scale-[0.99] motion-reduce:active:scale-100"
        >
          <Cpu size={20} />
          <span className="text-[11.5px] font-medium">
            {runs.length === 0 ? 'Train your first model' : 'Train another model'}
          </span>
        </button>

        <AnimatePresence initial={false}>
          {runs.map((run) => {
            const status = STATUS[run.status]
            const running = RUNNING.includes(run.status)
            return (
              <motion.div
                key={run.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={motionFast}
                className="min-w-0"
              >
                <Card className="hover:border-ink/20 h-full overflow-hidden transition-[border-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5">
                  <div className="bg-ink/[0.04] relative aspect-[4/3]">
                    {run.avatarUrl ? (
                      <FadeImage
                        shimmer
                        src={run.avatarUrl}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="text-ink/25 grid size-full place-items-center">
                        <Cpu size={20} />
                      </div>
                    )}
                    <Badge
                      tone={status.tone}
                      className="border-line bg-surface/95 absolute top-2 left-2 border backdrop-blur"
                    >
                      {running ? <Loader2 size={9} className="animate-spin" /> : null}
                      {status.label}
                    </Badge>
                    <span className="bg-ink/70 text-canvas absolute top-2 right-2 rounded px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.04em] backdrop-blur">
                      v{run.version}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2 p-3">
                    <div className="min-w-0">
                      <p className="text-ink/80 truncate text-[12px] font-medium">{run.avatarName}</p>
                      <p className="text-ink/40 truncate text-[10px] tabular-nums">
                        {run.steps.toLocaleString()} steps · ${run.cost.toFixed(2)} ·{' '}
                        {formatDate(run.createdAt)}
                      </p>
                    </div>
                    {run.triggerWord ? (
                      <p className="text-ink/35 truncate font-mono text-[10px]">{run.triggerWord}</p>
                    ) : null}
                    {run.status === 'failed' ? (
                      <p className="text-error/80 line-clamp-2 text-[10px]">
                        {run.error ?? 'Training failed'}
                      </p>
                    ) : null}
                    {run.status === 'done' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10.5px]"
                        onClick={() => onUse(run)}
                      >
                        Use now
                      </Button>
                    ) : null}
                    {run.status === 'failed' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10.5px]"
                        loading={busyId === run.id}
                        onClick={() => onRetry(run)}
                      >
                        <RotateCcw size={10} /> Retry
                      </Button>
                    ) : null}
                  </div>
                </Card>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      {runs.length === 0 ? (
        <p className="text-ink/35 mt-1 text-[10.5px]">
          A trained model costs $2 per 1,000 steps and takes a few minutes. LoRA runs never appear on the
          wall.
        </p>
      ) : null}

      <Dialog.Root open={picking} onOpenChange={setPicking}>
        <DialogSurface className="w-[min(94vw,560px)]">
          <Dialog.Title className="font-display text-[15px] font-semibold">Train a model</Dialog.Title>
          <p className="text-ink/45 mt-1 text-[11px]">
            Pick an avatar. Its character sheet and 4×4 panel become the training set.
          </p>
          <motion.div
            variants={motionList}
            initial="hidden"
            animate="visible"
            className="mt-3 grid max-h-[52vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4"
          >
            {avatars.map((avatar) => (
              <motion.button
                key={avatar.id}
                variants={motionListItem}
                type="button"
                onClick={() => {
                  setPicking(false)
                  onTrain(avatar)
                }}
                className="group border-line bg-canvas/40 hover:border-accent/40 relative overflow-hidden rounded-xl border text-left transition-[border-color,scale] active:scale-[0.98] motion-reduce:active:scale-100"
              >
                <div className="bg-ink/[0.06] aspect-square overflow-hidden">
                  {avatar.assetUrl ? (
                    <FadeImage
                      src={thumbUrl(avatar.assetUrl, 320)}
                      srcSet={thumbSrcSet(avatar.assetUrl, [320, 640])}
                      sizes="(min-width: 640px) 180px, 33vw"
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="size-full object-cover duration-300 group-hover:scale-[1.02]"
                    />
                  ) : null}
                </div>
                <span className="text-ink/55 block truncate px-2 py-1.5 text-[10px]">{avatar.name}</span>
              </motion.button>
            ))}
          </motion.div>
          {avatars.length === 0 ? (
            <p className="border-line text-ink/40 mt-3 rounded-xl border border-dashed px-3 py-6 text-center text-[11px]">
              Add an avatar in the Avatars tab first.
            </p>
          ) : null}
        </DialogSurface>
      </Dialog.Root>
    </div>
  )
}
