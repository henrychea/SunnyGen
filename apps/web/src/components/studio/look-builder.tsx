import {
  IMAGE_MODELS,
  SLOT_LABELS,
  STUDIO_ANGLES,
  STUDIO_ANGLE_LABELS,
  buildStudioPrompt,
  normalizeAngles,
  orderStudioGarments,
  validateStudioLook,
  type StudioAngle,
  type StudioGarmentInput,
} from '@sunnygen/core'
import { Badge, Button, Card, Select, Textarea, cn } from '@sunnygen/ui'
import { Camera, Check, Loader2, Play, RotateCcw } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import type { StudioItemDto, StudioLibrary } from '~/server/studio.functions'
import { getGenerationView, submitGeneration } from '~/server/generation.functions'
import { createFolderFn } from '~/server/library.functions'

interface AngleResult {
  angle: StudioAngle
  status: 'pending' | 'running' | 'done' | 'failed'
  url?: string
  error?: string
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
  const fittingModels = IMAGE_MODELS.filter(
    (model) => model.supportsImages && model.maxImages >= Math.max(1, referenceCount),
  )
  const model = fittingModels.find((entry) => entry.id === modelId) ?? fittingModels[0] ?? null

  const blocking = !avatar
    ? 'Pick an avatar.'
    : orderedGarments.length === 0
      ? 'Add at least one garment.'
      : (validation.blocking[0] ?? (!model ? 'No image model fits this many references.' : null))

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
    setGarmentIds((current) =>
      current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id],
    )
  }

  const toggleAngle = (angle: StudioAngle) => {
    setAngles((current) => {
      if (current.includes(angle)) {
        return current.length === 1 ? current : current.filter((value) => value !== angle)
      }
      return normalizeAngles([...current, angle])
    })
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
    <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
      <div className="flex flex-col gap-5">
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-ink/45 text-[11px] font-semibold tracking-[0.08em] uppercase">Avatar</p>
            <span className="text-ink/35 text-[10.5px]">{library.avatars.length} saved</span>
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
                    'w-20 shrink-0 overflow-hidden rounded-xl border text-left',
                    avatarId === item.id
                      ? 'border-accent ring-accent/20 ring-2'
                      : 'border-line hover:border-ink/25',
                  )}
                >
                  {item.assetUrl ? (
                    <img src={item.assetUrl} alt="" className="aspect-square w-full object-cover" />
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
            <span className="text-ink/35 text-[10.5px]">{selectedGarments.length}/6 pieces</span>
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
                      'relative overflow-hidden rounded-lg border text-left',
                      selected ? 'border-accent ring-accent/20 ring-2' : 'border-line hover:border-ink/25',
                      disabled && 'opacity-40',
                    )}
                  >
                    {image ? (
                      <img src={image} alt="" className="aspect-square w-full object-cover" />
                    ) : (
                      <div className="bg-ink/[0.04] aspect-square" />
                    )}
                    {selected ? (
                      <span className="bg-accent absolute top-1 right-1 grid size-4 place-items-center rounded-full text-white">
                        <Check size={9} />
                      </span>
                    ) : null}
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
            <Select value={poseId} onChange={(event) => setPoseId(event.target.value)}>
              <option value="none">Standing (no pose)</option>
              {library.poses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Card>
          <Card className="flex flex-col gap-2 p-4">
            <p className="text-ink/45 text-[11px] font-semibold tracking-[0.08em] uppercase">Scene</p>
            <Select value={sceneId} onChange={(event) => setSceneId(event.target.value)}>
              {library.scenes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Card>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-ink/45 text-[11px] font-semibold tracking-[0.08em] uppercase">Shot</p>
            <Badge tone={blocking ? 'warning' : 'success'}>{blocking ? 'Not ready' : 'Ready'}</Badge>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            {STUDIO_ANGLES.map((angle) => (
              <button
                key={angle}
                type="button"
                onClick={() => toggleAngle(angle)}
                className={cn(
                  'h-8 rounded-lg border text-[10.5px] font-medium',
                  angles.includes(angle)
                    ? 'border-accent bg-accent/[0.07] text-accent'
                    : 'border-line text-ink/45 hover:text-ink',
                )}
              >
                {STUDIO_ANGLE_LABELS[angle]}
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-col gap-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-ink/40 text-[9.5px] font-semibold tracking-[0.08em] uppercase">
                Model
              </span>
              <Select
                value={model?.id ?? ''}
                onChange={(event) => {
                  const next = fittingModels.find((entry) => entry.id === event.target.value)
                  if (!next) return
                  setModelId(next.id)
                  setRatio(next.ratios.includes('3:4') ? '3:4' : (next.ratios[0] ?? '1:1'))
                  setQuality(next.defaultQuality)
                }}
                disabled={fittingModels.length === 0}
              >
                {fittingModels.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label} · {entry.maxImages} refs
                  </option>
                ))}
              </Select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-ink/40 text-[9.5px] font-semibold tracking-[0.08em] uppercase">
                  Ratio
                </span>
                <Select value={ratio} onChange={(event) => setRatio(event.target.value)}>
                  {(model?.ratios ?? ['3:4']).map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-ink/40 text-[9.5px] font-semibold tracking-[0.08em] uppercase">
                  Quality
                </span>
                <Select value={quality} onChange={(event) => setQuality(event.target.value)}>
                  {(model?.qualityOptions.length ? model.qualityOptions : ['1k']).map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </Select>
              </label>
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
              {referenceCount} reference image{referenceCount === 1 ? '' : 's'}
            </span>
            <span>
              {angles.length} generation{angles.length === 1 ? '' : 's'}
            </span>
          </div>

          {blocking ? <p className="text-warning mt-2 text-[11px]">{blocking}</p> : null}
          {validation.warnings.length > 0 ? (
            <p className="text-ink/45 mt-1 text-[10.5px] leading-snug">{validation.warnings[0]}</p>
          ) : null}
          {error ? <p className="text-error mt-2 text-[11px]">{error}</p> : null}

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
            {running ? (
              <Button
                variant="ghost"
                onClick={() => {
                  runToken.current += 1
                  setRunning(false)
                }}
              >
                Cancel
              </Button>
            ) : null}
          </div>

          <details className="mt-3">
            <summary className="text-ink/40 cursor-pointer text-[10.5px]">Prompt preview</summary>
            <pre className="bg-canvas text-ink/55 mt-2 max-h-48 overflow-auto rounded-lg p-2 text-[10px] leading-relaxed whitespace-pre-wrap">
              {buildStudioPrompt(promptInput)}
            </pre>
          </details>
        </Card>

        <Card className="p-4">
          <p className="text-ink/45 text-[11px] font-semibold tracking-[0.08em] uppercase">Angles</p>
          {results.length === 0 ? (
            <p className="text-ink/40 mt-3 text-[11.5px]">Renders appear here, one per angle.</p>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              {results.map((result) => (
                <div key={result.angle} className="border-line flex items-center gap-2 rounded-lg border p-2">
                  <div className="bg-ink/[0.04] grid size-9 place-items-center overflow-hidden rounded-md">
                    {result.status === 'done' && result.url ? (
                      <img src={result.url} alt="" className="size-full object-cover" />
                    ) : result.status === 'failed' ? (
                      <span className="text-error">!</span>
                    ) : (
                      <Loader2 size={13} className="text-ink/35 animate-spin" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-ink/70 text-[11px] font-medium">{STUDIO_ANGLE_LABELS[result.angle]}</p>
                    <p className="text-ink/40 truncate text-[10px]">{result.error ?? result.status}</p>
                  </div>
                  {result.status === 'failed' ? (
                    <button
                      type="button"
                      onClick={() => void generate()}
                      className="text-ink/40 hover:bg-ink/5 grid size-7 place-items-center rounded-md"
                      aria-label="Retry"
                    >
                      <RotateCcw size={12} />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </Card>
        <p className="text-ink/35 flex items-center gap-1.5 text-[10px]">
          <Camera size={11} /> One generation per angle, all over the same reference list.
        </p>
      </div>
    </div>
  )
}
