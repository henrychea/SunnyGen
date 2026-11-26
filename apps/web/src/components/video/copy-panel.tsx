import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  MAX_COPY_FRAMES,
  frameTimes,
  framesWithinBudget,
  parseShotList,
  type FrameMode,
  type VideoCopyShot,
} from '@sunnygen/core'
import {
  Badge,
  Button,
  Dialog,
  DialogSurface,
  Input,
  Label,
  Textarea,
  cn,
  motionFadeRise,
  motionFast,
  toast,
} from '@sunnygen/ui'
import { Check, Film, Link2, Loader2, RefreshCw, Scissors, Sparkles, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { ReferencePicker } from '~/components/home/reference-picker'
import { ModelCombobox } from '~/components/model-combobox'
import { setEditHandoff } from '~/lib/edit-handoff'
import { thumbSrcSet, thumbUrl } from '~/lib/media-thumbs'
import { sortModelChoices } from '~/lib/model-choices'
import type { ReferenceItem } from '~/lib/reference-images'
import { useModelChoices } from '~/lib/use-model-choices'
import { copyShotJobs } from '~/lib/video-copy'
import { videoDefinitions, videoModesFor } from '~/lib/video-flow'
import { submitGeneration } from '~/server/generation.functions'
import { createFolderFn } from '~/server/library.functions'
import { loadAgentStatus, loadMediaToolsStatus } from '~/server/settings.functions'
import type { CopyView } from '~/server/video-copy.server'
import {
  analyzeCopyFn,
  extractFramesFn,
  joinCopyFn,
  loadCopyFn,
  loadLatestCopyFn,
  probeSourceFn,
  saveCopyShotsFn,
} from '~/server/video-copy.functions'

const STEPS = ['Source', 'Frames', 'Analysis', 'Recreate'] as const

const SETTLED = new Set(['analyzed', 'generating', 'joining', 'done'])

function startingStep(view: CopyView | null): number {
  if (!view) return 1
  if (view.shots.length > 0 || SETTLED.has(view.copy.status)) return 4
  if (view.frames.length === 0) return 1
  return view.copy.status === 'failed' ? 3 : 2
}

const MODE_LABELS: Record<FrameMode, string> = {
  scene: 'Scene changes',
  every: 'Every N seconds',
  timestamps: 'Timestamps',
}

function parseTimestamps(text: string): number[] {
  return text
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isFinite(value) && value >= 0)
}

function frameItem(frame: { id: string; url: string; atSeconds: number | null }): ReferenceItem {
  return {
    id: frame.id,
    name: frame.atSeconds === null ? 'Frame' : `Frame @ ${frame.atSeconds.toFixed(1)}s`,
    url: frame.url,
    kind: 'image',
  }
}

function statusTone(status: string): 'neutral' | 'accent' | 'success' | 'warning' | 'error' {
  if (status === 'succeeded') return 'success'
  if (status === 'failed' || status === 'cancelled') return 'error'
  if (status === 'queued' || status === 'running') return 'accent'
  return 'neutral'
}

