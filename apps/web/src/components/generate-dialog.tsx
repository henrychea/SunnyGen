import { IMAGE_MODELS, PROVIDERS, VIDEO_MODELS, type ModelDefinition, type ProviderId } from '@sunnygen/core'
import { Badge, Button, Dialog, DialogSurface, Input, Label, Select, Textarea, cn } from '@sunnygen/ui'
import { FolderOpen, ImagePlus, Loader2, Sparkles, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { MediaPicker } from './media-picker'
import { getGenerationView, submitGeneration } from '~/server/generation.functions'

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
  const [kind, setKind] = useState<'image' | 'video'>(initialKind)
  const [prompt, setPrompt] = useState('')
  const [modelId, setModelId] = useState(IMAGE_MODELS[0]?.id ?? '')
  const [provider, setProvider] = useState<'auto' | ProviderId>('auto')
  const [aspectRatio, setAspectRatio] = useState('1:1')
  const [quality, setQuality] = useState('1k')
  const [durationSeconds, setDurationSeconds] = useState(5)
  const [resolution, setResolution] = useState('720p')
  const [sound, setSound] = useState(true)
  const [mode, setMode] = useState('')
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

  const models = kind === 'image' ? IMAGE_MODELS : VIDEO_MODELS
  const model: ModelDefinition | undefined = models.find((entry) => entry.id === modelId) ?? models[0]

  useEffect(() => {
    if (!open) return
    setPhase('idle')
    setError(null)
    setGenerationId(null)
  }, [open])

  useEffect(() => {
    const reset = kind === 'image' ? IMAGE_MODELS[0] : VIDEO_MODELS[0]
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
  }, [kind])

  useEffect(() => {
    if (!open) {
      pollToken.current += 1
    }
  }, [open])

  const changeModel = (id: string) => {
    const next = models.find((entry) => entry.id === id)
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
        const payload = (await response.json()) as { asset?: { id?: string } }
        if (payload.asset?.id) next.push(payload.asset.id)
      }
      setAssetIds((current) => [...current, ...next])
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed')
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
        onOpenChange(false)
        return
      }
      if (view.generation.status === 'failed') {
        setError(view.generation.error ?? 'Generation failed')
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
        setError(view.generation.error ?? 'Generation failed')
        setPhase('failed')
        return
      }
      if (view.generation.status === 'succeeded') {
        onGenerated()
        onOpenChange(false)
        return
      }
      setGenerationId(view.generation.id)
      setPhase('running')
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
          if (!next && busy) {
            pollToken.current += 1
            setPhase('idle')
          }
          onOpenChange(next)
        }}
      >
        <DialogSurface className="w-[min(94vw,660px)] p-0">
          <div className="border-line flex items-center justify-between border-b px-5 py-3.5">
            <div>
              <Dialog.Title className="font-display text-[16px] font-semibold tracking-tight">
                New render
              </Dialog.Title>
              <p className="text-ink/40 mt-0.5 text-[11px]">
                One prompt, one generation, straight into the gallery.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="text-ink/40 hover:bg-ink/5 hover:text-ink grid size-8 place-items-center rounded-lg"
              aria-label="Close"
            >
              <X size={15} />
            </button>
          </div>

          <div className="grid gap-4 p-5">
            <div className="flex items-center gap-2">
              <div className="border-line bg-canvas inline-flex rounded-xl border p-0.5">
                {(['image', 'video'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    disabled={busy}
                    onClick={() => setKind(option)}
                    className={cn(
                      'rounded-[10px] px-3 py-1.5 text-[11.5px] font-medium capitalize',
                      kind === option ? 'bg-ink text-canvas' : 'text-ink/50',
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
              {model ? <Badge tone="neutral">{model.price}</Badge> : null}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <Label>Model</Label>
                <Select
                  value={model?.id ?? ''}
                  onChange={(event) => changeModel(event.target.value)}
                  disabled={busy}
                >
                  {models.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label} · {entry.providerLabel}
                    </option>
                  ))}
                </Select>
              </label>
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
              <label className="flex flex-col gap-1.5">
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
              </label>

              {model?.kind === 'image' && model.supportsQuality ? (
                <label className="flex flex-col gap-1.5">
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
                </label>
              ) : null}

              {model?.kind === 'video' ? (
                <>
                  <label className="flex flex-col gap-1.5">
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
                  </label>
                  {model.resolutions.length > 0 ? (
                    <label className="flex flex-col gap-1.5">
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
                    </label>
                  ) : null}
                  {model.modes.length > 0 ? (
                    <label className="flex flex-col gap-1.5">
                      <Label>Mode</Label>
                      <Select value={mode} onChange={(event) => setMode(event.target.value)} disabled={busy}>
                        {model.modes.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </label>
                  ) : null}
                </>
              ) : null}
            </div>

            {model?.kind === 'video' && model.sound ? (
              <label className="text-ink/55 flex items-center gap-2 text-[11.5px]">
                <input
                  type="checkbox"
                  checked={sound}
                  disabled={busy}
                  onChange={(event) => setSound(event.target.checked)}
                  className="accent-[#A31621]"
                />
                Generate audio
              </label>
            ) : null}

            {model?.supportsImages ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label>References</Label>
                  <span className="text-ink/35 text-[10px]">
                    {assetIds.length}/{model.maxImages}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {assetIds.map((assetId) => (
                    <div
                      key={assetId}
                      className="border-line group relative overflow-hidden rounded-lg border"
                    >
                      <img src={`/api/media/${assetId}`} alt="" className="size-14 object-cover" />
                      <button
                        type="button"
                        onClick={() => setAssetIds((current) => current.filter((id) => id !== assetId))}
                        className="bg-ink/70 text-canvas absolute right-0.5 top-0.5 grid size-4 place-items-center rounded opacity-0 group-hover:opacity-100"
                        aria-label="Remove reference"
                      >
                        <X size={9} />
                      </button>
                    </div>
                  ))}
                  {assetIds.length < model.maxImages ? (
                    <>
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        disabled={busy || uploading}
                        className="border-line text-ink/35 hover:border-accent/40 hover:text-accent grid size-14 place-items-center rounded-lg border border-dashed"
                        aria-label="Upload reference"
                      >
                        {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPickerOpen(true)}
                        disabled={busy}
                        className="border-line text-ink/35 hover:border-accent/40 hover:text-accent grid size-14 place-items-center rounded-lg border border-dashed"
                        aria-label="Choose from library"
                      >
                        <FolderOpen size={16} />
                      </button>
                    </>
                  ) : null}
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

            {error ? (
              <p className="border-error/20 bg-error/5 text-error rounded-lg border px-3 py-2 text-[11.5px] leading-snug">
                {error}
              </p>
            ) : null}

            <div className="flex items-center justify-between gap-3">
              <p className="text-ink/35 text-[10.5px]">
                {busy ? 'Generation runs on your provider account.' : 'Uses your configured provider key.'}
              </p>
              <div className="flex items-center gap-2">
                {generationId && busy ? (
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
                ) : null}
                <Button onClick={() => void generate()} loading={busy} disabled={!prompt.trim()}>
                  <Sparkles size={13} /> {busy ? 'Generating…' : 'Generate'}
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
