import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import {
  DEFAULT_IMAGE_LIMITS,
  VIDEO_MODE_KEYS,
  getModel,
  videoModeDefinition,
  type VideoModeKey,
  type VideoModelDefinition,
} from '@sunnygen/core'
import {
  Badge,
  Dialog,
  DialogSurface,
  FadeImage,
  Selector,
  Skeleton,
  cn,
  motionFade,
  motionFadeRise,
  motionFast,
  motionPop,
  motionPress,
  motionSpring,
  motionSwap,
  toast,
} from '@sunnygen/ui'
import {
  ArrowLeft,
  ArrowRight,
  Clapperboard,
  Film,
  ImagePlus,
  Loader2,
  Play,
  Sparkles,
  Volume2,
  VolumeX,
  Wand2,
  X,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useRef, useState } from 'react'
import { PageBody, PageHeader, PageScroll } from '~/components/app-shell'
import { AspectRatioSelector } from '~/components/generation-selectors'
import { ReferencePicker } from '~/components/home/reference-picker'
import { ResizeImagesDialog } from '~/components/resize-images-dialog'
import { sortModelChoices } from '~/lib/model-choices'
import { useModelChoices } from '~/lib/use-model-choices'
import { usePromptBridge } from '~/lib/assistant-context'
import {
  defaultVideoParams,
  reconcileVideoParams,
  videoDefinitions,
  videoModesFor,
  type VideoParams,
} from '~/lib/video-flow'
import { thumbSrcSet, thumbUrl } from '~/lib/media-thumbs'
import {
  appendReferences,
  referenceImageCount,
  trimReferences,
  type ReferenceItem,
} from '~/lib/reference-images'
import { oversizedReferences, shouldConfirmResize } from '~/lib/oversized-images'
import { flattenReferenceAssets, referenceIdentity, withIdentityClause } from '~/lib/avatar-references'
import { loadGallery, type GalleryItem } from '~/server/library.functions'
import { submitGeneration } from '~/server/generation.functions'

export const Route = createFileRoute('/video')({
  component: VideoPage,
})

const PROMPT_LIMIT = 20_000
const SKIP_RESIZE_KEY = 'sunnygen.resize-large-images.skip'

function readSkipResize(): boolean {
  try {
    return localStorage.getItem(SKIP_RESIZE_KEY) === '1'
  } catch {
    return false
  }
}

function rememberSkipResize(): boolean {
  try {
    localStorage.setItem(SKIP_RESIZE_KEY, '1')
    return true
  } catch {
    return false
  }
}
const STEP_TITLES = ['References', 'Inputs', 'Generate'] as const
const MODE_CARDS: Array<{ key: VideoModeKey; title: string; description: string; icon: typeof Film }> = [
  { key: 'image', title: 'Start frame', description: 'Animate one image into a shot.', icon: ImagePlus },
  { key: 'frames', title: 'Start + end frame', description: 'Move between two moments.', icon: Film },
  {
    key: 'references',
    title: 'Reference images',
    description: 'Keep a subject or style across the shot.',
    icon: Wand2,
  },
]

function resolutionName(value: string): string {
  const names: Record<string, string> = {
    '360p': 'SD',
    '480p': 'SD',
    '540p': 'qHD',
    '720p': 'HD',
    '1080p': 'Full HD',
    '1440p': 'QHD',
    '4k': '4K UHD',
  }
  return names[value] ?? 'Resolution'
}

function slotLabels(mode: VideoModeKey, slots: number): string[] {
  if (mode === 'image') return ['Start frame']
  if (mode === 'frames') return ['Start frame', 'End frame']
  return Array.from({ length: slots }, (_value, index) => `Reference ${index + 1}`)
}

