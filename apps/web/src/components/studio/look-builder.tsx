import {
  SLOT_LABELS,
  STUDIO_ANGLES,
  STUDIO_ANGLE_LABELS,
  buildStudioPrompt,
  normalizeAngles,
  orderStudioGarments,
  validateStudioLook,
  type StudioAngle,
  type StudioGarmentInput,
  type ModelDefinition,
} from '@sunnygen/core'
import {
  Badge,
  Button,
  Card,
  FadeImage,
  Selector,
  Textarea,
  cn,
  motionFade,
  motionFast,
  motionSpring,
  toast,
} from '@sunnygen/ui'
import { Camera, Check, ChevronDown, Loader2, Play, RotateCcw } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import type { StudioItemDto, StudioLibrary } from '~/server/studio.functions'
import { getGenerationView, submitGeneration } from '~/server/generation.functions'
import { createFolderFn } from '~/server/library.functions'
import { thumbSrcSet, thumbUrl } from '~/lib/media-thumbs'
import { ModelCombobox, type ModelOption } from '~/components/model-combobox'
import { AspectRatioSelector, QualitySelector } from '~/components/generation-selectors'
import { sortModelChoices } from '~/lib/model-choices'
import { describeReferenceTrim, reconcileParams } from '~/lib/model-params'
import { trimStudioReferences } from '~/lib/studio-references'
import { useModelChoices } from '~/lib/use-model-choices'

interface AngleResult {
  angle: StudioAngle
  status: 'pending' | 'running' | 'done' | 'failed'
  url?: string
  error?: string
}

interface StudioSelection {
  garmentIds: string[]
  poseId: string
  sceneId: string
}

function studioFolderName(): string {
  return `Studio · ${new Date().toLocaleDateString()}`
}

