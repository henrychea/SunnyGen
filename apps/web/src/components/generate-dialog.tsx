import { IMAGE_MODELS, PROVIDERS, VIDEO_MODELS, type ModelDefinition, type ProviderId } from '@sunnygen/core'
import {
  Badge,
  Button,
  Dialog,
  DialogSurface,
  FadeImage,
  Input,
  Label,
  Select,
  Textarea,
  cn,
  motionFade,
  motionFast,
  motionSpring,
  toast,
} from '@sunnygen/ui'
import { FolderOpen, ImagePlus, Loader2, Play, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useRef, useState } from 'react'
import { MediaPicker } from './media-picker'
import { ModelCombobox } from './model-combobox'
import { thumbSrcSet, thumbUrl } from '~/lib/media-thumbs'
import { getGenerationView, submitGeneration } from '~/server/generation.functions'
import { useModelChoices } from '~/lib/use-model-choices'

type Phase = 'idle' | 'submitting' | 'running' | 'failed'

export interface GenerateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onGenerated: () => void
  initialKind?: 'image' | 'video'
}

export function GenerateDialog({
  open,
  onOpenChange,
  onGenerated,
  initialKind = 'image',
}: GenerateDialogProps) {
  const initialVideoModel = VIDEO_MODELS[0]
  const [kind, setKind] = useState<'image' | 'video'>(initialKind)
  const [prompt, setPrompt] = useState('')
  const [modelId, setModelId] = useState(
    initialKind === 'image' ? (IMAGE_MODELS[0]?.id ?? '') : (initialVideoModel?.id ?? ''),
  )
  const [provider, setProvider] = useState<'auto' | ProviderId>('auto')
  const [aspectRatio, setAspectRatio] = useState(
    initialKind === 'video' ? (initialVideoModel?.defaultRatio ?? '16:9') : '1:1',
  )
  const [quality, setQuality] = useState(IMAGE_MODELS[0]?.defaultQuality ?? '1k')
  const [durationSeconds, setDurationSeconds] = useState(initialVideoModel?.defaultDuration ?? 5)
  const [resolution, setResolution] = useState(initialVideoModel?.defaultResolution ?? '720p')
  const [sound, setSound] = useState(initialVideoModel?.sound ?? true)
  const [mode, setMode] = useState(initialVideoModel?.defaultMode ?? '')
  const [assetIds, setAssetIds] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [link, setLink] = useState('')
  const [importing, setImporting] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [generationId, setGenerationId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const pollToken = useRef(0)
  const { choices, catalogOnly } = useModelChoices()
  const allChoices = [...choices, ...catalogOnly]

  const models = kind === 'image' ? IMAGE_MODELS : VIDEO_MODELS
  const modelOptions = allChoices.filter((entry) => entry.kind === kind)
  const model: ModelDefinition | undefined =
    modelOptions.find((entry) => entry.modelId === modelId)?.definition ??
    models.find((entry) => entry.id === modelId) ??
    models[0]
  const selectedChoice = modelOptions.find((entry) => entry.modelId === model?.id)

  const resetSession = () => {
    pollToken.current += 1
    setPhase('idle')
    setError(null)
    setGenerationId(null)
  }

  const closeDialog = () => {
    resetSession()
    onOpenChange(false)
  }

  const changeKind = (next: 'image' | 'video') => {
    setKind(next)
    const reset = next === 'image' ? IMAGE_MODELS[0] : VIDEO_MODELS[0]
    if (!reset) return
    setModelId(reset.id)
    setProvider('auto')
    setAssetIds([])
    if (reset.kind === 'image') {
      setAspectRatio(reset.ratios.includes('1:1') ? '1:1' : (reset.ratios[0] ?? '1:1'))
      setQuality(reset.defaultQuality)
    } else {
      setAspectRatio(reset.defaultRatio)
      setDurationSeconds(reset.defaultDuration)
      setResolution(reset.defaultResolution)
      setSound(reset.sound)
      setMode(reset.defaultMode)
    }
  }

  const changeModel = (id: string) => {
    const next =
      modelOptions.find((entry) => entry.modelId === id)?.definition ??
      models.find((entry) => entry.id === id)
    if (!next) return
    setModelId(next.id)
    setProvider('auto')
    if (next.kind === 'image') {
      setAspectRatio(next.ratios.includes('1:1') ? '1:1' : (next.ratios[0] ?? '1:1'))
      setQuality(next.defaultQuality)
    } else {
      setAspectRatio(next.defaultRatio)
      setDurationSeconds(next.defaultDuration)
      setResolution(next.defaultResolution)
      setSound(next.sound)
      setMode(next.defaultMode)
    }
  }

  const upload = async (files: FileList) => {
    if (!files.length || !model) return
    setUploading(true)
    setError(null)
    try {
      const next: string[] = []
      for (const file of Array.from(files).slice(0, model.maxImages - assetIds.length)) {
        const form = new FormData()
        form.set('file', file)
        const response = await fetch('/api/upload', { method: 'POST', body: form })
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null
          throw new Error(payload?.error ?? 'Upload failed')
        }
        const payload = (await response.json()) as {
          asset?: { id?: string; name?: string | null }
        }
        const uploadedName = payload.asset?.name ?? file.name
        toast(uploadedName === file.name ? `Uploaded ${uploadedName}` : `Uploaded as ${uploadedName}`, {
          tone: 'info',
        })
        if (payload.asset?.id) next.push(payload.asset.id)
      }
      setAssetIds((current) => [...current, ...next])
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : 'Upload failed'
      setError(message)
      toast(message, { tone: 'error' })
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const poll = async (id: string, token: number) => {
    for (let attempt = 0; attempt < 720; attempt += 1) {
      if (pollToken.current !== token) return
      await new Promise((resolve) => setTimeout(resolve, 2_500))
      if (pollToken.current !== token) return
      const view = await getGenerationView({ data: { id } })
      if (!view) {
        setError('Generation disappeared')
        setPhase('failed')
        return
      }
      if (view.generation.status === 'succeeded') {
        setPhase('idle')
        setGenerationId(null)
        onGenerated()
        closeDialog()
        return
      }
      if (view.generation.status === 'failed') {
        const message = view.generation.error ?? 'Generation failed'
        setError(message)
        toast(message, { tone: 'error' })
        setPhase('failed')
        return
      }
      if (view.generation.status === 'cancelled') {
        setError('Generation canceled')
        setPhase('failed')
        return
      }
    }
    setError('Generation timed out')
    setPhase('failed')
  }

  const generate = async () => {
    if (!model) return
    if (!prompt.trim()) {
      setError('Write a prompt first.')
      return
    }
    setPhase('submitting')
    setError(null)
    const token = pollToken.current + 1
    pollToken.current = token
    try {
      const view = await submitGeneration({
        data: {
          kind,
          model: model.id,
          prompt: prompt.trim(),
          assetIds,
          provider: provider === 'auto' ? undefined : provider,
          params: {
            aspectRatio,
            quality: model.kind === 'image' ? quality : undefined,
            durationSeconds: model.kind === 'video' ? durationSeconds : undefined,
            resolution: model.kind === 'video' ? resolution : undefined,
            sound: model.kind === 'video' ? sound : undefined,
            mode: model.kind === 'video' ? mode : undefined,
          },
        },
      })
      if (view.generation.status === 'failed') {
        const message = view.generation.error ?? 'Generation failed'
        setError(message)
        toast(message, { tone: 'error' })
        setPhase('failed')
        return
      }
      if (view.generation.status === 'succeeded') {
        onGenerated()
        closeDialog()
        return
      }
      setGenerationId(view.generation.id)
      setPhase('running')
      toast('Generation started', { tone: 'info' })
      void poll(view.generation.id, token)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Generation failed')
      setPhase('failed')
    }
  }

  const busy = phase === 'submitting' || phase === 'running'

  return (
    <>
      <Dialog.Root
        open={open}
        onOpenChange={(next) => {
          if (!next) resetSession()
          onOpenChange(next)
        }}
      >
        <DialogSurface className="w-[min(94vw,660px)] p-0">
          <div className="border-line flex items-center justify-between border-b px-5 py-3.5">
            <div>
              <Dialog.Title className="font-display text-[16px] font-semibold tracking-tight">
                New render
              </Dialog.Title>
              <p className="text-ink/65 mt-0.5 text-[11px]">
                One prompt, one generation, straight into the gallery.
              </p>
            </div>
            <button
              type="button"
              onClick={closeDialog}
              className="text-ink/65 hover:bg-ink/5 hover:text-ink grid size-8 place-items-center rounded-lg transition-[color,background-color,scale] duration-150 ease-out active:scale-[0.94] motion-reduce:active:scale-100"
              aria-label="Close"
              title="Close"
            >
              <X size={15} />
            </button>
          </div>

          <div className="grid gap-4 p-5">
            <div className="flex items-center gap-2">
              <div className="border-line-strong bg-canvas inline-flex rounded-xl border p-0.5">
                {(['image', 'video'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    disabled={busy}
                    onClick={() => changeKind(option)}
                    className={cn(
                      'relative rounded-[10px] px-3 py-1.5 text-[11.5px] font-medium capitalize transition-colors duration-150 ease-out active:scale-[0.96] disabled:opacity-60 motion-reduce:active:scale-100',
                      kind === option ? 'text-canvas' : 'text-ink/65 hover:text-ink',
                    )}
                  >
                    {kind === option ? (
                      <motion.span
                        layoutId="generate-kind-pill"
                        transition={motionSpring}
                        className="bg-ink absolute inset-0 rounded-[10px]"
                      />
                    ) : null}
                    <span className="relative">{option}</span>
                  </button>
                ))}
              </div>
              <AnimatePresence mode="wait" initial={false}>
                {model ? (
                  <motion.span
                    key={selectedChoice?.price ?? model.price}
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -3 }}
                    transition={motionFast}
                    className="inline-flex"
                  >
                    <Badge tone="neutral">{selectedChoice?.price ?? model.price}</Badge>
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Model</Label>
                <ModelCombobox
                  value={model?.id ?? ''}
                  options={modelOptions}
                  disabled={busy}
                  onChange={(entry) => {
                    if (entry.modelId) changeModel(entry.modelId)
                  }}
                />
              </div>
              <label className="flex flex-col gap-1.5">
                <Label>Provider</Label>
                <Select
                  value={provider}
                  onChange={(event) => setProvider(event.target.value as 'auto' | ProviderId)}
                  disabled={busy}
                >
                  <option value="auto">Auto (first configured)</option>
                  {(model?.providers ?? []).map((id) => (
                    <option key={id} value={id}>
                      {PROVIDERS.find((entry) => entry.id === id)?.label ?? id}
                    </option>
                  ))}
                </Select>
              </label>
            </div>

            <label className="flex flex-col gap-1.5">
              <Label>Prompt</Label>
              <Textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Describe the image or shot…"
                className="min-h-28"
                disabled={busy}
              />
            </label>

            <div className="grid gap-2 sm:grid-cols-3">
              <AnimatePresence initial={false}>
                <motion.label
                  key="ratio"
                  layout
                  variants={motionFade}
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                  className="flex flex-col gap-1.5"
                >
                  <Label>Ratio</Label>
                  <Select
                    value={aspectRatio}
                    onChange={(event) => setAspectRatio(event.target.value)}
                    disabled={busy}
                  >
                    {(model?.ratios ?? []).map((ratio) => (
                      <option key={ratio} value={ratio}>
                        {ratio}
                      </option>
                    ))}
                  </Select>
                </motion.label>

                {model?.kind === 'image' && model.supportsQuality ? (
                  <motion.label
                    key="quality"
                    layout
                    variants={motionFade}
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    className="flex flex-col gap-1.5"
                  >
                    <Label>Quality</Label>
                    <Select
                      value={quality}
                      onChange={(event) => setQuality(event.target.value)}
                      disabled={busy}
                    >
                      {model.qualityOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </Select>
                  </motion.label>
                ) : null}

                {model?.kind === 'video' ? (
                  <motion.label
                    key="seconds"
                    layout
                    variants={motionFade}
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    className="flex flex-col gap-1.5"
                  >
                    <Label>Seconds</Label>
                    <Select
                      value={String(durationSeconds)}
                      onChange={(event) => setDurationSeconds(Number(event.target.value))}
                      disabled={busy}
                    >
                      {model.durations.map((duration) => (
                        <option key={duration} value={duration}>
                          {duration}s
                        </option>
                      ))}
                    </Select>
                  </motion.label>
                ) : null}

                {model?.kind === 'video' && model.resolutions.length > 0 ? (
                  <motion.label
                    key="resolution"
                    layout
                    variants={motionFade}
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    className="flex flex-col gap-1.5"
                  >
                    <Label>Resolution</Label>
                    <Select
                      value={resolution}
                      onChange={(event) => setResolution(event.target.value)}
                      disabled={busy}
                    >
                      {model.resolutions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </Select>
                  </motion.label>
                ) : null}

                {model?.kind === 'video' && model.modes.length > 0 ? (
                  <motion.label
                    key="mode"
                    layout
                    variants={motionFade}
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    className="flex flex-col gap-1.5"
                  >
                    <Label>Mode</Label>
                    <Select value={mode} onChange={(event) => setMode(event.target.value)} disabled={busy}>
                      {model.modes.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </motion.label>
                ) : null}
              </AnimatePresence>
            </div>

            {model?.kind === 'video' && model.sound ? (
              <label className="text-ink/65 flex items-center gap-2 text-[11.5px]">
                <input
                  type="checkbox"
                  checked={sound}
                  disabled={busy}
                  onChange={(event) => setSound(event.target.checked)}
                  className="accent-accent"
                />
                Generate audio
              </label>
            ) : null}

            {model?.supportsImages ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label>References</Label>
                  <span className="text-ink/65 text-[11px]">
                    <AnimatePresence mode="popLayout" initial={false}>
                      <motion.span
                        key={`${assetIds.length}/${model.maxImages}`}
                        initial={{ opacity: 0, y: 3 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -3 }}
                        transition={motionFast}
                        className="inline-block"
                      >
                        {assetIds.length}/{model.maxImages}
                      </motion.span>
                    </AnimatePresence>
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <AnimatePresence initial={false}>
                    {assetIds.map((assetId) => (
                      <motion.div
                        key={assetId}
                        layout
                        initial={{ opacity: 0, scale: 0.92 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.92 }}
                        transition={motionFast}
                        className="border-line-strong group relative overflow-hidden rounded-lg border"
                      >
                        <FadeImage
                          shimmer
                          src={thumbUrl(`/api/media/${assetId}`, 160)}
                          srcSet={thumbSrcSet(`/api/media/${assetId}`, [160, 320])}
                          sizes="56px"
                          alt=""
                          decoding="async"
                          className="size-14 object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setAssetIds((current) => current.filter((id) => id !== assetId))}
                          className="bg-ink/70 text-canvas absolute top-0.5 right-0.5 grid size-6 place-items-center rounded opacity-0 transition-[opacity,scale] duration-150 ease-out group-hover:opacity-100 focus-visible:opacity-100 active:scale-[0.9]"
                          aria-label="Remove reference"
                        >
                          <X size={9} />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  <AnimatePresence initial={false}>
                    {assetIds.length < model.maxImages ? (
                      <motion.div
                        key="reference-tiles"
                        initial={{ opacity: 0, scale: 0.92 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.92 }}
                        transition={motionFast}
                        className="flex gap-2"
                      >
                        <button
                          type="button"
                          onClick={() => fileRef.current?.click()}
                          disabled={busy || uploading}
                          className="border-line-strong text-ink/65 hover:border-accent/40 hover:text-accent grid size-14 place-items-center rounded-lg border border-dashed transition-[color,border-color,scale] duration-150 ease-out active:scale-[0.94] motion-reduce:active:scale-100"
                          aria-label="Upload reference"
                        >
                          <AnimatePresence mode="wait" initial={false}>
                            <motion.span
                              key={uploading ? 'uploading' : 'idle'}
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.8 }}
                              transition={motionFast}
                              className="inline-flex"
                            >
                              {uploading ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : (
                                <ImagePlus size={16} />
                              )}
                            </motion.span>
                          </AnimatePresence>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPickerOpen(true)}
                          disabled={busy}
                          className="border-line-strong text-ink/65 hover:border-accent/40 hover:text-accent grid size-14 place-items-center rounded-lg border border-dashed transition-[color,border-color,scale] duration-150 ease-out active:scale-[0.94] motion-reduce:active:scale-100"
                          aria-label="Choose from library"
                        >
                          <FolderOpen size={16} />
                        </button>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    if (event.target.files) void upload(event.target.files)
                  }}
                />
                <div className="flex gap-2">
                  <Input
                    value={link}
                    onChange={(event) => setLink(event.target.value)}
                    placeholder="Paste an Instagram, TikTok, or X link"
                    className="h-8 text-[11.5px]"
                    disabled={busy || importing}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    loading={importing}
                    disabled={!link.trim() || busy}
                    onClick={async () => {
                      if (!model || !link.trim()) return
                      setImporting(true)
                      setError(null)
                      try {
                        const response = await fetch('/api/social/resolve', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ url: link.trim() }),
                        })
                        const payload = (await response.json()) as {
                          assets?: Array<{ id: string }>
                          error?: string
                        }
                        if (!response.ok) throw new Error(payload.error ?? 'Import failed')
                        const ids = (payload.assets ?? [])
                          .map((asset) => asset.id)
                          .slice(0, model.maxImages - assetIds.length)
                        setAssetIds((current) => [...current, ...ids])
                        setLink('')
                      } catch (importError) {
                        setError(importError instanceof Error ? importError.message : 'Import failed')
                      } finally {
                        setImporting(false)
                      }
                    }}
                  >
                    Import
                  </Button>
                </div>
              </div>
            ) : null}

            <AnimatePresence initial={false}>
              {error ? (
                <motion.p
                  key="generate-error"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={motionFast}
                  className="border-error/20 bg-error/5 text-error overflow-hidden rounded-lg border px-3 py-2 text-[11.5px] leading-snug"
                >
                  {error}
                </motion.p>
              ) : null}
            </AnimatePresence>

            <div className="flex items-center justify-between gap-3">
              <p className="text-ink/65 text-[11px]">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={busy ? 'busy' : 'idle'}
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -3 }}
                    transition={motionFast}
                    className="inline-block"
                  >
                    {busy
                      ? 'Generation runs on your provider account.'
                      : 'Uses your configured provider key.'}
                  </motion.span>
                </AnimatePresence>
              </p>
              <div className="flex items-center gap-2">
                <AnimatePresence initial={false}>
                  {generationId && busy ? (
                    <motion.div
                      key="stop-waiting"
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      transition={motionFast}
                      className="overflow-hidden"
                    >
                      <Button
                        variant="ghost"
                        onClick={() => {
                          pollToken.current += 1
                          setPhase('idle')
                          setError('Canceled')
                        }}
                      >
                        Stop waiting
                      </Button>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
                <Button onClick={() => void generate()} loading={busy} disabled={!prompt.trim()}>
                  <Play size={13} /> {busy ? 'Generating…' : 'Generate'}
                </Button>
              </div>
            </div>
          </div>
        </DialogSurface>
      </Dialog.Root>
      <MediaPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        kind="image"
        multiple
        onSelect={(ids) => setAssetIds((current) => [...current, ...ids].slice(0, model?.maxImages ?? 1))}
      />
    </>
  )
}