export function VideoPage() {
  const queryClient = useQueryClient()
  const { choices, catalogOnly } = useModelChoices()
  const [step, setStep] = useState(0)
  const [mode, setMode] = useState<VideoModeKey>('text')
  const [items, setItems] = useState<ReferenceItem[]>([])
  const [prompt, setPrompt] = useState('')
  usePromptBridge('video', 'Video prompt', prompt, setPrompt)
  const [modelId, setModelId] = useState('')
  const [params, setParams] = useState<VideoParams>(() =>
    defaultVideoParams(getModel('veo3_lite') as VideoModelDefinition, 'text'),
  )
  const [skipResize, setSkipResize] = useState(readSkipResize)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [resizePrompt, setResizePrompt] = useState<ReferenceItem[] | null>(null)
  const resizeBypass = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [preview, setPreview] = useState<GalleryItem | null>(null)

  const options = sortModelChoices(choices, catalogOnly).filter((entry) => entry.definition?.kind === 'video')
  const models = videoDefinitions(options)
  const modeModels = videoModesFor(models, mode)
  const activeModel = modeModels.find((model) => model.id === modelId) ?? modeModels[0] ?? null
  const available = new Set(VIDEO_MODE_KEYS.filter((key) => videoModesFor(models, key).length > 0))
  const referenceCards = MODE_CARDS.filter((card) => available.has(card.key))
  const capability = activeModel?.videoModes[mode] ?? null
  const limits = activeModel ? videoModeDefinition(activeModel, mode) : null
  const selectedSlots = capability?.maxImages ?? 0
  const slots =
    mode === 'references' && !activeModel
      ? Math.max(0, ...modeModels.map((model) => model.videoModes.references?.maxImages ?? 0))
      : selectedSlots
  const filled = referenceImageCount(items)
  const remaining = Math.max(0, slots - filled)

  const recent = useQuery({
    queryKey: ['video-recent'],
    queryFn: () => loadGallery({ data: { kind: 'video', limit: 12 } }),
    staleTime: 20_000,
  })

  const chooseMode = (next: VideoModeKey) => {
    setError(null)
    setNotice(null)
    const previous = models.find((entry) => entry.id === modelId)
    const keep = previous?.videoModes[next] ? previous : videoModesFor(models, next)[0]
    if (keep) chooseModel(keep.id, next)
    else {
      setMode(next)
      setParams((current) => ({ ...current, videoMode: next }))
    }
    if (next !== 'text') setItems((current) => trimReferences(current, capacityFor(models, next)))
    setStep(next === 'text' ? 2 : 1)
  }

  const chooseModel = (id: string, nextMode: VideoModeKey = mode) => {
    const option = options.find((entry) => entry.modelId === id)
    const model = option?.definition
    if (!model || model.kind !== 'video') return
    const result = reconcileVideoParams({ ...params, videoMode: nextMode }, model, nextMode)
    setModelId(model.id)
    setMode(result.mode)
    setParams(result.params)
    for (const change of result.changes) toast(change.message, { tone: 'warning' })
    const capacity = model.videoModes[result.mode]?.maxImages ?? 0
    setItems((current) => {
      const kept = trimReferences(current, capacity)
      const removed = referenceImageCount(current) - referenceImageCount(kept)
      if (removed > 0) {
        toast(
          `${model.label} accepts ${capacity} reference${capacity === 1 ? '' : 's'}; removed ${removed}.`,
          {
            tone: 'warning',
          },
        )
      }
      return kept
    })
  }

  const openGenerate = () => {
    if (activeModel) chooseModel(activeModel.id, mode)
    setStep(2)
  }

  const generate = async () => {
    if (busy || !activeModel) return
    if (prompt.trim().length === 0) {
      setError('Describe the shot first.')
      return
    }
    if (prompt.length > PROMPT_LIMIT) {
      setError(`Keep the prompt under ${PROMPT_LIMIT.toLocaleString()} characters.`)
      return
    }
    if (mode !== 'text' && items.length === 0) {
      setError('Add the image the shot should start from.')
      return
    }
    if (mode === 'frames' && items.length < 2) {
      setError('Add both the start and end frame.')
      return
    }

    const bypass = resizeBypass.current
    resizeBypass.current = false
    if (!bypass && shouldConfirmResize(items, { suppressed: skipResize })) {
      setResizePrompt(oversizedReferences(items))
      return
    }

    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const view = await submitGeneration({
        data: {
          kind: 'video',
          model: activeModel.id,
          prompt: withIdentityClause(prompt.trim(), referenceIdentity(items), activeModel.id),
          assetIds: flattenReferenceAssets(items, activeModel.id).slice(0, limits?.maxImages ?? items.length),
          params: {
            videoMode: mode,
            durationSeconds: params.duration,
            resolution: params.resolution,
            aspectRatio: params.aspectRatio,
            sound: params.sound,
            mode: activeModel.defaultMode,
          },
        },
      })
      if (view.generation.status === 'failed') {
        setError(view.generation.error ?? 'Generation failed')
      } else {
        setNotice('Queued. The recent strip updates as soon as the shot lands.')
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['video-recent'] }),
          queryClient.invalidateQueries({ queryKey: ['gallery'] }),
          queryClient.invalidateQueries({ queryKey: ['home-generations'] }),
        ])
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Generation failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <PageScroll>
      <PageHeader
        eyebrow="Create"
        title="Video"
        description="Pick the frames or references, then let a video model turn them into motion."
        actions={
          <span className="text-ink/40 flex items-center gap-1.5 text-[11px]">
            <Clapperboard size={13} className="text-accent/70" />
            {models.length} model{models.length === 1 ? '' : 's'}
          </span>
        }
      />
      <PageBody>
        <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6">
          <StepRail step={step} skipInputs={mode === 'text'} onBack={(next) => setStep(next)} />
          <AnimatePresence mode="wait" initial={false}>
            <motion.section
              key={step}
              variants={motionSwap}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={motionFast}
              aria-label={STEP_TITLES[step]}
            >
              {step === 0 ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <ChoiceCard
                    title="Without references"
                    description="Start from a prompt alone. The model invents the whole shot."
                    icon={Sparkles}
                    disabled={!available.has('text')}
                    onClick={() => chooseMode('text')}
                  />
                  <div className="border-line bg-surface rounded-2xl border p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-ink text-[14px] font-semibold">With references</h2>
                        <p className="text-ink/50 mt-1 text-[12px] leading-relaxed">
                          Give the model a first frame, both ends of the shot, or subject references.
                        </p>
                      </div>
                      <Film size={16} className="text-accent/70 shrink-0" />
                    </div>
                    {referenceCards.length === 0 ? (
                      <p className="text-ink/40 mt-4 text-[11.5px]">
                        None of the available models take image inputs right now.
                      </p>
                    ) : (
                      <div className="mt-4 flex flex-col gap-1.5">
                        {referenceCards.map((card) => (
                          <button
                            key={card.key}
                            type="button"
                            onClick={() => chooseMode(card.key)}
                            className={cn(
                              'border-line bg-canvas/50 hover:border-accent/35 hover:bg-accent/[0.04] flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-[border-color,background-color,transform]',
                              motionPress,
                            )}
                          >
                            <card.icon size={14} className="text-accent/70 shrink-0" />
                            <span className="min-w-0 flex-1">
                              <span className="text-ink block text-[12.5px] font-medium">{card.title}</span>
                              <span className="text-ink/45 block text-[11px] leading-snug">
                                {card.description}
                              </span>
                            </span>
                            <ArrowRight size={13} className="text-ink/30 shrink-0" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {step === 1 ? (
                <InputsStep
                  mode={mode}
                  slots={slots}
                  labels={slotLabels(mode, slots)}
                  items={items}
                  remaining={remaining}
                  onAdd={() => setPickerOpen(true)}
                  onRemove={(index) => setItems((current) => current.filter((_item, i) => i !== index))}
                  onBack={() => setStep(0)}
                  onNext={openGenerate}
                />
              ) : null}

              {step === 2 && activeModel && limits ? (
                <GenerateStep
                  models={modeModels}
                  activeModel={activeModel}
                  mode={mode}
                  params={params}
                  prompt={prompt}
                  busy={busy}
                  error={error}
                  notice={notice}
                  referenceCount={filled}
                  onPrompt={setPrompt}
                  onModel={(id) => chooseModel(id, mode)}
                  onParams={setParams}
                  onBack={() => setStep(mode === 'text' ? 0 : 1)}
                  onGenerate={() => void generate()}
                />
              ) : null}

              {step === 2 && !activeModel ? (
                <div className="border-line bg-surface rounded-2xl border px-5 py-10 text-center">
                  <p className="text-ink/60 text-[13px]">No available model documents this mode right now.</p>
                  <button
                    type="button"
                    onClick={() => setStep(0)}
                    className="text-accent mt-3 text-[12px] font-medium"
                  >
                    Choose another flow
                  </button>
                </div>
              ) : null}
            </motion.section>
          </AnimatePresence>

          <RecentStrip items={recent.data ?? []} loading={recent.isPending} onOpen={setPreview} />
        </div>
      </PageBody>

      <AnimatePresence>
        {pickerOpen ? (
          <ReferencePicker
            title={
              mode === 'references'
                ? 'Add reference images'
                : mode === 'frames'
                  ? 'Add a frame'
                  : 'Add the start frame'
            }
            allowAvatars
            existingIds={items.flatMap((item) => item.assetIds ?? [item.id])}
            max={remaining}
            onClose={() => setPickerOpen(false)}
            onConfirm={(next) => {
              setItems((current) => appendReferences(current, next, slots))
              setPickerOpen(false)
            }}
          />
        ) : null}
      </AnimatePresence>

      <ResizeImagesDialog
        open={resizePrompt !== null}
        items={resizePrompt ?? []}
        limits={DEFAULT_IMAGE_LIMITS}
        onOpenChange={(open) => {
          if (!open) setResizePrompt(null)
        }}
        onConfirm={(dontAskAgain) => {
          if (dontAskAgain) setSkipResize(rememberSkipResize())
          setResizePrompt(null)
          resizeBypass.current = true
          void generate()
        }}
      />

      <Dialog.Root open={preview !== null} onOpenChange={(open) => (open ? null : setPreview(null))}>
        {preview ? (
          <DialogSurface className="w-[min(94vw,840px)] p-3">
            <video
              key={preview.id}
              src={preview.url}
              controls
              autoPlay
              loop
              playsInline
              className="max-h-[76dvh] w-full rounded-xl bg-black object-contain"
            />
            <div className="flex items-start justify-between gap-3 px-1 pt-2">
              <p className="text-ink/60 line-clamp-2 text-[11.5px]">{preview.prompt}</p>
              <button
                type="button"
                onClick={() => setPreview(null)}
                aria-label="Close video"
                className="text-ink/40 hover:text-ink grid size-7 shrink-0 place-items-center rounded-lg"
              >
                <X size={14} />
              </button>
            </div>
          </DialogSurface>
        ) : null}
      </Dialog.Root>
    </PageScroll>
  )
}

function StepRail({
  step,
  skipInputs,
  onBack,
}: {
  step: number
  skipInputs: boolean
  onBack: (step: number) => void
}) {
  return (
    <ol className="flex flex-wrap items-center gap-1.5" aria-label="Video flow steps">
      {STEP_TITLES.map((title, index) => {
        const skipped = skipInputs && index === 1
        const active = index === step
        const done = index < step && !skipped
        return (
          <li key={title} className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={index > step}
              aria-current={active ? 'step' : undefined}
              onClick={() => {
                if (index < step) onBack(index)
              }}
              className={cn(
                'relative flex items-center gap-2 rounded-full px-3 py-1.5 text-[11.5px] font-medium transition-[color,background-color,opacity,transform]',
                motionPress,
                disabled(index, step),
                active ? 'text-canvas' : skipped ? 'text-ink/30' : 'text-ink/55 hover:text-ink',
              )}
            >
              {active ? (
                <motion.span
                  layoutId="video-step"
                  transition={motionSpring}
                  className="bg-ink absolute inset-0 rounded-full"
                />
              ) : null}
              <span className="relative flex items-center gap-2">
                <span
                  className={cn(
                    'grid size-5 place-items-center rounded-full text-[10px] tabular-nums',
                    stepBadge(active, done),
                  )}
                >
                  {stepMark(index, skipped, done)}
                </span>
                {title}
              </span>
            </button>
            {index < STEP_TITLES.length - 1 ? <span className="bg-ink/10 h-px w-4" /> : null}
          </li>
        )
      })}
    </ol>
  )
}

function disabled(index: number, step: number): string {
  return index > step ? 'pointer-events-none opacity-40' : ''
}

function stepBadge(active: boolean, done: boolean): string {
  if (active) return 'bg-white/15'
  return done ? 'bg-accent/12 text-accent' : 'bg-ink/[0.06]'
}

function stepMark(index: number, skipped: boolean, done: boolean): string | number {
  if (skipped) return '—'
  return done ? '✓' : index + 1
}

function ChoiceCard({
  title,
  description,
  icon: Icon,
  disabled,
  onClick,
}: {
  title: string
  description: string
  icon: typeof Film
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'border-line bg-surface group hover:border-accent/35 flex h-full flex-col rounded-2xl border p-5 text-left transition-[border-color,transform] duration-200 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-40 motion-reduce:active:scale-100',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-ink text-[14px] font-semibold">{title}</h2>
          <p className="text-ink/50 mt-1 text-[12px] leading-relaxed">{description}</p>
        </div>
        <span className="bg-accent/[0.08] text-accent grid size-8 shrink-0 place-items-center rounded-xl">
          <Icon size={15} />
        </span>
      </div>
      <span className="text-ink/35 group-hover:text-accent mt-auto inline-flex items-center gap-1 pt-4 text-[11px] font-medium transition-colors">
        Continue <ArrowRight size={12} />
      </span>
    </button>
  )
}

function InputsStep({
  mode,
  slots,
  labels,
  items,
  remaining,
  onAdd,
  onRemove,
  onBack,
  onNext,
}: {
  mode: VideoModeKey
  slots: number
  labels: string[]
  items: ReferenceItem[]
  remaining: number
  onAdd: () => void
  onRemove: (index: number) => void
  onBack: () => void
  onNext: () => void
}) {
  return (
    <div className="border-line bg-surface rounded-2xl border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-ink text-[14px] font-semibold">Inputs</h2>
          <p className="text-ink/50 mt-1 text-[12px]">
            {mode === 'image'
              ? 'Pick the first frame. Everything after it is generated.'
              : mode === 'frames'
                ? 'Pick the first and last frame. The model fills the motion between them.'
                : 'Pick the subjects or style the shot should keep.'}
          </p>
        </div>
        <span className="text-ink/35 text-[10.5px] tabular-nums">
          {items.length}/{slots}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        <AnimatePresence initial={false} mode="popLayout">
          {labels.map((label, index) => {
            const item = items[index]
            return item ? (
              <motion.div
                key={`${item.id}-${label}`}
                layout
                variants={motionPop}
                initial="hidden"
                animate="visible"
                exit="hidden"
                transition={motionFast}
                className="border-line group relative overflow-hidden rounded-xl border"
              >
                <FadeImage
                  src={thumbUrl(item.url, 320)}
                  srcSet={thumbSrcSet(item.url, [320, 640])}
                  sizes="(min-width: 768px) 160px, 33vw"
                  alt=""
                  decoding="async"
                  className="aspect-[3/4] w-full object-cover"
                />
                <span className="bg-ink/65 text-canvas absolute inset-x-0 bottom-0 truncate px-1.5 py-1 text-[8.5px] font-semibold tracking-[0.04em] uppercase backdrop-blur">
                  {label}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  aria-label={`Remove ${label}`}
                  className="bg-ink/75 text-canvas absolute top-1 right-1 grid size-5 place-items-center rounded opacity-100 transition-transform hover:scale-110 active:scale-95 md:opacity-0 md:group-hover:opacity-100"
                >
                  <X size={10} />
                </button>
              </motion.div>
            ) : (
              <motion.button
                key={`empty-${label}`}
                type="button"
                variants={motionFadeRise}
                initial="hidden"
                animate="visible"
                exit="hidden"
                onClick={onAdd}
                disabled={remaining <= 0}
                className="border-line bg-canvas/40 text-ink/40 hover:border-accent/35 hover:text-accent flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded-xl border border-dashed px-1 text-center transition-[color,border-color,transform] active:scale-95 disabled:opacity-30"
              >
                <ImagePlus size={15} />
                <span className="text-[8.5px] leading-tight font-semibold tracking-[0.04em] uppercase">
                  {label}
                </span>
              </motion.button>
            )
          })}
        </AnimatePresence>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2" data-assistant-clearance="">
        <button
          type="button"
          onClick={onBack}
          className="text-ink/55 hover:text-ink flex items-center gap-1.5 rounded-lg px-2 py-2 text-[12px] font-medium transition-colors"
        >
          <ArrowLeft size={13} /> Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={items.length === 0 || (mode === 'frames' && items.length < 2)}
          className="bg-accent hover:bg-accent/90 flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12.5px] font-semibold text-white shadow-[0_10px_24px_-14px_rgba(163,22,33,0.9)] transition-[background-color,transform] disabled:pointer-events-none disabled:opacity-35"
        >
          Continue <ArrowRight size={13} />
        </button>
      </div>
    </div>
  )
}

function GenerateStep({
  models,
  activeModel,
  mode,
  params,
  prompt,
  busy,
  error,
  notice,
  referenceCount,
  onPrompt,
  onModel,
  onParams,
  onBack,
  onGenerate,
}: {
  models: VideoModelDefinition[]
  activeModel: VideoModelDefinition
  mode: VideoModeKey
  params: VideoParams
  prompt: string
  busy: boolean
  error: string | null
  notice: string | null
  referenceCount: number
  onPrompt: (value: string) => void
  onModel: (id: string) => void
  onParams: (update: (current: VideoParams) => VideoParams) => void
  onBack: () => void
  onGenerate: () => void
}) {
  const limits = videoModeDefinition(activeModel, mode)
  const capability = activeModel.videoModes[mode]
  const overLimit = prompt.length > PROMPT_LIMIT
  return (
    <div className="border-line bg-surface rounded-2xl border p-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0">
          <label htmlFor="video-prompt" className="text-ink text-[14px] font-semibold">
            Prompt
          </label>
          <textarea
            id="video-prompt"
            value={prompt}
            onChange={(event) => onPrompt(event.target.value)}
            rows={6}
            placeholder="Describe the shot: subject, action, camera, light…"
            disabled={busy}
            className="border-line bg-canvas/50 text-ink placeholder:text-ink/30 focus:border-accent/40 mt-2 w-full resize-y rounded-xl border px-3 py-2.5 text-[13px] leading-relaxed transition-colors outline-none disabled:opacity-60"
          />
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Selector
              className="min-w-[220px] flex-1"
              size="sm"
              value={activeModel.id}
              disabled={busy}
              ariaLabel="Model"
              searchable
              searchPlaceholder="Search video models"
              options={models.map((model) => ({
                key: model.id,
                label: model.label,
                description: model.providerLabel,
                meta: model.price ?? undefined,
                searchText: `${model.label} ${model.providerLabel}`,
              }))}
              menuMinWidth={320}
              onChange={(option) => onModel(option.key)}
            />
            {limits.ratios.length > 0 ? (
              <AspectRatioSelector
                className="w-[108px] shrink-0"
                value={params.aspectRatio}
                ratios={limits.ratios}
                disabled={busy}
                onChange={(ratio) => onParams((current) => ({ ...current, aspectRatio: ratio }))}
              />
            ) : null}
            {limits.durations.length > 0 ? (
              <Selector
                className="w-[86px] shrink-0"
                size="sm"
                value={String(params.duration)}
                disabled={busy}
                ariaLabel="Duration"
                options={limits.durations.map((option) => ({
                  key: String(option),
                  label: `${option}s`,
                  description: 'Duration',
                }))}
                showTriggerDescription={false}
                menuMinWidth={150}
                onChange={(option) => onParams((current) => ({ ...current, duration: Number(option.key) }))}
              />
            ) : null}
            {limits.resolutions.length > 0 ? (
              <Selector
                className="w-[104px] shrink-0"
                size="sm"
                value={params.resolution}
                disabled={busy}
                ariaLabel="Resolution"
                options={limits.resolutions.map((option) => ({
                  key: option,
                  label: option.toUpperCase(),
                  description: resolutionName(option),
                }))}
                showTriggerDescription={false}
                menuMinWidth={180}
                onChange={(option) => onParams((current) => ({ ...current, resolution: option.key }))}
              />
            ) : null}
            {limits.sound ? (
              <button
                type="button"
                aria-pressed={params.sound}
                onClick={() => onParams((current) => ({ ...current, sound: !current.sound }))}
                disabled={busy}
                className={cn(
                  'flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11.5px] font-medium transition-[color,background-color,border-color,transform]',
                  motionPress,
                  params.sound
                    ? 'border-accent/30 bg-accent/10 text-accent'
                    : 'border-line bg-canvas/55 text-ink/55 hover:text-ink',
                )}
              >
                {params.sound ? <Volume2 size={13} /> : <VolumeX size={13} />}
                Audio
              </button>
            ) : null}
          </div>
        </div>

        <aside className="border-line bg-canvas/40 flex flex-col gap-3 rounded-xl border p-4">
          <div>
            <p className="text-ink/35 text-[9.5px] font-semibold tracking-[0.12em] uppercase">Model</p>
            <p className="text-ink mt-1 text-[13px] font-semibold">{activeModel.label}</p>
            <p className="text-ink/45 text-[11px]">{activeModel.providerLabel}</p>
          </div>
          <div className="text-ink/55 flex flex-wrap items-center gap-1.5 text-[10.5px]">
            <Badge tone="neutral">{modeLabel(mode)}</Badge>
            {capability && capability.maxImages > 0 ? (
              <span className="border-line bg-surface rounded-md border px-1.5 py-0.5">
                {capability.maxImages} image{capability.maxImages === 1 ? '' : 's'}
              </span>
            ) : null}
            {referenceCount > 0 ? (
              <span className="border-line bg-surface rounded-md border px-1.5 py-0.5">
                {referenceCount} attached
              </span>
            ) : null}
          </div>
          <div className="border-line/70 mt-auto border-t pt-2.5">
            <p className="text-ink/35 text-[9.5px] font-semibold tracking-[0.12em] uppercase">Price</p>
            <p className="text-ink/65 mt-1 text-[11.5px] leading-snug">
              {activeModel.price ?? 'Set by the provider'}
            </p>
          </div>
        </aside>
      </div>

      <AnimatePresence initial={false}>
        {error || notice ? (
          <motion.p
            key={error ?? notice}
            variants={motionFadeRise}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className={cn('mt-3 text-[11px]', error ? 'text-error' : 'text-ink/45')}
          >
            {error ?? notice}
          </motion.p>
        ) : null}
      </AnimatePresence>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2" data-assistant-clearance="">
        <button
          type="button"
          onClick={onBack}
          className="text-ink/55 hover:text-ink flex items-center gap-1.5 rounded-lg px-2 py-2 text-[12px] font-medium transition-colors"
        >
          <ArrowLeft size={13} /> Back
        </button>
        <div className="flex items-center gap-3">
          <span className={cn('text-[10px] tabular-nums', overLimit ? 'text-error' : 'text-ink/30')}>
            {prompt.length.toLocaleString()}/{PROMPT_LIMIT.toLocaleString()}
          </span>
          <button
            type="button"
            onClick={onGenerate}
            disabled={busy || prompt.trim().length === 0 || overLimit}
            className="bg-accent hover:bg-accent/90 flex items-center gap-2 rounded-xl px-4 py-2.5 text-[12.5px] font-semibold text-white shadow-[0_14px_30px_-18px_rgba(163,22,33,0.95)] transition-[background-color,transform] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-35 motion-reduce:active:scale-100"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Clapperboard size={14} />}
            {busy ? 'Submitting' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  )
}

function RecentStrip({
  items,
  loading,
  onOpen,
}: {
  items: GalleryItem[]
  loading: boolean
  onOpen: (item: GalleryItem) => void
}) {
  return (
    <section aria-label="Recent videos" className="mt-1">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-ink text-[13.5px] font-semibold">Recent videos</h2>
          <p className="text-ink/40 text-[11px]">Finished shots from this library.</p>
        </div>
        <span className="text-ink/30 text-[10px] tabular-nums">{items.length}</span>
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {loading
          ? Array.from({ length: 6 }, (_value, index) => (
              <Skeleton key={index} className="h-[132px] w-[99px] shrink-0 rounded-xl" />
            ))
          : items.map((item) => (
              <motion.button
                key={item.id}
                type="button"
                onClick={() => onOpen(item)}
                variants={motionFade}
                initial="hidden"
                animate="visible"
                className="group border-line bg-ink/[0.04] hover:border-accent/35 relative h-[132px] w-[99px] shrink-0 overflow-hidden rounded-xl border transition-[border-color,transform] active:scale-[0.98]"
              >
                <video
                  src={item.url}
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  className="size-full object-cover"
                />
                <span className="bg-ink/65 text-canvas absolute inset-x-0 bottom-0 flex items-center gap-1 truncate px-1.5 py-1 text-[8.5px] font-medium backdrop-blur">
                  <Play size={8} fill="currentColor" />
                  {item.duration ? `${Math.round(item.duration)}s` : 'Video'}
                </span>
              </motion.button>
            ))}
        {!loading && items.length === 0 ? (
          <p className="text-ink/35 py-10 text-[11.5px]">No videos yet. Your first shot lands here.</p>
        ) : null}
      </div>
    </section>
  )
}

function capacityFor(models: VideoModelDefinition[], mode: VideoModeKey): number {
  return Math.max(0, ...models.map((model) => model.videoModes[mode]?.maxImages ?? 0))
}

function modeLabel(mode: VideoModeKey): string {
  if (mode === 'text') return 'Text to video'
  if (mode === 'image') return 'Start frame'
  if (mode === 'frames') return 'Start + end'
  return 'References'
}
