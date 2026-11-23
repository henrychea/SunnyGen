import {
  DEFAULT_IMAGE_LIMITS,
  VIDEO_MODE_LABELS,
  getModel,
  videoModeCapability,
  videoModeDefinition,
  type VideoModeKey,
  type VideoModelDefinition,
} from '@sunnygen/core'
import { useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  FadeImage,
  Selector,
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
  ArrowUp,
  ChevronUp,
  ImagePlus,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  Replace,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { AspectRatioSelector } from '~/components/generation-selectors'
import { ReferencePicker } from '~/components/home/reference-picker'
import { ModelCombobox } from '~/components/model-combobox'
import { ResizeImagesDialog } from '~/components/resize-images-dialog'
import { usePromptBridge } from '~/lib/assistant-context'
import { flattenReferenceAssets, referenceIdentity, withIdentityClause } from '~/lib/avatar-references'
import { sortModelChoices } from '~/lib/model-choices'
import { describeEditReferenceTrim, describeReferenceTrim } from '~/lib/model-params'
import { oversizedReferences, referenceIsOversized, shouldConfirmResize } from '~/lib/oversized-images'
import {
  appendReferences,
  referenceImageCount,
  trimReferences,
  type ReferenceItem,
} from '~/lib/reference-images'
import { thumbSrcSet, thumbUrl } from '~/lib/media-thumbs'
import { useModelChoices } from '~/lib/use-model-choices'
import { videoEditJobs } from '~/lib/video-edit'
import {
  availableVideoModes,
  defaultVideoParams,
  reconcileVideoParams,
  videoDefinitions,
  videoEditOnly,
  videoModeSlots,
  videoModesFor,
  type VideoParams,
} from '~/lib/video-flow'
import { submitGeneration } from '~/server/generation.functions'
import { createFolderFn } from '~/server/library.functions'

const PROMPT_LIMIT = 20_000
const MAX_EDIT_TARGETS = 6
const SKIP_RESIZE_KEY = 'sunnygen.resize-large-images.skip'

type ComposerMode = 'generate' | 'edit'
type PickerTarget = 'references' | 'editTargets' | 'editReferences'

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

function batchFolderName(): string {
  return `Batch · ${new Date().toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })}`
}

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
  const named = mode === 'image' ? ['Start'] : mode === 'frames' ? ['Start', 'End'] : []
  return Array.from({ length: slots }, (_value, index) => named[index] ?? `Ref ${index + 1}`)
}