export function CopyPanel({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { choices, catalogOnly } = useModelChoices()
  const tools = useQuery({ queryKey: ['media-tools-status'], queryFn: () => loadMediaToolsStatus() })
  const agents = useQuery({ queryKey: ['agent-status'], queryFn: () => loadAgentStatus() })

  const [source, setSource] = useState<ReferenceItem | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [mode, setMode] = useState<FrameMode>('scene')
  const [everySeconds, setEverySeconds] = useState(10)
  const [timestampsText, setTimestampsText] = useState('')
  const [copyId, setCopyId] = useState<string | null>(null)
  const [agentId, setAgentId] = useState<string | null>(null)
  const [pasteText, setPasteText] = useState('')
  const [modelId, setModelId] = useState<string | null>(null)
  const [stylePrompt, setStylePrompt] = useState('')
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [stage, setStage] = useState<number | null>(null)
  const [freshCopy, setFreshCopy] = useState(false)
  const [sourceCleared, setSourceCleared] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const timestamps = useMemo(() => parseTimestamps(timestampsText), [timestampsText])

  const latest = useQuery({ queryKey: ['copy-latest'], queryFn: () => loadLatestCopyFn() })

  // A reload mid-batch finds its copy through the newest row, so the panel reopens on the stage
  // that row recorded instead of an empty source step. Starting a new copy opts out.
  const activeCopyId = copyId ?? (freshCopy ? null : (latest.data?.copy.id ?? null))

  const copyQuery = useQuery({
    queryKey: ['video-copy', activeCopyId],
    queryFn: () => loadCopyFn({ data: { copyId: activeCopyId ?? '' } }),
    enabled: Boolean(activeCopyId),
    refetchInterval: (query) => {
      const view = query.state.data
      const live = view?.shots.some((shot) => shot.status === 'queued' || shot.status === 'running')
      return live ? 3000 : false
    },
  })

  const view = copyQuery.data ?? null

  const restoredSource: ReferenceItem | null =
    source ??
    (!sourceCleared && view?.source
      ? { id: view.source.id, name: view.source.name ?? 'Source video', url: view.source.url, kind: 'video' }
      : null)

  const probe = useQuery({
    queryKey: ['copy-source', restoredSource?.id],
    queryFn: () => probeSourceFn({ data: { assetId: restoredSource?.id ?? '' } }),
    enabled: Boolean(restoredSource?.id),
  })

  const installed = agents.data?.filter((entry) => entry.installed) ?? []
  const agent = installed.find((entry) => entry.id === agentId) ?? installed[0] ?? null

  const framesModels = videoModesFor(videoDefinitions(sortModelChoices(choices, catalogOnly)), 'frames')
  const frameOptions = sortModelChoices(choices, catalogOnly).filter(
    (option) => option.definition && framesModels.some((model) => model.id === option.definition?.id),
  )
  const model = framesModels.find((entry) => entry.id === modelId) ?? framesModels[0] ?? null
  const price = frameOptions.find((option) => option.definition?.id === model?.id)?.price ?? null

  const step = stage ?? startingStep(view)

  const plannedCount = useMemo(() => {
    const duration = probe.data?.durationSeconds
    if (mode === 'scene' || !duration) return null
    return frameTimes({ mode, durationSeconds: duration, everySeconds, timestamps }).length
  }, [mode, probe.data?.durationSeconds, everySeconds, timestamps])

  const effectiveShots = useMemo(
    () =>
      (view?.shots ?? []).map((entry, index) => ({
        ...entry.shot,
        prompt: drafts[index] ?? entry.shot.prompt,
      })),
    [view, drafts],
  )

  const budgetReason =
    mode !== 'scene' && plannedCount !== null && !framesWithinBudget(plannedCount)
      ? `That plan picks ${plannedCount} frames; the cap is ${MAX_COPY_FRAMES}. Widen the interval.`
      : null
  const extractBlocked =
    probe.data?.error ??
    (tools.data && !tools.data.ffmpeg
      ? 'ffmpeg is missing. Install it with apt install ffmpeg or brew install ffmpeg, then reload.'
      : budgetReason)

  const refresh = async () => {
    await Promise.all([
      copyQuery.refetch(),
      queryClient.invalidateQueries({ queryKey: ['video-wall'] }),
      queryClient.invalidateQueries({ queryKey: ['home-generations'] }),
      queryClient.invalidateQueries({ queryKey: ['gallery'] }),
    ])
  }

  const persist = async (
    shots: VideoCopyShot[],
    options: { status?: 'analyzed' | 'generating'; folderId?: string | null } = {},
  ) => {
    if (!view) return
    const result = await saveCopyShotsFn({
      data: { copyId: view.copy.id, shots, status: options.status, folderId: options.folderId },
    })
    if ('error' in result) setError(result.error)
    else {
      setDrafts({})
      await copyQuery.refetch()
    }
  }

  const extract = async () => {
    if (!restoredSource) return
    setBusy('extract')
    setError(null)
    setNotice(null)
    try {
      const result = await extractFramesFn({
        data: {
          sourceAssetId: restoredSource.id,
          mode,
          everySeconds: mode === 'every' ? everySeconds : undefined,
          timestamps: mode === 'timestamps' ? timestamps : undefined,
        },
      })
      setCopyId(result.copyId)
      setDrafts({})
      setStage(null)
      setNotice(`${result.frameAssetIds.length} frames extracted.`)
      await queryClient.invalidateQueries({ queryKey: ['gallery'] })
    } catch (extractError) {
      setError(extractError instanceof Error ? extractError.message : 'The extraction failed.')
    } finally {
      setBusy(null)
    }
  }

  const analyze = async (agentToUse: string) => {
    if (!view) return
    setBusy('analyze')
    setError(null)
    setNotice(null)
    try {
      const result = await analyzeCopyFn({
        data: { copyId: view.copy.id, agent: agentToUse as 'claude' | 'codex' | 'omp' | 'pi' },
      })
      if ('error' in result) setError(result.error)
      else {
        setAgentId(agentToUse)
        setStage(null)
        setNotice(`${result.shots.length} shots read from the frames.`)
        await copyQuery.refetch()
      }
    } catch (analyzeError) {
      setError(analyzeError instanceof Error ? analyzeError.message : 'The analysis failed.')
    } finally {
      setBusy(null)
    }
  }

  const savePastedList = async () => {
    if (!view) return
    const duration = view.durationSeconds
    if (duration === null) {
      setError('The source duration could not be read, so the pasted list cannot be checked.')
      return
    }
    const parsed = parseShotList(pasteText, duration)
    if ('error' in parsed) {
      setError(parsed.error)
      return
    }
    setError(null)
    setStage(null)
    await persist(parsed.shots)
    setPasteText('')
    setNotice(`${parsed.shots.length} shots pasted.`)
  }

  const recreate = async (onlyIndex?: number) => {
    if (!view || !model) return
    const frames = view.frames
      .filter((frame) => frame.atSeconds !== null)
      .map((frame) => ({ id: frame.id, atSeconds: frame.atSeconds as number }))
    const { error: jobError, jobs } = copyShotJobs({
      shots: effectiveShots,
      frames,
      stylePrompt,
    })
    if (jobError) {
      setError(jobError)
      return
    }

    const targets = jobs.filter((job) => {
      if (onlyIndex !== undefined && job.shotIndex !== onlyIndex) return false
      const status = view.shots[job.shotIndex]?.status
      return status === undefined || status === 'pending' || status === 'failed' || status === 'cancelled'
    })
    if (targets.length === 0) {
      setNotice('Every shot already has a clip.')
      return
    }

    setBusy(onlyIndex === undefined ? 'recreate' : `retry-${onlyIndex}`)
    setError(null)
    setNotice(null)
    const next = effectiveShots.map((shot) => ({ ...shot }))
    try {
      let folderId = view.copy.folderId
      if (targets.length > 1 && !folderId) {
        const folder = await createFolderFn({
          data: { name: `${view.source?.name ?? restoredSource?.name ?? 'Video'} copy` },
        })
        folderId = folder.id
      }

      await saveCopyShotsFn({
        data: { copyId: view.copy.id, shots: next, status: 'generating', folderId },
      })

      let failure: string | null = null
      for (const job of targets) {
        const current = next[job.shotIndex]
        if (!current) continue
        const result = await submitGeneration({
          data: {
            kind: 'video',
            model: model.id,
            prompt: job.prompt,
            assetIds: job.assetIds,
            folderId,
            params: { videoMode: 'frames' },
          },
        })
        if (result.generation.status === 'failed') {
          failure ??= `Shot ${job.shotIndex + 1}: ${result.generation.error ?? 'the provider refused it'}`
        } else {
          next[job.shotIndex] = { ...current, generationId: result.generation.id }
        }
        await saveCopyShotsFn({ data: { copyId: view.copy.id, shots: next, folderId } })
      }

      await refresh()
      if (failure) setError(failure)
      else setNotice(`${targets.length} ${targets.length === 1 ? 'shot' : 'shots'} queued on ${model.label}.`)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'The batch failed.')
      await saveCopyShotsFn({
        data: { copyId: view.copy.id, shots: next, status: 'analyzed' },
      }).catch(() => undefined)
    } finally {
      setBusy(null)
    }
  }

  const join = async () => {
    if (!view) return
    setBusy('join')
    setError(null)
    setNotice(null)
    try {
      const result = await joinCopyFn({ data: { copyId: view.copy.id } })
      if ('error' in result) setError(result.error)
      else {
        setNotice('The clips were joined.')
        toast('Copy joined', { tone: 'info' })
      }
      await refresh()
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : 'The join failed.')
    } finally {
      setBusy(null)
    }
  }

  const sendToEdit = (items: ReferenceItem[]) => {
    setEditHandoff(items)
    onClose()
    void navigate({ to: '/images' })
  }

  const allSucceeded =
    view !== null && view.shots.length > 0 && view.shots.every((shot) => shot.status === 'succeeded')
  const frameBytes = (view?.frames ?? []).reduce((total, frame) => total + (frame.byteSize ?? 0), 0)
  const message = error ?? notice ?? view?.copy.error ?? null

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      disablePointerDismissal={pickerOpen}
    >
      <DialogSurface className="flex h-[calc(100dvh-2rem)] w-[min(96vw,860px)] flex-col">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Dialog.Title className="font-display text-[16px] font-semibold">Copy a video</Dialog.Title>
            <p className="text-ink/65 mt-0.5 text-[11px]">
              Extract frames, edit them, read them into a shot list, then recreate each shot and join the
              clips.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ink/60 hover:bg-ink/5 grid size-8 shrink-0 place-items-center rounded-lg transition-colors"
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>

        <ol className="mt-3 flex flex-wrap items-center gap-1.5 text-[10.5px]">
          {STEPS.map((label, index) => {
            const number = index + 1
            const active = step === number
            const done = step > number
            return (
              <li
                key={label}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-2.5 py-1',
                  active
                    ? 'border-accent/45 text-accent bg-accent/[0.06]'
                    : done
                      ? 'border-line text-ink/70'
                      : 'border-line text-ink/45',
                )}
              >
                <span className="font-semibold">{number}</span>
                {label}
                {done ? <Check size={11} aria-hidden="true" /> : null}
              </li>
            )
          })}
        </ol>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
          {step === 1 ? (
            <section className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Source video</Label>
                {restoredSource ? (
                  <div className="border-line bg-canvas/50 flex items-center justify-between gap-2 rounded-xl border px-3 py-2">
                    <span className="text-ink truncate text-[12px]">{restoredSource.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSource(null)
                        setSourceCleared(true)
                      }}
                      className="text-ink/60 hover:text-ink text-[11px]"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
                    <Film size={13} aria-hidden="true" />
                    Pick a video
                  </Button>
                )}
                {probe.data?.error ? <p className="text-error text-[11px]">{probe.data.error}</p> : null}
                {probe.data?.durationSeconds ? (
                  <p className="text-ink/60 text-[11px]">
                    {probe.data.durationSeconds.toFixed(1)}s long, under the 600s limit.
                  </p>
                ) : null}
              </div>

              <fieldset className="flex flex-col gap-1.5">
                <legend className="text-ink/70 text-[11px] font-semibold tracking-[0.08em] uppercase">
                  Frames
                </legend>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(MODE_LABELS) as FrameMode[]).map((entry) => (
                    <button
                      key={entry}
                      type="button"
                      aria-pressed={mode === entry}
                      onClick={() => setMode(entry)}
                      className={cn(
                        'rounded-lg border px-2.5 py-1.5 text-[11.5px] transition-colors',
                        mode === entry
                          ? 'border-accent/50 bg-accent/[0.06] text-accent'
                          : 'border-line text-ink/70 hover:border-ink/25',
                      )}
                    >
                      {MODE_LABELS[entry]}
                    </button>
                  ))}
                </div>
              </fieldset>

              {mode === 'every' ? (
                <label className="flex flex-col gap-1">
                  <span className="text-ink/65 text-[11px]">Seconds between frames</span>
                  <Input
                    type="number"
                    min={1}
                    max={120}
                    value={everySeconds}
                    onChange={(event) => setEverySeconds(Number(event.target.value) || 10)}
                    className="w-24"
                  />
                </label>
              ) : null}

              {mode === 'timestamps' ? (
                <label className="flex flex-col gap-1">
                  <span className="text-ink/65 text-[11px]">Timestamps in seconds, comma separated</span>
                  <Input
                    value={timestampsText}
                    onChange={(event) => setTimestampsText(event.target.value)}
                    placeholder="0, 2.5, 6"
                  />
                </label>
              ) : null}

              <p className="text-ink/65 text-[11px]">
                {mode === 'scene'
                  ? `One frame per scene change, capped at ${MAX_COPY_FRAMES}.`
                  : plannedCount === null
                    ? 'Pick a source video to see the frame count.'
                    : `${plannedCount} ${plannedCount === 1 ? 'frame' : 'frames'} at this setting.`}
              </p>

              {extractBlocked ? <p className="text-error text-[11px]">{extractBlocked}</p> : null}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => void extract()}
                  loading={busy === 'extract'}
                  disabled={!restoredSource || Boolean(extractBlocked)}
                >
                  <Scissors size={13} aria-hidden="true" />
                  Extract frames
                </Button>
                {activeCopyId ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setCopyId(null)
                      setFreshCopy(true)
                      setSource(null)
                      setSourceCleared(false)
                      setDrafts({})
                      setStage(1)
                      setNotice(null)
                      setError(null)
                    }}
                  >
                    Start a new copy
                  </Button>
                ) : null}
              </div>
            </section>
          ) : null}

          {step === 2 && view ? (
            <section className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-ink/70 text-[11.5px]">
                  {view.frames.length} {view.frames.length === 1 ? 'frame' : 'frames'}
                  {frameBytes > 0 ? ` · ${(frameBytes / (1024 * 1024)).toFixed(1)} MB` : ''}
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => sendToEdit(view.frames.map(frameItem))}>
                    <Sparkles size={13} aria-hidden="true" />
                    Send all to Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setCopyId(null)
                      setFreshCopy(true)
                      setDrafts({})
                      setStage(null)
                      setNotice(null)
                    }}
                  >
                    <RefreshCw size={13} aria-hidden="true" />
                    Re-extract
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {view.frames.map((frame) => (
                  <figure key={frame.id} className="w-28">
                    <div className="border-line bg-canvas/40 relative overflow-hidden rounded-lg border">
                      <img
                        src={thumbUrl(frame.url, 320)}
                        srcSet={thumbSrcSet(frame.url, [160, 320, 640])}
                        sizes="112px"
                        alt={frame.atSeconds === null ? 'Frame' : `Frame at ${frame.atSeconds}s`}
                        loading="lazy"
                        decoding="async"
                        className="aspect-video w-full object-cover"
                      />
                    </div>
                    <figcaption className="mt-1 flex items-center justify-between text-[10px]">
                      <span className="text-ink/65">
                        {frame.atSeconds === null ? 'unknown' : `${frame.atSeconds.toFixed(1)}s`}
                      </span>
                      <button
                        type="button"
                        onClick={() => sendToEdit([frameItem(frame)])}
                        className="text-accent hover:underline"
                      >
                        Edit
                      </button>
                    </figcaption>
                  </figure>
                ))}
              </div>

              <div>
                <Button size="sm" onClick={() => setStage(3)}>
                  <Sparkles size={13} aria-hidden="true" />
                  Continue to the shot list
                </Button>
              </div>
            </section>
          ) : null}

          {step === 3 && view ? (
            <section className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Agent</Label>
                {installed.length === 0 ? (
                  <p className="text-ink/65 text-[11.5px]">
                    No agent CLI is installed. Install Claude Code, Codex, OMP, or Pi, or paste a shot list
                    below.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {installed.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        aria-pressed={agent?.id === entry.id}
                        onClick={() => setAgentId(entry.id)}
                        className={cn(
                          'rounded-lg border px-2.5 py-1.5 text-[11.5px] transition-colors',
                          agent?.id === entry.id
                            ? 'border-accent/50 bg-accent/[0.06] text-accent'
                            : 'border-line text-ink/70 hover:border-ink/25',
                        )}
                      >
                        {entry.label}
                      </button>
                    ))}
                  </div>
                )}
                <div className="mt-1">
                  <Button
                    size="sm"
                    disabled={!agent}
                    loading={busy === 'analyze'}
                    onClick={() => {
                      if (agent) void analyze(agent.id)
                    }}
                  >
                    <Sparkles size={13} aria-hidden="true" />
                    Read the frames
                  </Button>
                </div>
                {agents.data && agents.data.length > 0 && installed.length === 0 ? (
                  <p className="text-ink/60 text-[11px]">
                    Install one: Claude Code, Codex CLI, OMP, or Pi. Then reload this panel.
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Paste a shot list</Label>
                <Textarea
                  value={pasteText}
                  onChange={(event) => setPasteText(event.target.value)}
                  rows={6}
                  placeholder={
                    '{"shots":[{"start":0,"end":3,"subject":"…","action":"…","motion":"…","camera":"…","lighting":"…","prompt":"…"}]}'
                  }
                  className="font-mono text-[11px]"
                />
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void savePastedList()}
                    disabled={!pasteText.trim()}
                  >
                    Use this list
                  </Button>
                </div>
              </div>
            </section>
          ) : null}

          {step === 4 && view ? (
            <section className="flex flex-col gap-3">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] border-separate border-spacing-y-1 text-[11.5px]">
                  <thead className="text-ink/55 text-left text-[10px] tracking-[0.08em] uppercase">
                    <tr>
                      <th className="px-1.5 py-1">#</th>
                      <th className="px-1.5 py-1">Time</th>
                      <th className="px-1.5 py-1">Subject</th>
                      <th className="px-1.5 py-1">Camera</th>
                      <th className="px-1.5 py-1">Lighting</th>
                      <th className="px-1.5 py-1">Prompt</th>
                      <th className="px-1.5 py-1">State</th>
                      <th className="px-1.5 py-1" />
                    </tr>
                  </thead>
                  <tbody>
                    {view.shots.map((entry, index) => {
                      const shot = effectiveShots[index] ?? entry.shot
                      const retrying = busy === `retry-${index}`
                      return (
                        <tr key={`${entry.shot.start}-${index}`} className="align-top">
                          <td className="text-ink/60 px-1.5 py-1">{index + 1}</td>
                          <td className="text-ink/70 px-1.5 py-1 whitespace-nowrap">
                            {shot.start.toFixed(1)}–{shot.end.toFixed(1)}s
                          </td>
                          <td className="text-ink/70 max-w-28 px-1.5 py-1">{shot.subject}</td>
                          <td className="text-ink/70 max-w-28 px-1.5 py-1">{shot.camera}</td>
                          <td className="text-ink/70 max-w-28 px-1.5 py-1">{shot.lighting}</td>
                          <td className="px-1.5 py-1">
                            <textarea
                              value={shot.prompt}
                              onChange={(event) =>
                                setDrafts((current) => ({ ...current, [index]: event.target.value }))
                              }
                              onBlur={() => {
                                const draft = drafts[index]
                                if (draft === undefined || draft === entry.shot.prompt) return
                                const next = effectiveShots.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, prompt: draft } : item,
                                )
                                void persist(next)
                              }}
                              rows={3}
                              aria-label={`Prompt for shot ${index + 1}`}
                              className="border-line bg-surface text-ink focus-visible:border-accent/45 w-full min-w-40 resize-y rounded-lg border px-2 py-1 text-[11px] leading-snug outline-none"
                            />
                          </td>
                          <td className="px-1.5 py-1">
                            <Badge tone={statusTone(entry.status)}>{entry.status}</Badge>
                            {entry.error ? (
                              <p className="text-error mt-1 max-w-32 text-[10px]">{entry.error}</p>
                            ) : null}
                          </td>
                          <td className="px-1.5 py-1 whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              {entry.status === 'failed' || entry.status === 'cancelled' ? (
                                <button
                                  type="button"
                                  disabled={retrying}
                                  onClick={() => void recreate(index)}
                                  className="text-accent text-[10.5px] hover:underline disabled:opacity-50"
                                >
                                  {retrying ? 'Retrying…' : 'Retry'}
                                </button>
                              ) : null}
                              <button
                                type="button"
                                aria-label={`Remove shot ${index + 1}`}
                                onClick={() => {
                                  const next = effectiveShots.filter(
                                    (_item, itemIndex) => itemIndex !== index,
                                  )
                                  void persist(next)
                                }}
                                className="text-ink/50 hover:text-error text-[10.5px]"
                              >
                                Remove
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="border-line flex flex-col gap-2 rounded-xl border px-3 py-2.5">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-52 flex-1">
                    <Label>Model</Label>
                    <ModelCombobox
                      value={model?.id ?? null}
                      options={frameOptions}
                      ariaLabel="Video copy model"
                      onChange={(entry) => setModelId(entry.modelId)}
                    />
                  </div>
                  <div className="min-w-52 flex-[2]">
                    <Label>Style clause</Label>
                    <Input
                      value={stylePrompt}
                      onChange={(event) => setStylePrompt(event.target.value)}
                      placeholder="warm film, 35mm, natural light"
                    />
                  </div>
                </div>
                <p className="text-ink/65 text-[11px]">
                  {view.shots.length} {view.shots.length === 1 ? 'shot' : 'shots'}, {view.shots.length}{' '}
                  {view.shots.length === 1 ? 'generation' : 'generations'}, {model?.label ?? 'no model'}
                  {price ? ` · ${price}` : ''}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    disabled={!model}
                    loading={busy === 'recreate'}
                    onClick={() => void recreate()}
                  >
                    <Sparkles size={13} aria-hidden="true" />
                    Recreate
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!allSucceeded}
                    loading={busy === 'join'}
                    onClick={() => void join()}
                  >
                    <Link2 size={13} aria-hidden="true" />
                    Join clips
                  </Button>
                  {allSucceeded && !view.copy.outputAssetId ? (
                    <p className="text-ink/60 text-[11px]">Every shot is ready. Join them into one clip.</p>
                  ) : null}
                </div>
              </div>

              {view.copy.outputAssetId ? (
                <div className="border-line rounded-xl border p-2">
                  <p className="text-ink/70 mb-1 text-[11px]">Joined clip</p>
                  <video
                    src={`/api/media/${view.copy.outputAssetId}`}
                    controls
                    preload="metadata"
                    className="w-full rounded-lg"
                  />
                </div>
              ) : null}
            </section>
          ) : null}

          {copyQuery.isFetching && step > 1 ? (
            <p className="text-ink/50 mt-2 flex items-center gap-1.5 text-[10.5px]">
              <Loader2 size={11} className="animate-spin" aria-hidden="true" />
              Reading the copy…
            </p>
          ) : null}

          <AnimatePresence initial={false} mode="wait">
            {message ? (
              <motion.p
                key={message}
                variants={motionFadeRise}
                initial="hidden"
                animate="visible"
                exit="hidden"
                transition={motionFast}
                className={cn('mt-2 text-[11px]', error || view?.copy.error ? 'text-error' : 'text-ink/65')}
              >
                {message}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>

        {pickerOpen && !source ? (
          <ReferencePicker
            title="Pick a source video"
            kind="video"
            allowAvatars={false}
            existingIds={[]}
            max={1}
            onClose={() => setPickerOpen(false)}
            onConfirm={(items) => {
              const picked = items[0]
              setSource(picked ?? null)
              setPickerOpen(false)
            }}
          />
        ) : null}
      </DialogSurface>
    </Dialog.Root>
  )
}
