import {
  IMAGE_MODELS,
  LORA_MODEL_ID,
  LORA_SCALE_DEFAULT,
  LORA_SCALE_MAX,
  LORA_SCALE_MIN,
  DEFAULT_IMAGE_LIMITS,
  VIDEO_MODELS,
  editProfile,
  type ModelDefinition,
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
  X,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { submitGeneration } from '~/server/generation.functions'
import { createFolderFn } from '~/server/library.functions'
import { ModelCombobox } from '~/components/model-combobox'
import { AspectRatioSelector, QualitySelector } from '~/components/generation-selectors'
import { sortModelChoices } from '~/lib/model-choices'
import { buildEditPromptResult, orderEditAssets } from '~/lib/edit-prompt'
import {
  editReferencePlan as editReferencePlanFor,
  flattenReferenceAssets,
  referenceIdentity,
  withIdentityClause,
} from '~/lib/avatar-references'
import { editModeSwitch } from '~/lib/edit-mode'
import {
  MAX_IMAGE_RESULTS,
  defaultAspectRatio,
  defaultQuality,
  describeEditReferenceTrim,
  describeReferenceTrim,
  reconcileParams,
  type ComposerParams,
} from '~/lib/model-params'
import { thumbSrcSet, thumbUrl } from '~/lib/media-thumbs'
import {
  appendReferences,
  referenceImageCount,
  trimReferences,
  type ReferenceItem,
} from '~/lib/reference-images'
import type { ReferenceAvatar } from '~/lib/reference-avatar'
import { useModelChoices } from '~/lib/use-model-choices'
import { usePromptBridge } from '~/lib/assistant-context'
import { takeEditHandoff } from '~/lib/edit-handoff'
import { oversizedReferences, referenceIsOversized, shouldConfirmResize } from '~/lib/oversized-images'
import { ResizeImagesDialog } from '~/components/resize-images-dialog'
import { ReferencePicker } from './reference-picker'

const PROMPT_LIMIT = 20_000
export const MAX_BATCH = 8
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

const ALL_MODELS = [...IMAGE_MODELS, ...VIDEO_MODELS]

type ComposerMode = 'generate' | 'edit'
type PickerTarget = 'references' | 'editTargets' | 'editReferences'

function modelFor(id: string): ModelDefinition {
  return ALL_MODELS.find((entry) => entry.id === id) ?? (IMAGE_MODELS[0] as ModelDefinition)
}

function resolutionName(value: string): string {
  const names: Record<string, string> = {
    '480p': 'SD',
    '720p': 'HD',
    '1080p': 'Full HD',
    '4k': '4K UHD',
  }
  return names[value] ?? 'Resolution'
}

export function HomeComposer({
  initialAvatar,
  onPickerOpenChange,
}: {
  initialAvatar?: ReferenceAvatar | null
  onPickerOpenChange?: (open: boolean) => void
} = {}) {
  const queryClient = useQueryClient()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const startModelId = initialAvatar?.lora ? LORA_MODEL_ID : 'gpt-image-2'
  const [loraStrength, setLoraStrength] = useState(LORA_SCALE_DEFAULT)
  const [handoff] = useState<ReferenceItem[]>(() => takeEditHandoff())
  const [mode, setMode] = useState<ComposerMode>(handoff.length > 0 ? 'edit' : 'generate')
  const [prompt, setPrompt] = useState('')
  const [modelId, setModelId] = useState(startModelId)
  const [ratio, setRatio] = useState(() => defaultAspectRatio(modelFor(startModelId)))
  const [quality, setQuality] = useState(() => defaultQuality(modelFor(startModelId)))
  const [duration, setDuration] = useState(8)
  const [resolution, setResolution] = useState('')
  const [count, setCount] = useState(1)
  const [multi, setMulti] = useState(false)
  const [references, setReferences] = useState<ReferenceItem[]>(() =>
    initialAvatar
      ? [
          {
            id: initialAvatar.id,
            name: initialAvatar.name,
            url: initialAvatar.url,
            assetIds: initialAvatar.assetIds,
            avatar: true,
            avatarId: initialAvatar.avatarId,
            lora: initialAvatar.lora,
            byteSize: initialAvatar.byteSize,
            width: initialAvatar.width,
            height: initialAvatar.height,
          },
        ]
      : [],
  )
  const [editTargets, setEditTargets] = useState<ReferenceItem[]>(handoff)
  const [editReferences, setEditReferences] = useState<ReferenceItem[]>([])
  const [picker, setPicker] = useState<PickerTarget | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [busy, setBusy] = useState(false)
  const [resizePrompt, setResizePrompt] = useState<ReferenceItem[] | null>(null)
  const [skipResizePrompt, setSkipResizePrompt] = useState(readSkipResize)
  const resizeBypass = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [typing, setTyping] = useState(false)
  const [loadingChips, setLoadingChips] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    onPickerOpenChange?.(picker !== null)
  }, [onPickerOpenChange, picker])

  const handleChipLoadChange = useCallback((id: string, loaded: boolean) => {
    setLoadingChips((current) => {
      if (loaded) {
        if (!current.has(id)) return current
        const next = new Set(current)
        next.delete(id)
        return next
      }
      if (current.has(id)) return current
      const next = new Set(current)
      next.add(id)
      return next
    })
  }, [])

  const isEdit = mode === 'edit'
  const { choices, catalogOnly } = useModelChoices()
  const allChoices = sortModelChoices(choices, catalogOnly)
  const selectedChoice = allChoices.find((entry) => entry.modelId === modelId)
  const model = selectedChoice?.definition ?? modelFor(modelId)
  const isVideo = model.kind === 'video'
  usePromptBridge('home', isVideo ? 'Video prompt' : 'Image prompt', prompt, setPrompt, expanded)
  const editChoices = allChoices.filter(
    (entry) => entry.kind === 'image' && entry.definition?.supportsImages === true,
  )
  const modelOptions = isEdit ? editChoices : allChoices.filter((entry) => !entry.editOnly)
  const canAddReferences = model.supportsImages || Boolean(model.supportsLora)
  const referenceMax = isEdit
    ? Math.max(0, model.maxImages - 1)
    : model.supportsImages
      ? model.maxImages
      : model.supportsLora
        ? 1
        : 0
  const referenceSlots = canAddReferences ? Math.max(0, referenceMax - referenceImageCount(references)) : 0
  const editReferenceSlots = Math.max(0, referenceMax - referenceImageCount(editReferences))
  const loraReference = mode === 'generate' ? references.find((item) => item.lora) : undefined
  const loraSupported = Boolean(model.supportsLora)
  const loraModelChoice = allChoices.find((entry) => entry.definition?.supportsLora && entry.modelId)

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

  const chooseModel = (id: string) => {
    const option = allChoices.find((entry) => entry.modelId === id)
    const next = option?.definition ?? modelFor(id)
    const canEdit = next.kind === 'image' && next.supportsImages
    if (mode === 'edit' && !canEdit) {
      setMode('generate')
      setNotice(`${next.label} does not edit images. Switched to generate mode.`)
    } else if (mode === 'generate' && next.supportsText === false && canEdit) {
      setMode('edit')
      setNotice(`${next.label} needs a reference image. Switched to edit mode.`)
    }
    setModelId(next.id)

    const current: ComposerParams = { aspectRatio: ratio, quality, duration, resolution, count }
    const { params, changes } = reconcileParams(current, next)
    setRatio(params.aspectRatio)
    setQuality(params.quality)
    setDuration(params.duration)
    setResolution(params.resolution)
    setCount(params.count)
    for (const change of changes) toast(change.message, { tone: 'warning' })

    const referenceLimit = next.supportsImages ? next.maxImages : next.supportsLora ? 1 : 0
    const keptReferences = next.supportsImages
      ? references.slice(0, next.maxImages)
      : next.supportsLora
        ? references.filter((item) => item.lora)
        : []
    const removedReferences = referenceImageCount(references) - referenceImageCount(keptReferences)
    setReferences(keptReferences)
    if (removedReferences > 0) {
      toast(describeReferenceTrim(next.label, referenceLimit, removedReferences), { tone: 'warning' })
    }

    const editReferenceLimit = Math.max(0, next.maxImages - 1)
    const keptEditReferences = editReferences.slice(0, editReferenceLimit)
    const removedEditReferences =
      referenceImageCount(editReferences) - referenceImageCount(keptEditReferences)
    setEditReferences(keptEditReferences)
    if (removedEditReferences > 0) {
      toast(describeEditReferenceTrim(next.label, editReferenceLimit, removedEditReferences), {
        tone: 'warning',
      })
    }
  }

  const changeMode = (next: ComposerMode) => {
    if (next === mode) return
    setMode(next)
    setError(null)
    setNotice(null)
    setMulti(false)
    setCount(1)
    if (next !== 'edit') return
    const swap = editModeSwitch({ label: model.label, modelId: model.id, definition: model }, editChoices)
    if (!swap) return
    chooseModel(swap.modelId)
    toast(swap.message, { tone: 'warning' })
  }

  const generate = async () => {
    if (busy) return
    if (mode === 'edit') {
      if (editTargets.length === 0) {
        setError('Add at least one target image to edit.')
        return
      }
      if (prompt.trim().length === 0 && editReferences.length === 0) {
        setError('Write what to replace, or add a reference image.')
        return
      }
    } else if (prompt.trim().length === 0) {
      setError('Describe a scene first.')
      return
    }
    if (prompt.length > PROMPT_LIMIT) {
      setError(`Keep the prompt under ${PROMPT_LIMIT.toLocaleString()} characters.`)
      return
    }

    const bypassResize = resizeBypass.current
    resizeBypass.current = false
    if (!bypassResize) {
      const attached = mode === 'edit' ? [...editTargets, ...editReferences] : references
      if (shouldConfirmResize(attached, { suppressed: skipResizePrompt })) {
        setResizePrompt(oversizedReferences(attached))
        return
      }
    }

    const editReferencePlan = editReferencePlanFor(editReferences, model.id)
    const editBudget = Math.max(0, model.maxImages - 1)
    const fittedEditPlan = editReferencePlan.slice(0, editBudget)
    if (fittedEditPlan.length < editReferencePlan.length) {
      toast(`${model.label} takes ${model.maxImages} images; the extra references were dropped.`, {
        tone: 'warning',
      })
    }
    const profile = editProfile(model.id)
    const identity = referenceIdentity(references)
    const generateAssetIds = flattenReferenceAssets(references, model.id)
    if (generateAssetIds.length > model.maxImages) {
      toast(`${model.label} takes ${model.maxImages} images; the extra references were dropped.`, {
        tone: 'warning',
      })
    }

    const editPrompts = editTargets.map((target) => ({
      ...buildEditPromptResult(prompt, fittedEditPlan, profile, { modelId: model.id }),
      assetIds: orderEditAssets(fittedEditPlan, target.id, profile),
    }))
    const overflow = editPrompts.find((entry) => entry.overflow)?.overflow
    if (overflow) {
      setError(
        `${model.label} truncates prompts at ${overflow.maxChars} characters and this one is ${overflow.overBy} over. Shorten the instruction or pick a model without a cap.`,
      )
      return
    }

    const jobs =
      mode === 'edit'
        ? editPrompts.map(({ prompt: editPrompt, assetIds }) => ({ prompt: editPrompt, assetIds }))
        : (() => {
            const blocks = multi
              ? prompt
                  .split(/\n{2,}/)
                  .map((entry) => entry.trim())
                  .filter(Boolean)
              : [prompt.trim()]
            const repeats = multi || isVideo ? 1 : Math.min(count, MAX_IMAGE_RESULTS)
            return blocks.flatMap((block) =>
              Array.from({ length: repeats }, () => ({
                prompt: withIdentityClause(block, identity, model.id),
                assetIds: generateAssetIds.slice(0, model.maxImages),
              })),
            )
          })()

    if (mode !== 'edit' && jobs.length > MAX_BATCH) {
      setError(`A batch can hold at most ${MAX_BATCH} prompts.`)
      return
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
          const folder = await createFolderFn({
            data: {
              name: `Batch · ${new Date().toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}`,
            },
          })
          batchFolderId = folder.id
        } catch {
          // Grouping is optional; never block the generation.
        }
      }
      for (const job of jobs) {
        const view = await submitGeneration({
          data: {
            kind: mode === 'edit' ? 'image' : model.kind,
            model: model.id,
            prompt: job.prompt,
            assetIds: job.assetIds,
            folderId: batchFolderId,
            params:
              mode === 'edit'
                ? { aspectRatio: ratio, quality }
                : {
                    aspectRatio: ratio,
                    quality: isVideo ? undefined : quality,
                    durationSeconds: isVideo ? duration : undefined,
                    resolution: isVideo ? resolution : undefined,
                    sound: isVideo ? model.sound : undefined,
                    mode: isVideo ? model.defaultMode : undefined,
                    loraStrength: loraReference ? loraStrength : undefined,
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
          queryClient.invalidateQueries({ queryKey: ['home-generations'] }),
          queryClient.invalidateQueries({ queryKey: ['gallery'] }),
          queryClient.invalidateQueries({ queryKey: ['home-uploads'] }),
          queryClient.invalidateQueries({ queryKey: ['folders'] }),
        ])
        setNotice(
          `Queued ${ids.length} ${ids.length === 1 ? 'result' : 'results'} — the wall updates as each finishes.`,
        )
        toast(`${ids.length} ${ids.length === 1 ? 'generation' : 'generations'} started`, { tone: 'info' })
      }
      if (failures.length > 0) {
        setError(failures[0] ?? 'Generation failed')
        toast(failures[0] ?? 'Generation failed', { tone: 'error' })
      }
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Generation failed'
      setError(message)
      toast(message, { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const addReferences = (items: ReferenceItem[]) => {
    setReferences((current) => appendReferences(current, items, model.maxImages))
  }

  const addTargets = (items: ReferenceItem[]) => {
    const next = [
      ...editTargets,
      ...items.filter((item) => !editTargets.some((entry) => entry.id === item.id)),
    ]
    setEditTargets(next)
    setEditReferences((current) => trimReferences(current, Math.max(0, model.maxImages - 1)))
  }

  const addEditReferences = (items: ReferenceItem[]) => {
    setEditReferences((current) => appendReferences(current, items, Math.max(0, model.maxImages - 1)))
  }

  const hasContent =
    prompt.length > 0 || references.length > 0 || editTargets.length > 0 || editReferences.length > 0
  const overLimit = prompt.length > PROMPT_LIMIT
  const promptReady =
    mode === 'edit'
      ? editTargets.length > 0 && (prompt.trim().length > 0 || editReferences.length > 0)
      : prompt.trim().length > 0
  const disabled = busy || !promptReady || overLimit

  const pickerConfig =
    picker === 'editTargets'
      ? {
          title: 'Add target images',
          allowAvatars: false,
          existingIds: editTargets.map((item) => item.id),
          max: Number.POSITIVE_INFINITY,
          onConfirm: addTargets,
        }
      : picker === 'editReferences'
        ? {
            title: 'Add reference images',
            allowAvatars: true,
            existingIds: editReferences.flatMap((item) => item.assetIds ?? [item.id]),
            max: editReferenceSlots,
            onConfirm: addEditReferences,
          }
        : {
            title: 'Add reference images',
            allowAvatars: true,
            existingIds: references.flatMap((item) => item.assetIds ?? [item.id]),
            max: referenceSlots,
            onConfirm: addReferences,
          }

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
          <span className="text-ink/35 hidden max-w-32 truncate text-[10.5px] sm:block">{model.label}</span>
          <ChevronUp size={13} className="text-ink/35" />
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
          layout={!typing && !picker && loadingChips.size === 0}
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
                    setRatio(defaultAspectRatio(model))
                    setQuality(defaultQuality(model))
                    setDuration(model.kind === 'video' ? model.defaultDuration : 8)
                    setResolution(model.kind === 'video' ? model.defaultResolution : '')
                    setCount(1)
                    setMulti(false)
                  }}
                  aria-label="Clear prompt"
                  className="text-ink/35 hover:bg-ink/[0.06] hover:text-ink grid size-7 place-items-center rounded-lg transition-[color,background-color,transform] active:scale-90"
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
                className="text-ink/40 hover:bg-ink/[0.06] hover:text-ink grid size-7 place-items-center rounded-lg transition-[color,background-color,transform] active:scale-90"
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
              className="text-ink/40 hover:bg-ink/[0.06] hover:text-ink relative grid size-7 place-items-center rounded-lg transition-[color,background-color,transform] active:scale-90"
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
                mode === 'generate' ? 'text-canvas' : 'text-ink/45 hover:bg-ink/[0.05] hover:text-ink',
              )}
            >
              {mode === 'generate' ? (
                <motion.span
                  layoutId="composer-mode"
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
                mode === 'edit' ? 'text-canvas' : 'text-ink/45 hover:bg-ink/[0.05] hover:text-ink',
              )}
            >
              {mode === 'edit' ? (
                <motion.span
                  layoutId="composer-mode"
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
              {mode === 'generate' && canAddReferences ? (
                <SelectionBox
                  label="References"
                  tileLabel="IMAGE"
                  items={references}
                  max={referenceMax}
                  remaining={referenceSlots}
                  busy={busy}
                  onAdd={() => setPicker('references')}
                  onRemove={(id) => setReferences((current) => current.filter((entry) => entry.id !== id))}
                  onImageLoadChange={handleChipLoadChange}
                />
              ) : null}

              {mode === 'edit' ? (
                <>
                  <SelectionBox
                    label="Targets"
                    tileLabel="TARGET"
                    items={editTargets}
                    max={Number.POSITIVE_INFINITY}
                    remaining={Number.POSITIVE_INFINITY}
                    busy={busy}
                    onAdd={() => setPicker('editTargets')}
                    onRemove={(id) => setEditTargets((current) => current.filter((entry) => entry.id !== id))}
                    onImageLoadChange={handleChipLoadChange}
                  />
                  <SelectionBox
                    label="References"
                    tileLabel="REF"
                    items={editReferences}
                    max={Math.max(0, model.maxImages - 1)}
                    remaining={editReferenceSlots}
                    busy={busy}
                    onAdd={() => setPicker('editReferences')}
                    onRemove={(id) =>
                      setEditReferences((current) => current.filter((entry) => entry.id !== id))
                    }
                    onImageLoadChange={handleChipLoadChange}
                  />
                  <p className="text-ink/30 px-3 pt-1 text-[9px] leading-snug">
                    Avatars use their clean sheet and 4x4 panel for face and body. Extra references are
                    supporting only.
                  </p>
                </>
              ) : null}
            </motion.div>
          </AnimatePresence>

          <div
            className={cn(
              'flex min-h-0 flex-col px-3',
              expanded ? 'flex-1 pb-2' : '',
              canAddReferences || mode === 'edit' ? 'pt-2' : 'pt-9',
            )}
          >
            <textarea
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
              onFocus={() => setTyping(true)}
              onBlur={() => setTyping(false)}
              rows={1}
              placeholder={
                mode === 'edit'
                  ? editTargets.length === 0
                    ? 'Add a target image, then describe the replacement…'
                    : 'Describe the replacement, or leave blank to use the references…'
                  : isVideo
                    ? 'Describe the shot you imagine…'
                    : 'Describe the scene you imagine…'
              }
              aria-label="Prompt"
              disabled={busy}
              className={cn(
                'text-ink placeholder:text-ink/30 w-full resize-none bg-transparent text-[14.5px] leading-[22px] tracking-[-0.01em] outline-none transition-[height] duration-150 ease-out disabled:opacity-60 motion-reduce:transition-none',
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
                className={cn('px-3 pt-1.5 text-[10.5px]', error ? 'text-error' : 'text-ink/40')}
              >
                {error ?? notice}
              </motion.p>
            ) : null}
          </AnimatePresence>

          <AnimatePresence initial={false}>
            {loraReference && !loraSupported ? (
              <motion.div
                key="lora-note"
                variants={motionFadeRise}
                initial="hidden"
                animate="visible"
                exit="hidden"
                className="border-warning/25 bg-warning/10 text-ink/65 mx-3 mt-2 flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[10.5px]"
              >
                <span>
                  LoRA not used with <span className="text-ink/85 font-medium">{model.label}</span>
                </span>
                {loraModelChoice?.modelId ? (
                  <button
                    type="button"
                    onClick={() => chooseModel(loraModelChoice.modelId as string)}
                    className="text-accent hover:text-accent/80 ml-auto font-semibold transition-colors"
                  >
                    Switch model
                  </button>
                ) : null}
              </motion.div>
            ) : null}
          </AnimatePresence>

          <div className="border-line/60 mt-2 flex flex-wrap items-center gap-1.5 border-t px-3 pt-2.5 pb-2.5">
            <ModelCombobox
              className="w-[240px] md:w-[270px]"
              size="sm"
              value={model.id}
              options={modelOptions}
              disabled={busy}
              onChange={(entry) => {
                if (entry.modelId) chooseModel(entry.modelId)
              }}
            />

            {!isVideo && model.supportsQuality ? (
              <QualitySelector
                className="w-[78px] shrink-0"
                value={quality}
                options={model.qualityOptions}
                disabled={busy}
                onChange={setQuality}
              />
            ) : null}

            <AspectRatioSelector
              className="w-[104px] shrink-0"
              value={ratio}
              ratios={model.ratios}
              disabled={busy}
              onChange={setRatio}
            />

            <AnimatePresence initial={false}>
              {loraReference && loraSupported ? (
                <motion.div
                  key="lora-strength"
                  variants={motionPop}
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                  transition={motionFast}
                  className="border-line bg-canvas/55 flex h-8 items-center gap-1.5 rounded-lg border px-2"
                  title={`${loraReference.lora?.triggerWord ?? 'LoRA'} strength`}
                >
                  <span className="text-accent text-[9.5px] font-semibold tracking-[0.06em] uppercase">
                    LoRA
                  </span>
                  <input
                    type="range"
                    min={LORA_SCALE_MIN}
                    max={LORA_SCALE_MAX}
                    step={0.05}
                    value={loraStrength}
                    disabled={busy}
                    onChange={(event) => setLoraStrength(Number(event.target.value))}
                    aria-label="LoRA strength"
                    className="accent-accent h-1 w-14 cursor-pointer disabled:opacity-40"
                  />
                  <span className="text-ink/60 w-6 text-[10px] tabular-nums">{loraStrength.toFixed(2)}</span>
                </motion.div>
              ) : null}
            </AnimatePresence>

            {isVideo ? (
              <>
                <Selector
                  className="w-[78px] shrink-0"
                  size="sm"
                  value={String(duration)}
                  disabled={busy}
                  ariaLabel="Duration"
                  options={model.durations.map((option) => ({
                    key: String(option),
                    label: `${option}s`,
                    description: 'Duration',
                  }))}
                  showTriggerDescription={false}
                  menuMinWidth={160}
                  onChange={(option) => setDuration(Number(option.key))}
                />
                {model.resolutions.length > 0 ? (
                  <Selector
                    className="w-[94px] shrink-0"
                    size="sm"
                    value={resolution}
                    disabled={busy}
                    ariaLabel="Resolution"
                    options={model.resolutions.map((option) => ({
                      key: option,
                      label: option.toUpperCase(),
                      description: resolutionName(option),
                    }))}
                    showTriggerDescription={false}
                    menuMinWidth={180}
                    onChange={(option) => setResolution(option.key)}
                  />
                ) : null}
              </>
            ) : null}

            {!isVideo && !multi && mode === 'generate' ? (
              <div className="border-line bg-canvas/55 relative flex h-8 items-center overflow-hidden rounded-lg border">
                <button
                  type="button"
                  aria-label="Fewer results"
                  onClick={() => setCount((value) => Math.max(1, value - 1))}
                  disabled={busy || count <= 1}
                  className="text-ink/55 hover:text-ink h-full w-7 text-[14px] transition-[color,transform,opacity] duration-150 active:scale-90 disabled:opacity-25"
                >
                  −
                </button>
                <AnimatePresence initial={false} mode="popLayout">
                  <motion.span
                    key={count}
                    variants={motionPop}
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    transition={motionFast}
                    className="text-ink/75 min-w-7 text-center text-[11.5px] tabular-nums"
                  >
                    {count}/{MAX_IMAGE_RESULTS}
                  </motion.span>
                </AnimatePresence>
                <button
                  type="button"
                  aria-label="More results"
                  onClick={() => setCount((value) => Math.min(MAX_IMAGE_RESULTS, value + 1))}
                  disabled={busy || count >= MAX_IMAGE_RESULTS}
                  className="text-ink/55 hover:text-ink h-full w-7 text-[14px] transition-[color,transform,opacity] duration-150 active:scale-90 disabled:opacity-25"
                >
                  +
                </button>
              </div>
            ) : null}

            {mode === 'generate' ? (
              <button
                type="button"
                aria-pressed={multi}
                onClick={() => {
                  setMulti((value) => !value)
                  setCount(1)
                }}
                disabled={busy}
                className={cn(
                  'flex h-8 items-center gap-1.5 rounded-lg border px-2 text-[11.5px] font-medium transition-[color,background-color,border-color,transform]',
                  motionPress,
                  multi
                    ? 'border-accent/30 bg-accent/10 text-accent'
                    : 'border-line bg-canvas/55 text-ink/55 hover:text-ink',
                )}
              >
                <span
                  className={cn(
                    'relative h-3.5 w-6 rounded-full transition-colors',
                    multi ? 'bg-accent' : 'bg-ink/20',
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 size-2.5 rounded-full bg-white transition-[left] duration-150 ease-out',
                      multi ? 'left-[13px]' : 'left-0.5',
                    )}
                  />
                </span>
                Multi
              </button>
            ) : null}

            <div className="ml-auto flex items-center gap-2">
              <span
                className={cn(
                  'text-[10px] tabular-nums transition-colors duration-300',
                  overLimit ? 'text-error' : 'text-ink/30',
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
  remaining,
  busy,
  onAdd,
  onRemove,
  onImageLoadChange,
}: {
  label: string
  tileLabel: string
  items: ReferenceItem[]
  max: number
  remaining: number
  busy: boolean
  onAdd: () => void
  onRemove: (id: string) => void
  onImageLoadChange: (id: string, loaded: boolean) => void
}) {
  return (
    <div className="px-3 pt-2">
      <div className="flex items-center justify-between">
        <span className="text-ink/35 text-[9px] font-semibold tracking-[0.1em] uppercase">{label}</span>
        <span className="text-ink/25 text-[9px] tabular-nums">
          {Number.isFinite(max) ? `${items.length}/${max}` : items.length}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-start gap-1.5">
        <AnimatePresence initial={false} mode="popLayout">
          {items.map((item) => (
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
              <FadeImage
                src={thumbUrl(item.url, 160)}
                srcSet={thumbSrcSet(item.url, [160, 320])}
                sizes="48px"
                alt=""
                decoding="async"
                onLoadedChange={(loaded) => onImageLoadChange(item.id, loaded)}
                className="size-12 object-cover"
              />
              {item.lora ? (
                <span className="bg-accent text-canvas absolute bottom-0 left-0 rounded-tr px-1 py-px text-[7px] font-semibold tracking-[0.04em] uppercase">
                  LoRA
                </span>
              ) : null}
              {referenceIsOversized(item) ? (
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
          {remaining > 0 ? (
            <motion.button
              key="add"
              type="button"
              onClick={onAdd}
              disabled={busy}
              aria-label={`Add ${label.toLowerCase()}`}
              variants={motionPop}
              initial="hidden"
              animate="visible"
              exit="hidden"
              transition={motionFast}
              className="border-line bg-canvas/50 text-ink/45 hover:border-accent/35 hover:text-accent flex size-12 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed transition-[color,border-color,transform] active:scale-95 disabled:opacity-40"
            >
              <ImagePlus size={13} />
              <span className="text-[7.5px] font-semibold tracking-[0.04em]">{tileLabel}</span>
              {Number.isFinite(remaining) ? (
                <span className="text-[7.5px] opacity-60">{remaining} left</span>
              ) : null}
            </motion.button>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  )
}