export function VideoComposer({
  onPickerOpenChange,
}: {
  onPickerOpenChange?: (open: boolean) => void
} = {}) {
  const queryClient = useQueryClient()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { choices, catalogOnly } = useModelChoices()
  const [mode, setMode] = useState<ComposerMode>('generate')
  const [prompt, setPrompt] = useState('')
  const [modelId, setModelId] = useState('')
  const [params, setParams] = useState<VideoParams>(() =>
    defaultVideoParams(getModel('veo3_lite') as VideoModelDefinition, 'text'),
  )
  const [references, setReferences] = useState<ReferenceItem[]>([])
  const [editTargets, setEditTargets] = useState<ReferenceItem[]>([])
  const [editReferences, setEditReferences] = useState<ReferenceItem[]>([])
  const [picker, setPicker] = useState<PickerTarget | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [resizePrompt, setResizePrompt] = useState<ReferenceItem[] | null>(null)
  const [skipResizePrompt, setSkipResizePrompt] = useState(readSkipResize)
  const resizeBypass = useRef(false)

  usePromptBridge('video', 'Video prompt', prompt, setPrompt, expanded)

  useEffect(() => {
    onPickerOpenChange?.(picker !== null)
  }, [onPickerOpenChange, picker])

  useEffect(() => {
    if (expanded) return
    const element = textareaRef.current
    if (!element) return
    const previous = element.style.height
    element.style.transition = 'none'
    element.style.height = '0px'
    const content = element.scrollHeight
    const next = Math.min(content, 180)
    element.style.height = previous
    void element.offsetHeight
    element.style.transition = ''
    element.style.height = `${next}px`
    element.style.overflowY = content > 180 ? 'auto' : 'hidden'
  }, [prompt, expanded, mode])

  useEffect(() => {
    if (!expanded || picker) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded, picker])

  const allChoices = sortModelChoices(choices, catalogOnly)
  const videoChoices = allChoices.filter((entry) => entry.definition?.kind === 'video' && !entry.disabled)
  const allModels = videoDefinitions(videoChoices)
  const modelsForMode = (next: ComposerMode) =>
    next === 'edit' ? videoModesFor(allModels, 'edit') : allModels.filter((model) => !videoEditOnly(model))
  const models = modelsForMode(mode)
  const modelOptions = videoChoices.filter((entry) => models.some((model) => model.id === entry.modelId))
  const activeModel = models.find((model) => model.id === modelId) ?? models[0] ?? null
  const preferredMode: VideoModeKey =
    mode === 'edit' ? 'edit' : params.videoMode === 'edit' ? 'text' : params.videoMode
  const resolved = activeModel ? reconcileVideoParams(params, activeModel, preferredMode) : null
  const videoMode = resolved?.mode ?? preferredMode
  const videoParams = resolved?.params ?? params
  const limits = activeModel ? videoModeDefinition(activeModel, videoMode) : null
  const flowModes = availableVideoModes(modelsForMode('generate')).filter((mode) => mode !== 'edit')
  const editReferenceMax = activeModel ? (videoModeCapability(activeModel, 'edit')?.maxImages ?? 0) : 0
  const generateSlots = videoModeSlots(modelsForMode('generate'), videoMode)
  const generateRemaining = Math.max(0, generateSlots - referenceImageCount(references))
  const editReferenceRemaining = Math.max(0, editReferenceMax - referenceImageCount(editReferences))
  const targetRemaining = Math.max(0, MAX_EDIT_TARGETS - editTargets.length)

  const applyModel = (model: VideoModelDefinition, nextMode: VideoModeKey) => {
    const result = reconcileVideoParams(params, model, nextMode)
    setModelId(model.id)
    setParams(result.params)
    for (const change of result.changes) toast(change.message, { tone: 'warning' })
    const capacity = model.videoModes[result.mode]?.maxImages ?? 0
    if (result.mode === 'edit') {
      const kept = trimReferences(editReferences, capacity)
      const removed = referenceImageCount(editReferences) - referenceImageCount(kept)
      if (removed > 0) {
        setEditReferences(kept)
        toast(describeEditReferenceTrim(model.label, capacity, removed), { tone: 'warning' })
      }
      return
    }
    const kept = trimReferences(references, capacity)
    const removed = referenceImageCount(references) - referenceImageCount(kept)
    if (removed > 0) {
      setReferences(kept)
      toast(describeReferenceTrim(model.label, capacity, removed), { tone: 'warning' })
    }
  }

  const chooseModel = (id: string) => {
    const model = modelOptions.find((entry) => entry.modelId === id)?.definition
    if (!model || model.kind !== 'video') return
    applyModel(model, videoMode)
  }

  const chooseFlowMode = (next: VideoModeKey) => {
    const keep = activeModel?.videoModes[next] ? activeModel : videoModesFor(models, next)[0]
    if (keep) applyModel(keep, next)
    setError(null)
    setNotice(null)
  }

  const changeMode = (next: ComposerMode) => {
    if (next === mode) return
    setMode(next)
    setError(null)
    setNotice(null)
    const pool = modelsForMode(next)
    const keep = pool.find((model) => model.id === activeModel?.id) ?? pool[0]
    if (!keep) return
    const nextMode: VideoModeKey = next === 'edit' ? 'edit' : videoMode === 'edit' ? 'text' : videoMode
    applyModel(keep, nextMode)
  }

  const generate = async () => {
    if (busy || !activeModel) return
    if (prompt.length > PROMPT_LIMIT) {
      setError(`Keep the prompt under ${PROMPT_LIMIT.toLocaleString()} characters.`)
      return
    }
    const edit =
      mode === 'edit'
        ? videoEditJobs({ targets: editTargets, references: editReferences, prompt, model: activeModel })
        : null
    if (edit?.error) {
      setError(edit.error)
      return
    }
    if (mode === 'generate') {
      if (prompt.trim().length === 0) {
        setError('Describe the shot first.')
        return
      }
      if (videoMode !== 'text' && referenceImageCount(references) === 0) {
        setError('Add the image the shot should start from.')
        return
      }
      if (videoMode === 'frames' && referenceImageCount(references) < 2) {
        setError('Add both the start and end frame.')
        return
      }
    }

    const attached = mode === 'edit' ? editReferences : references
    const bypass = resizeBypass.current
    resizeBypass.current = false
    if (!bypass && shouldConfirmResize(attached, { suppressed: skipResizePrompt })) {
      setResizePrompt(oversizedReferences(attached))
      return
    }

    const capability = videoModeCapability(activeModel, videoMode)
    let jobs: Array<{ prompt: string; assetIds: string[] }>
    if (mode === 'edit') {
      jobs = edit?.jobs ?? []
    } else {
      const assetIds = flattenReferenceAssets(references, activeModel.id)
      const maxImages = capability?.maxImages ?? 0
      if (assetIds.length > maxImages) {
        toast(
          `${activeModel.label} takes ${maxImages} image${maxImages === 1 ? '' : 's'}; the extra references were dropped.`,
          { tone: 'warning' },
        )
      }
      jobs = [
        {
          prompt: withIdentityClause(prompt.trim(), referenceIdentity(references), activeModel.id),
          assetIds: assetIds.slice(0, maxImages),
        },
      ]
    }

    setBusy(true)
    setError(null)
    setNotice(null)
    const ids: string[] = []
    const failures: string[] = []
    let batchFolderId: string | null = null
    try {
      if (jobs.length > 1) {
        try {
          const folder = await createFolderFn({ data: { name: batchFolderName() } })
          batchFolderId = folder.id
        } catch {
          // Grouping is optional; never block the generation.
        }
      }
      for (const job of jobs) {
        const view = await submitGeneration({
          data: {
            kind: 'video',
            model: activeModel.id,
            prompt: job.prompt,
            assetIds: job.assetIds,
            folderId: batchFolderId,
            params: {
              videoMode,
              durationSeconds: videoParams.duration,
              resolution: videoParams.resolution,
              aspectRatio: videoParams.aspectRatio,
              sound: videoParams.sound,
            },
          },
        })
        if (view.generation.status === 'failed') {
          failures.push(view.generation.error ?? 'Generation failed')
        } else {
          ids.push(view.generation.id)
        }
      }
      if (ids.length > 0) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['video-wall'] }),
          queryClient.invalidateQueries({ queryKey: ['home-generations'] }),
          queryClient.invalidateQueries({ queryKey: ['gallery'] }),
          queryClient.invalidateQueries({ queryKey: ['folders'] }),
        ])
        setNotice(
          `Queued ${ids.length} ${ids.length === 1 ? 'render' : 'renders'} — the wall updates as each finishes.`,
        )
      }
      if (failures.length > 0) setError(failures[0] ?? 'Generation failed')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Generation failed')
    } finally {
      setBusy(false)
    }
  }

  const addTargets = (items: ReferenceItem[]) => {
    setEditTargets((current) => appendReferences(current, items, MAX_EDIT_TARGETS))
  }

  const pickerConfig = (() => {
    if (picker === 'editTargets') {
      return {
        title: 'Add target videos',
        kind: 'video' as const,
        allowAvatars: false,
        existingIds: editTargets.map((item) => item.id),
        max: targetRemaining,
        onConfirm: addTargets,
      }
    }
    if (picker === 'editReferences') {
      return {
        title: 'Add reference images',
        kind: 'image' as const,
        allowAvatars: true,
        existingIds: editReferences.flatMap((item) => item.assetIds ?? [item.id]),
        max: editReferenceRemaining,
        onConfirm: (items: ReferenceItem[]) =>
          setEditReferences((current) => appendReferences(current, items, editReferenceMax)),
      }
    }
    return {
      title: 'Add reference images',
      kind: 'image' as const,
      allowAvatars: true,
      existingIds: references.flatMap((item) => item.assetIds ?? [item.id]),
      max: generateRemaining,
      onConfirm: (items: ReferenceItem[]) =>
        setReferences((current) => appendReferences(current, items, generateSlots)),
    }
  })()

  const hasContent =
    prompt.length > 0 || references.length > 0 || editTargets.length > 0 || editReferences.length > 0
  const overLimit = prompt.length > PROMPT_LIMIT
  const promptReady =
    mode === 'edit'
      ? editTargets.length > 0 && (prompt.trim().length > 0 || editReferences.length > 0)
      : prompt.trim().length > 0
  const disabled = busy || !activeModel || !promptReady || overLimit

  if (minimized) {
    return (
      <div
        data-assistant-clearance=""
        className="pointer-events-none fixed bottom-4 left-1/2 z-50 -translate-x-1/2 px-3"
      >
        <motion.button
          type="button"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={motionSpring}
          onClick={() => setMinimized(false)}
          aria-label="Open prompt"
          className={cn(
            'border-line bg-surface md:bg-surface/92 text-ink/65 hover:border-ink/25 hover:text-ink pointer-events-auto flex items-center gap-2 rounded-full border px-4 py-2.5 text-[12px] font-medium shadow-[0_18px_50px_-24px_rgba(42,30,23,0.55)] transition-[color,border-color,transform] md:backdrop-blur-xl',
            motionPress,
          )}
        >
          <Sparkles size={13} className="text-accent/80" />
          Prompt
          <span className="text-ink/65 hidden max-w-32 truncate text-[10.5px] sm:block">
            {activeModel?.label ?? 'Video'}
          </span>
          <ChevronUp size={13} className="text-ink/65" />
        </motion.button>
      </div>
    )
  }

  return (
    <>
      <AnimatePresence>
        {expanded ? (
          <motion.button
            key="composer-backdrop"
            type="button"
            aria-label="Minimize prompt"
            onClick={() => setExpanded(false)}
            variants={motionFade}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="bg-ink/25 fixed inset-0 z-40 md:backdrop-blur-[2px]"
          />
        ) : null}
      </AnimatePresence>
      <div
        className={cn(
          'pointer-events-none fixed z-50 px-3',
          expanded
            ? 'inset-0 flex items-center justify-center p-3 md:right-6 md:left-[236px] md:py-6'
            : 'right-3 bottom-3 left-3 md:right-0 md:bottom-5 md:left-[228px] md:px-3',
        )}
      >
        <motion.div
          layout={!picker}
          transition={motionSpring}
          data-assistant-clearance=""
          className={cn(
            'border-line bg-surface md:bg-surface/92 pointer-events-auto relative mx-auto flex w-full flex-col overflow-hidden border shadow-[0_28px_80px_-30px_rgba(42,30,23,0.55)] transition-[border-radius,border-color] focus-within:border-accent/25 md:backdrop-blur-xl',
            expanded ? 'h-full max-h-[840px] max-w-[1000px] rounded-[26px]' : 'max-w-[860px] rounded-[22px]',
          )}
        >
          <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1">
            <AnimatePresence initial={false} mode="popLayout">
              {hasContent ? (
                <motion.button
                  key="clear"
                  type="button"
                  variants={motionPop}
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                  onClick={() => {
                    setPrompt('')
                    setReferences([])
                    setEditTargets([])
                    setEditReferences([])
                    setError(null)
                    setNotice(null)
                  }}
                  aria-label="Clear prompt"
                  className="text-ink/65 hover:bg-ink/[0.06] hover:text-ink grid size-7 place-items-center rounded-lg transition-[color,background-color,transform] active:scale-90"
                >
                  <X size={13} />
                </motion.button>
              ) : null}
            </AnimatePresence>
            {!expanded ? (
              <motion.button
                layout="position"
                type="button"
                onClick={() => {
                  setExpanded(false)
                  setPicker(null)
                  setMinimized(true)
                }}
                aria-label="Minimize prompt"
                title="Minimize"
                className="text-ink/65 hover:bg-ink/[0.06] hover:text-ink grid size-7 place-items-center rounded-lg transition-[color,background-color,transform] active:scale-90"
              >
                <Minus size={13} />
              </motion.button>
            ) : null}
            <motion.button
              layout="position"
              type="button"
              onClick={() => setExpanded((value) => !value)}
              aria-label={expanded ? 'Minimize prompt' : 'Expand prompt'}
              title={expanded ? 'Minimize' : 'Expand'}
              className="text-ink/65 hover:bg-ink/[0.06] hover:text-ink relative grid size-7 place-items-center rounded-lg transition-[color,background-color,transform] active:scale-90"
            >
              <AnimatePresence initial={false} mode="popLayout">
                <motion.span
                  key={expanded ? 'collapse' : 'expand'}
                  variants={motionPop}
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                  transition={motionFast}
                  className="grid place-items-center"
                >
                  {expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                </motion.span>
              </AnimatePresence>
            </motion.button>
          </div>

          <div className="flex items-center gap-1 px-3 pt-2.5 pr-24">
            <button
              type="button"
              onClick={() => changeMode('generate')}
              aria-pressed={mode === 'generate'}
              className={cn(
                'relative flex h-8 items-center gap-1.5 rounded-lg px-3 text-[11.5px] font-medium transition-[color,background-color,transform]',
                motionPress,
                mode === 'generate' ? 'text-canvas' : 'text-ink/65 hover:bg-ink/[0.05] hover:text-ink',
              )}
            >
              {mode === 'generate' ? (
                <motion.span
                  layoutId="video-composer-mode"
                  transition={motionSpring}
                  className="bg-ink absolute inset-0 rounded-lg"
                />
              ) : null}
              <span className="relative flex items-center gap-1.5">
                <Sparkles size={12} />
                Generate
              </span>
            </button>
            <button
              type="button"
              onClick={() => changeMode('edit')}
              aria-pressed={mode === 'edit'}
              className={cn(
                'relative flex h-8 items-center gap-1.5 rounded-lg px-3 text-[11.5px] font-medium transition-[color,background-color,transform]',
                motionPress,
                mode === 'edit' ? 'text-canvas' : 'text-ink/65 hover:bg-ink/[0.05] hover:text-ink',
              )}
            >
              {mode === 'edit' ? (
                <motion.span
                  layoutId="video-composer-mode"
                  transition={motionSpring}
                  className="bg-ink absolute inset-0 rounded-lg"
                />
              ) : null}
              <span className="relative flex items-center gap-1.5">
                <Replace size={12} />
                Edit
              </span>
            </button>
          </div>

          {mode === 'generate' && flowModes.length > 1 ? (
            <div className="flex flex-wrap items-center gap-1 px-3 pt-1.5">
              {flowModes.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  aria-pressed={videoMode === entry}
                  onClick={() => chooseFlowMode(entry)}
                  disabled={busy}
                  className={cn(
                    'flex h-6 items-center rounded-md border px-2 text-[10px] font-medium transition-[color,background-color,border-color,transform]',
                    motionPress,
                    videoMode === entry
                      ? 'border-accent/30 bg-accent/10 text-accent'
                      : 'border-line bg-canvas/55 text-ink/65 hover:text-ink',
                  )}
                >
                  {VIDEO_MODE_LABELS[entry]}
                </button>
              ))}
            </div>
          ) : null}

          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={mode}
              variants={motionSwap}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={motionFast}
              className="w-full shrink-0"
            >
              {mode === 'generate' && generateSlots > 0 && videoMode !== 'text' ? (
                <SelectionBox
                  label="References"
                  tileLabel="IMAGE"
                  items={references}
                  max={generateSlots}
                  labels={slotLabels(videoMode, generateSlots)}
                  busy={busy}
                  onAdd={() => setPicker('references')}
                  onRemove={(id) => setReferences((current) => current.filter((entry) => entry.id !== id))}
                />
              ) : null}

              {mode === 'edit' ? (
                <>
                  <SelectionBox
                    label="Targets"
                    tileLabel="TARGET"
                    items={editTargets}
                    max={MAX_EDIT_TARGETS}
                    busy={busy}
                    onAdd={() => setPicker('editTargets')}
                    onRemove={(id) => setEditTargets((current) => current.filter((entry) => entry.id !== id))}
                  />
                  <SelectionBox
                    label="References"
                    tileLabel="REF"
                    items={editReferences}
                    max={editReferenceMax}
                    busy={busy}
                    onAdd={() => setPicker('editReferences')}
                    onRemove={(id) =>
                      setEditReferences((current) => current.filter((entry) => entry.id !== id))
                    }
                  />
                  <p className="text-ink/65 px-3 pt-1 text-[9px] leading-snug">
                    Each target video becomes its own edit. Avatars use their clean sheet and 4x4 panel for
                    face and body.
                  </p>
                </>
              ) : null}
            </motion.div>
          </AnimatePresence>

          <div className={cn('flex min-h-0 flex-col px-3 pt-2', expanded ? 'flex-1 pb-2' : '')}>
            <label
              htmlFor="video-prompt"
              className="text-ink/65 text-[9px] font-semibold tracking-[0.1em] uppercase"
            >
              Prompt
            </label>
            <textarea
              id="video-prompt"
              ref={textareaRef}
              value={prompt}
              onChange={(event) => {
                setPrompt(event.target.value)
                setNotice(null)
                setError(null)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault()
                  void generate()
                }
              }}
              rows={1}
              placeholder={
                mode === 'edit'
                  ? editTargets.length === 0
                    ? 'Add a target video, then describe the change…'
                    : 'Describe the change, or leave blank to use the references…'
                  : 'Describe the shot you imagine…'
              }
              disabled={busy}
              className={cn(
                'text-ink placeholder:text-ink/65 w-full resize-none bg-transparent text-[14.5px] leading-[22px] tracking-[-0.01em] outline-none transition-[height] duration-150 ease-out disabled:opacity-60 motion-reduce:transition-none',
                expanded ? 'min-h-0 flex-1' : 'max-h-[180px]',
              )}
              style={expanded ? undefined : { height: 22 }}
            />
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {error || notice ? (
              <motion.p
                key={error ?? notice}
                variants={motionFadeRise}
                initial="hidden"
                animate="visible"
                exit="hidden"
                className={cn('px-3 pt-1.5 text-[10.5px]', error ? 'text-error' : 'text-ink/65')}
              >
                {error ?? notice}
              </motion.p>
            ) : null}
          </AnimatePresence>

          <div className="border-line/60 mt-2 flex flex-wrap items-center gap-1.5 border-t px-3 pt-2.5 pb-2.5">
            <ModelCombobox
              className="w-[240px] md:w-[270px]"
              size="sm"
              value={activeModel?.id ?? null}
              options={modelOptions}
              disabled={busy}
              onChange={(entry) => {
                if (entry.modelId) chooseModel(entry.modelId)
              }}
            />

            {limits ? (
              <>
                {limits.ratios.length > 0 ? (
                  <AspectRatioSelector
                    className="w-[104px] shrink-0"
                    value={videoParams.aspectRatio}
                    ratios={limits.ratios}
                    disabled={busy}
                    onChange={(ratio) => setParams((current) => ({ ...current, aspectRatio: ratio }))}
                  />
                ) : null}
                {limits.durations.length > 0 ? (
                  <Selector
                    className="w-[78px] shrink-0"
                    size="sm"
                    value={String(videoParams.duration)}
                    disabled={busy}
                    ariaLabel="Duration"
                    options={limits.durations.map((option) => ({
                      key: String(option),
                      label: `${option}s`,
                      description: 'Duration',
                    }))}
                    showTriggerDescription={false}
                    menuMinWidth={160}
                    onChange={(option) =>
                      setParams((current) => ({ ...current, duration: Number(option.key) }))
                    }
                  />
                ) : null}
                {limits.resolutions.length > 0 ? (
                  <Selector
                    className="w-[94px] shrink-0"
                    size="sm"
                    value={videoParams.resolution}
                    disabled={busy}
                    ariaLabel="Resolution"
                    options={limits.resolutions.map((option) => ({
                      key: option,
                      label: option.toUpperCase(),
                      description: resolutionName(option),
                    }))}
                    showTriggerDescription={false}
                    menuMinWidth={180}
                    onChange={(option) => setParams((current) => ({ ...current, resolution: option.key }))}
                  />
                ) : null}
                {limits.sound ? (
                  <button
                    type="button"
                    aria-pressed={videoParams.sound}
                    onClick={() => setParams((current) => ({ ...current, sound: !current.sound }))}
                    disabled={busy}
                    className={cn(
                      'flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11.5px] font-medium transition-[color,background-color,border-color,transform]',
                      motionPress,
                      videoParams.sound
                        ? 'border-accent/30 bg-accent/10 text-accent'
                        : 'border-line bg-canvas/55 text-ink/65 hover:text-ink',
                    )}
                  >
                    {videoParams.sound ? <Volume2 size={13} /> : <VolumeX size={13} />}
                    Audio
                  </button>
                ) : null}
              </>
            ) : (
              <span className="text-ink/65 text-[10.5px]">No video model documents this mode.</span>
            )}

            <div className="ml-auto flex items-center gap-2">
              <span
                className={cn(
                  'text-[10px] tabular-nums transition-colors duration-300',
                  overLimit ? 'text-error' : 'text-ink/65',
                )}
              >
                {prompt.length.toLocaleString()}/{PROMPT_LIMIT.toLocaleString()}
              </span>
              <button
                type="button"
                onClick={() => void generate()}
                disabled={disabled}
                aria-label={mode === 'edit' ? 'Apply edit' : 'Generate'}
                title={busy ? 'Submitting' : mode === 'edit' ? 'Apply edit' : 'Generate'}
                className="bg-accent hover:bg-accent/90 relative grid size-9 place-items-center rounded-full text-white shadow-[0_8px_20px_-10px_rgba(163,22,33,0.7)] transition-[background-color,transform] duration-150 hover:scale-[1.03] active:scale-95 disabled:pointer-events-none disabled:opacity-35 motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
              >
                <AnimatePresence initial={false} mode="popLayout">
                  <motion.span
                    key={busy ? 'busy' : 'idle'}
                    variants={motionPop}
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    transition={motionFast}
                    className="grid place-items-center"
                  >
                    {busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowUp size={16} />}
                  </motion.span>
                </AnimatePresence>
              </button>
            </div>
          </div>
        </motion.div>
      </div>

      <AnimatePresence>
        {picker ? (
          <ReferencePicker
            title={pickerConfig.title}
            kind={pickerConfig.kind}
            allowAvatars={pickerConfig.allowAvatars}
            existingIds={pickerConfig.existingIds}
            max={pickerConfig.max}
            onClose={() => setPicker(null)}
            onConfirm={pickerConfig.onConfirm}
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
          if (dontAskAgain) setSkipResizePrompt(rememberSkipResize())
          setResizePrompt(null)
          resizeBypass.current = true
          void generate()
        }}
      />
    </>
  )
}