export function StudioLookBuilder({ library }: { library: StudioLibrary }) {
  const queryClient = useQueryClient()
  const [avatarId, setAvatarId] = useState<string | null>(library.avatars[0]?.id ?? null)
  const [garmentIds, setGarmentIds] = useState<string[]>([])
  const [poseId, setPoseId] = useState<string>('none')
  const [sceneId, setSceneId] = useState<string>(library.scenes[0]?.id ?? 'none')
  const [angles, setAngles] = useState<StudioAngle[]>(['front'])
  const [modelId, setModelId] = useState('nano-banana-2')
  const [ratio, setRatio] = useState('3:4')
  const [quality, setQuality] = useState('1k')
  const [notes, setNotes] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<AngleResult[]>([])
  const [previewOpen, setPreviewOpen] = useState(false)
  const runToken = useRef(0)

  const avatar = library.avatars.find((item) => item.id === avatarId) ?? null
  const selectedGarments = garmentIds
    .map((id) => library.garments.find((item) => item.id === id))
    .filter((item): item is StudioItemDto => Boolean(item))
  const orderedGarments = orderStudioGarments(
    selectedGarments.map((item) => ({
      ...item,
      slot: (item.data.slot as StudioGarmentInput['slot']) ?? 'top',
    })),
  )
  const pose = poseId === 'none' ? null : (library.poses.find((item) => item.id === poseId) ?? null)
  const scene = library.scenes.find((item) => item.id === sceneId) ?? null
  const hasSceneImage = Boolean(scene?.assetUrl)

  const garmentInputs: StudioGarmentInput[] = orderedGarments.map((item) => ({
    id: item.id,
    name: item.name,
    slot: (item.data.slot as StudioGarmentInput['slot']) ?? 'top',
    sourceKind: (item.data.sourceKind as StudioGarmentInput['sourceKind']) ?? 'flat-lay',
    hasCleanReference: Boolean(item.cleanAssetId),
    notes: String(item.data.notes ?? ''),
  }))
  const validation = validateStudioLook(garmentInputs)

  const referenceCount = (avatar ? 1 : 0) + orderedGarments.length + (pose ? 1 : 0) + (hasSceneImage ? 1 : 0)
  const { choices, catalogOnly } = useModelChoices()
  const modelOptions = sortModelChoices(choices, catalogOnly).filter(
    (entry) => entry.kind === 'image' && Boolean(entry.definition?.supportsImages),
  )
  const model = modelOptions.find((entry) => entry.modelId === modelId)?.definition ?? null

  const blocking = !avatar
    ? 'Pick an avatar.'
    : orderedGarments.length === 0
      ? 'Add at least one garment.'
      : (validation.blocking[0] ?? (!model ? 'Pick an image model.' : null))

  const promptInput = {
    garments: orderedGarments.map((item, index) => ({
      ...garmentInputs[index]!,
      imageIndex: index + 2,
    })),
    hasPose: Boolean(pose),
    poseImageIndex: pose ? 2 + orderedGarments.length : null,
    hasSceneImage,
    sceneImageIndex: hasSceneImage ? 2 + orderedGarments.length + (pose ? 1 : 0) : null,
    angle: angles[0] ?? 'front',
    notes,
  }

  const canToggleGarment = (item: StudioItemDto): boolean => {
    if (garmentIds.includes(item.id)) return true
    if (garmentIds.length >= 6) return false
    const slot = (item.data.slot as StudioGarmentInput['slot']) ?? 'top'
    const current = selectedGarments.filter((entry) => entry.data.slot === slot).length
    return current < (slot === 'accessory' ? 2 : 1)
  }

  const toggleGarment = (item: StudioItemDto) => {
    if (!canToggleGarment(item)) return
    applySelection({
      garmentIds: garmentIds.includes(item.id)
        ? garmentIds.filter((id) => id !== item.id)
        : [...garmentIds, item.id],
      poseId,
      sceneId,
    })
  }

  const toggleAngle = (angle: StudioAngle) => {
    setAngles((current) => {
      if (current.includes(angle)) {
        return current.length === 1 ? current : current.filter((value) => value !== angle)
      }
      return normalizeAngles([...current, angle])
    })
  }

  const fitReferences = (definition: ModelDefinition, selection: StudioSelection): StudioSelection => {
    const sceneItem = library.scenes.find((item) => item.id === selection.sceneId)
    const hasScene = Boolean(sceneItem?.assetUrl)
    const fitted = trimStudioReferences(
      {
        garmentCount: selection.garmentIds.length,
        hasPose: selection.poseId !== 'none',
        hasScene,
      },
      definition.maxImages,
    )
    if (fitted.removed === 0) return selection
    toast(describeReferenceTrim(definition.label, definition.maxImages, fitted.removed), {
      tone: 'warning',
    })
    return {
      garmentIds: selection.garmentIds.slice(selection.garmentIds.length - fitted.garmentCount),
      poseId: fitted.hasPose ? selection.poseId : 'none',
      sceneId: hasScene && !fitted.hasScene ? 'none' : selection.sceneId,
    }
  }

  const applySelection = (selection: StudioSelection, definition: ModelDefinition | null = model) => {
    const fitted = definition ? fitReferences(definition, selection) : selection
    setGarmentIds(fitted.garmentIds)
    setPoseId(fitted.poseId)
    setSceneId(fitted.sceneId)
  }

  const chooseModel = (entry: ModelOption) => {
    const next = entry.definition
    if (!next || next.kind !== 'image') return
    setModelId(next.id)
    const { params, changes } = reconcileParams(
      { aspectRatio: ratio, quality, duration: 0, resolution: '', count: 1 },
      next,
    )
    setRatio(params.aspectRatio)
    setQuality(params.quality)
    for (const change of changes) toast(change.message, { tone: 'warning' })
    applySelection({ garmentIds, poseId, sceneId }, next)
  }

  const referenceIds: string[] = []
  if (avatar) {
    referenceIds.push(avatar.assetId ?? '')
    for (const item of orderedGarments) referenceIds.push(item.cleanAssetId ?? item.assetId ?? '')
    if (pose?.assetId) referenceIds.push(pose.assetId)
    if (scene?.assetId) referenceIds.push(scene.assetId)
  }
  const usableReferenceIds = referenceIds.filter(Boolean)

  const updateResult = (angle: StudioAngle, patch: Partial<AngleResult>) => {
    setResults((current) => current.map((entry) => (entry.angle === angle ? { ...entry, ...patch } : entry)))
  }

  const generate = async () => {
    if (blocking || !model || !avatar) {
      setError(blocking ?? 'The look is not ready.')
      return
    }
    if (running) return
    const token = runToken.current + 1
    runToken.current = token
    setRunning(true)
    setError(null)
    const selected = normalizeAngles(angles)
    setResults(selected.map((angle) => ({ angle, status: 'pending' })))

    try {
      const folder = await createFolderFn({
        data: { name: studioFolderName() },
      })

      for (const angle of selected) {
        if (runToken.current !== token) return
        updateResult(angle, { status: 'running' })
        const prompt = buildStudioPrompt({ ...promptInput, angle })
        const submitted = await submitGeneration({
          data: {
            kind: 'image',
            model: model.id,
            prompt,
            assetIds: usableReferenceIds,
            params: { aspectRatio: ratio, quality },
            folderId: folder.id,
          },
        })

        if (submitted.generation.status === 'failed') {
          updateResult(angle, { status: 'failed', error: submitted.generation.error ?? 'Generation failed' })
          continue
        }

        let view = submitted
        if (view.generation.status !== 'succeeded') {
          for (let attempt = 0; attempt < 384; attempt += 1) {
            if (runToken.current !== token) return
            await new Promise((resolve) => setTimeout(resolve, 2_500))
            const current = await getGenerationView({ data: { id: submitted.generation.id } })
            if (!current) {
              updateResult(angle, { status: 'failed', error: 'Generation disappeared' })
              break
            }
            view = current
            if (view.generation.status === 'failed') {
              updateResult(angle, { status: 'failed', error: view.generation.error ?? 'Generation failed' })
              break
            }
            if (view.generation.status === 'cancelled') {
              updateResult(angle, { status: 'failed', error: 'Generation canceled' })
              break
            }
            if (view.generation.status === 'succeeded') break
          }
        }

        if (view.generation.status === 'succeeded') {
          updateResult(angle, {
            status: 'done',
            url: view.outputs[0]?.url,
          })
        } else if (view.generation.status !== 'failed') {
          updateResult(angle, { status: 'failed', error: 'Timed out' })
        }
        await queryClient.invalidateQueries({ queryKey: ['gallery'] })
      }
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Could not run the look')
    } finally {
      if (runToken.current === token) setRunning(false)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.25fr_0.75fr]">
      <div className="flex flex-col gap-5">
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-ink/45 text-[11px] font-semibold tracking-[0.08em] uppercase">Avatar</p>
            <span className="text-ink/35 text-[10.5px]">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={library.avatars.length}
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -3 }}
                  transition={motionFast}
                  className="inline-block"
                >
                  {library.avatars.length} saved
                </motion.span>
              </AnimatePresence>
            </span>
          </div>
          {library.avatars.length === 0 ? (
            <p className="border-line text-ink/40 rounded-lg border border-dashed px-3 py-6 text-center text-[11.5px]">
              Add an avatar in the Avatars tab first.
            </p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {library.avatars.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setAvatarId(item.id)}
                  className={cn(
                    'relative w-20 shrink-0 overflow-hidden rounded-xl border text-left transition-[border-color,scale] duration-200 ease-out active:scale-[0.97] motion-reduce:active:scale-100',
                    avatarId === item.id ? 'border-accent/60' : 'border-line hover:border-ink/25',
                  )}
                >
                  {avatarId === item.id ? (
                    <motion.span
                      layoutId="studio-avatar-ring"
                      transition={motionSpring}
                      className="border-accent pointer-events-none absolute inset-0 z-10 rounded-xl border-2"
                    />
                  ) : null}
                  {item.assetUrl ? (
                    <FadeImage
                      shimmer
                      src={thumbUrl(item.assetUrl, 160)}
                      srcSet={thumbSrcSet(item.assetUrl, [160, 320])}
                      sizes="80px"
                      alt=""
                      decoding="async"
                      className="aspect-square w-full object-cover"
                    />
                  ) : (
                    <div className="bg-ink/[0.04] aspect-square" />
                  )}
                  <p className="text-ink/60 truncate px-1.5 py-1 text-[10px]">{item.name}</p>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-ink/45 text-[11px] font-semibold tracking-[0.08em] uppercase">Wardrobe</p>
            <span className="text-ink/35 text-[10.5px]">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={selectedGarments.length}
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -3 }}
                  transition={motionFast}
                  className="inline-block"
                >
                  {selectedGarments.length}/6 pieces
                </motion.span>
              </AnimatePresence>
            </span>
          </div>
          {library.garments.length === 0 ? (
            <p className="border-line text-ink/40 rounded-lg border border-dashed px-3 py-6 text-center text-[11.5px]">
              Add garments in the Wardrobe tab first.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {library.garments.map((item) => {
                const image = item.cleanAssetUrl ?? item.assetUrl
                const selected = garmentIds.includes(item.id)
                const disabled = !canToggleGarment(item)
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleGarment(item)}
                    className={cn(
                      'relative overflow-hidden rounded-lg border text-left transition-[border-color,opacity,scale] duration-200 ease-out active:scale-[0.97] motion-reduce:active:scale-100',
                      selected ? 'border-accent/60' : 'border-line hover:border-ink/25',
                      disabled && 'opacity-40',
                    )}
                  >
                    {selected ? (
                      <motion.span
                        layoutId="studio-garment-ring"
                        transition={motionSpring}
                        className="border-accent pointer-events-none absolute inset-0 z-10 rounded-lg border-2"
                      />
                    ) : null}
                    {image ? (
                      <FadeImage
                        shimmer
                        src={thumbUrl(image, 320)}
                        srcSet={thumbSrcSet(image, [160, 320])}
                        sizes="(min-width: 640px) 120px, 30vw"
                        alt=""
                        decoding="async"
                        shimmerClassName="inset-x-0 top-0 aspect-square"
                        className="aspect-square w-full object-cover"
                      />
                    ) : (
                      <div className="bg-ink/[0.04] aspect-square" />
                    )}
                    <AnimatePresence initial={false}>
                      {selected ? (
                        <motion.span
                          key="garment-check"
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.5 }}
                          transition={motionFast}
                          className="bg-accent absolute top-1 right-1 z-20 grid size-4 place-items-center rounded-full text-white"
                        >
                          <Check size={9} />
                        </motion.span>
                      ) : null}
                    </AnimatePresence>
                    <p className="text-ink/55 truncate px-1.5 py-1 text-[9.5px]">
                      {SLOT_LABELS[(item.data.slot as StudioGarmentInput['slot']) ?? 'top']} · {item.name}
                    </p>
                  </button>
                )
              })}
            </div>
          )}
        </Card>

        <div className="grid gap-3 sm:grid-cols-2">
          <Card className="flex flex-col gap-2 p-4">
            <p className="text-ink/45 text-[11px] font-semibold tracking-[0.08em] uppercase">Pose</p>
            <Selector
              value={poseId}
              size="sm"
              disabled={running}
              ariaLabel="Pose"
              options={[
                { key: 'none', label: 'Standing (no pose)' },
                ...library.poses.map((item) => ({ key: item.id, label: item.name })),
              ]}
              onChange={(option) => applySelection({ garmentIds, poseId: option.key, sceneId })}
            />
          </Card>
          <Card className="flex flex-col gap-2 p-4">
            <p className="text-ink/45 text-[11px] font-semibold tracking-[0.08em] uppercase">Scene</p>
            <Selector
              value={sceneId}
              size="sm"
              disabled={running}
              ariaLabel="Scene"
              options={[
                { key: 'none', label: 'No scene' },
                ...library.scenes.map((item) => ({ key: item.id, label: item.name })),
              ]}
              onChange={(option) => applySelection({ garmentIds, poseId, sceneId: option.key })}
            />
          </Card>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-ink/45 text-[11px] font-semibold tracking-[0.08em] uppercase">Shot</p>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={blocking ? 'not-ready' : 'ready'}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={motionFast}
                className="inline-flex"
              >
                <Badge tone={blocking ? 'warning' : 'success'}>{blocking ? 'Not ready' : 'Ready'}</Badge>
              </motion.span>
            </AnimatePresence>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            {STUDIO_ANGLES.map((angle) => (
              <button
                key={angle}
                type="button"
                onClick={() => toggleAngle(angle)}
                className={cn(
                  'h-8 rounded-lg border text-[10.5px] font-medium transition-[border-color,background-color,color,scale] duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100',
                  angles.includes(angle)
                    ? 'border-accent bg-accent/[0.07] text-accent'
                    : 'border-line text-ink/45 hover:border-ink/25 hover:text-ink',
                )}
              >
                {STUDIO_ANGLE_LABELS[angle]}
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-col gap-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-ink/40 text-[9.5px] font-semibold tracking-[0.08em] uppercase">
                Model
              </span>
              <ModelCombobox
                value={model?.id ?? ''}
                options={modelOptions}
                size="sm"
                className="w-full"
                disabled={running || modelOptions.length === 0}
                onChange={chooseModel}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <span className="text-ink/40 text-[9.5px] font-semibold tracking-[0.08em] uppercase">
                  Ratio
                </span>
                <AspectRatioSelector
                  className="w-full"
                  value={ratio}
                  ratios={model?.ratios ?? ['3:4']}
                  disabled={running}
                  onChange={setRatio}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-ink/40 text-[9.5px] font-semibold tracking-[0.08em] uppercase">
                  Quality
                </span>
                <QualitySelector
                  className="w-full"
                  value={quality}
                  options={model?.qualityOptions.length ? model.qualityOptions : ['1k']}
                  disabled={running}
                  onChange={setQuality}
                />
              </div>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-ink/40 text-[9.5px] font-semibold tracking-[0.08em] uppercase">
                Direction
              </span>
              <Textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value.slice(0, 500))}
                placeholder="Optional styling notes"
                className="min-h-16 text-[11.5px]"
              />
            </label>
          </div>

          <div className="text-ink/40 mt-3 flex items-center justify-between text-[10.5px]">
            <span>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={`refs-${referenceCount}`}
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -3 }}
                  transition={motionFast}
                  className="inline-block"
                >
                  {referenceCount} reference image{referenceCount === 1 ? '' : 's'}
                </motion.span>
              </AnimatePresence>
            </span>
            <span>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={`gens-${angles.length}`}
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -3 }}
                  transition={motionFast}
                  className="inline-block"
                >
                  {angles.length} generation{angles.length === 1 ? '' : 's'}
                </motion.span>
              </AnimatePresence>
            </span>
          </div>

          <AnimatePresence initial={false}>
            {blocking ? (
              <motion.p
                key="blocking"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={motionFast}
                className="text-warning mt-2 overflow-hidden text-[11px]"
              >
                {blocking}
              </motion.p>
            ) : null}
          </AnimatePresence>
          <AnimatePresence initial={false}>
            {validation.warnings.length > 0 ? (
              <motion.p
                key={validation.warnings[0]}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={motionFast}
                className="text-ink/45 mt-1 overflow-hidden text-[10.5px] leading-snug"
              >
                {validation.warnings[0]}
              </motion.p>
            ) : null}
          </AnimatePresence>
          <AnimatePresence initial={false}>
            {error ? (
              <motion.p
                key="look-error"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={motionFast}
                className="text-error mt-2 overflow-hidden text-[11px]"
              >
                {error}
              </motion.p>
            ) : null}
          </AnimatePresence>

          <div className="mt-3 flex gap-2">
            <Button
              className="flex-1"
              onClick={() => void generate()}
              loading={running}
              disabled={Boolean(blocking) || running}
            >
              <Play size={12} />
              {running ? 'Rendering…' : `Generate ${angles.length} angle${angles.length === 1 ? '' : 's'}`}
            </Button>
            <AnimatePresence initial={false}>
              {running ? (
                <motion.div
                  key="cancel-run"
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={motionFast}
                  className="overflow-hidden"
                >
                  <Button
                    variant="ghost"
                    onClick={() => {
                      runToken.current += 1
                      setRunning(false)
                    }}
                  >
                    Cancel
                  </Button>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <div className="mt-3">
            <button
              type="button"
              onClick={() => setPreviewOpen((current) => !current)}
              aria-expanded={previewOpen}
              className="text-ink/40 hover:text-ink flex items-center gap-1 text-[10.5px] transition-[color,scale] duration-150 ease-out active:scale-[0.98] motion-reduce:active:scale-100"
            >
              <ChevronDown
                size={11}
                className={cn('transition-transform duration-200 ease-out', previewOpen && 'rotate-180')}
              />
              Prompt preview
            </button>
            <AnimatePresence initial={false}>
              {previewOpen ? (
                <motion.div
                  key="prompt-preview"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={motionFast}
                  className="overflow-hidden"
                >
                  <pre className="bg-canvas text-ink/55 mt-2 max-h-48 overflow-auto rounded-lg p-2 text-[10px] leading-relaxed whitespace-pre-wrap">
                    {buildStudioPrompt(promptInput)}
                  </pre>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </Card>

        <Card className="p-4">
          <p className="text-ink/45 text-[11px] font-semibold tracking-[0.08em] uppercase">Angles</p>
          <AnimatePresence mode="wait" initial={false}>
            {results.length === 0 ? (
              <motion.p
                key="results-empty"
                variants={motionFade}
                initial="hidden"
                animate="visible"
                exit="hidden"
                className="text-ink/40 mt-3 text-[11.5px]"
              >
                Renders appear here, one per angle.
              </motion.p>
            ) : (
              <motion.div
                key="results-list"
                variants={motionFade}
                initial="hidden"
                animate="visible"
                exit="hidden"
                className="mt-3 flex flex-col gap-2"
              >
                <AnimatePresence initial={false}>
                  {results.map((result) => (
                    <motion.div
                      key={result.angle}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={motionFast}
                      className="border-line flex items-center gap-2 rounded-lg border p-2"
                    >
                      <div className="bg-ink/[0.04] relative grid size-9 place-items-center overflow-hidden rounded-md">
                        <AnimatePresence mode="wait" initial={false}>
                          <motion.span
                            key={result.status}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            transition={motionFast}
                            className="grid size-full place-items-center"
                          >
                            {result.status === 'done' && result.url ? (
                              <FadeImage shimmer src={result.url} alt="" className="size-full object-cover" />
                            ) : result.status === 'failed' ? (
                              <span className="text-error">!</span>
                            ) : (
                              <Loader2 size={13} className="text-ink/35 animate-spin" />
                            )}
                          </motion.span>
                        </AnimatePresence>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-ink/70 text-[11px] font-medium">
                          {STUDIO_ANGLE_LABELS[result.angle]}
                        </p>
                        <p className="text-ink/40 truncate text-[10px]">
                          <AnimatePresence mode="popLayout" initial={false}>
                            <motion.span
                              key={`${result.status}-${result.error ?? ''}`}
                              initial={{ opacity: 0, y: 3 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -3 }}
                              transition={motionFast}
                              className="inline-block"
                            >
                              {result.error ?? result.status}
                            </motion.span>
                          </AnimatePresence>
                        </p>
                      </div>
                      <AnimatePresence initial={false}>
                        {result.status === 'failed' ? (
                          <motion.button
                            key="retry"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            transition={motionFast}
                            type="button"
                            onClick={() => void generate()}
                            className="text-ink/40 hover:bg-ink/5 grid size-7 place-items-center rounded-md transition-[color,background-color,scale] duration-150 ease-out active:scale-[0.92] motion-reduce:active:scale-100"
                            aria-label="Retry"
                          >
                            <RotateCcw size={12} />
                          </motion.button>
                        ) : null}
                      </AnimatePresence>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
        <p className="text-ink/35 flex items-center gap-1.5 text-[10px]">
          <Camera size={11} /> One generation per angle, all over the same reference list.
        </p>
      </div>
    </div>
  )
}