function SelectionBox({
  label,
  tileLabel,
  items,
  max,
  labels,
  busy,
  onAdd,
  onRemove,
}: {
  label: string
  tileLabel: string
  items: ReferenceItem[]
  max: number
  labels?: string[]
  busy: boolean
  onAdd: () => void
  onRemove: (id: string) => void
}) {
  const empty = labels ? labels.slice(items.length) : []
  const slots = labels ? labels.length : max
  const canAdd = labels ? empty.length > 0 : items.length < max

  return (
    <div className="px-3 pt-2">
      <div className="flex items-center justify-between">
        <span className="text-ink/65 text-[9px] font-semibold tracking-[0.1em] uppercase">{label}</span>
        <span className="text-ink/65 text-[9px] tabular-nums">
          {items.length}/{Number.isFinite(slots) ? slots : max}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-start gap-1.5">
        <AnimatePresence initial={false} mode="popLayout">
          {items.map((item, index) => (
            <motion.div
              key={item.id}
              layout
              variants={motionPop}
              initial="hidden"
              animate="visible"
              exit="hidden"
              transition={motionFast}
              className="border-line group relative overflow-hidden rounded-lg border"
            >
              {item.kind === 'video' ? (
                <video src={item.url} muted preload="metadata" playsInline className="size-12 object-cover" />
              ) : (
                <FadeImage
                  src={thumbUrl(item.url, 160)}
                  srcSet={thumbSrcSet(item.url, [160, 320])}
                  sizes="48px"
                  alt=""
                  decoding="async"
                  className="size-12 object-cover"
                />
              )}
              {labels?.[index] ? (
                <span className="bg-ink/65 text-canvas absolute inset-x-0 bottom-0 truncate px-1 py-px text-[7px] font-semibold tracking-[0.04em] uppercase backdrop-blur">
                  {labels[index]}
                </span>
              ) : item.lora ? (
                <span className="bg-accent text-canvas absolute bottom-0 left-0 rounded-tr px-1 py-px text-[7px] font-semibold tracking-[0.04em] uppercase">
                  LoRA
                </span>
              ) : null}
              {item.kind !== 'video' && referenceIsOversized(item) ? (
                <Badge
                  tone="warning"
                  title="Larger than providers accept; will be resized"
                  aria-label="Larger than providers accept; will be resized"
                  className="absolute top-0.5 left-0.5 px-1 py-px text-[7px]"
                >
                  Large
                </Badge>
              ) : null}
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                aria-label={`Remove ${item.name}`}
                className="bg-ink/75 text-canvas absolute top-0.5 right-0.5 grid size-4 place-items-center rounded opacity-100 transition-[opacity,transform] hover:scale-110 active:scale-95 md:opacity-0 md:group-hover:opacity-100"
              >
                <X size={9} />
              </button>
            </motion.div>
          ))}
          {empty.map((slotLabel) => (
            <AddTile key={`slot-${slotLabel}`} label={slotLabel} note={label} busy={busy} onAdd={onAdd} />
          ))}
          {!labels && canAdd ? (
            <AddTile
              key="add"
              label={tileLabel}
              note={`${max - items.length} left`}
              busy={busy}
              onAdd={onAdd}
            />
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  )
}

function AddTile({
  label,
  note,
  busy,
  onAdd,
}: {
  label: string
  note: string
  busy: boolean
  onAdd: () => void
}) {
  return (
    <motion.button
      type="button"
      onClick={onAdd}
      disabled={busy}
      aria-label={`Add ${label.toLowerCase()}`}
      title={note}
      variants={motionPop}
      initial="hidden"
      animate="visible"
      exit="hidden"
      transition={motionFast}
      className="border-line bg-canvas/50 text-ink/65 hover:border-accent/35 hover:text-accent flex size-12 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed px-0.5 text-center transition-[color,border-color,transform] active:scale-95 disabled:opacity-40"
    >
      <ImagePlus size={13} />
      <span className="text-[7px] leading-tight font-semibold tracking-[0.03em] uppercase">{label}</span>
    </motion.button>
  )
}
