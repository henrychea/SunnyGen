import {
  LORA_MAX_IMAGES,
  LORA_MIN_IMAGES,
  LORA_STEP_PRESETS,
  loraTrainingCost,
  loraTriggerWord,
} from '@sunnygen/core'
import {
  Badge,
  Button,
  Dialog,
  DialogSurface,
  FadeImage,
  Input,
  Label,
  Skeleton,
  cn,
  motionFast,
  motionPop,
  motionSpring,
  motionSwap,
} from '@sunnygen/ui'
import { Check, Sparkles, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import type { LoraTrainingRun, StudioItemDto } from '~/server/studio.functions'
import { prepareAvatarTrainingSet, trainAvatarLora } from '~/server/studio.functions'

type Step = 1 | 2 | 3

const STEP_LABELS: Array<{ id: Step; label: string }> = [
  { id: 1, label: 'Images' },
  { id: 2, label: 'Settings' },
  { id: 3, label: 'Review' },
]

function costLabel(cost: number): string {
  return `$${cost.toFixed(2)}`
}

export function StudioTrainDialog({
  open,
  onOpenChange,
  avatar,
  onStarted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  avatar: StudioItemDto
  onStarted: (run: LoraTrainingRun) => void
}) {
  const [step, setStep] = useState<Step>(1)
  const [images, setImages] = useState<Array<{ id: string; url: string; label: string }> | null>(null)
  const [excluded, setExcluded] = useState<string[]>([])
  const [presetId, setPresetId] = useState<(typeof LORA_STEP_PRESETS)[number]['id']>('balanced')
  const [triggerWord, setTriggerWord] = useState(() => loraTriggerWord(avatar.name))
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const prepared = await prepareAvatarTrainingSet({ data: { avatarId: avatar.id } })
        if (!cancelled) setImages(prepared.images)
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Could not prepare images')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [avatar.id])

  const candidates = images ?? []
  const selected = candidates.filter((image) => !excluded.includes(image.id))
  const preset = LORA_STEP_PRESETS.find((entry) => entry.id === presetId) ?? LORA_STEP_PRESETS[1]
  const cost = loraTrainingCost(preset.steps)
  const enough = selected.length >= LORA_MIN_IMAGES && selected.length <= LORA_MAX_IMAGES

  const toggle = (id: string) => {
    setExcluded((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    )
  }

  const start = async () => {
    if (!enough || !consent || busy) return
    setBusy(true)
    setError(null)
    try {
      const run = await trainAvatarLora({
        data: {
          avatarId: avatar.id,
          assetIds: selected.map((image) => image.id),
          steps: preset.steps,
          triggerWord: triggerWord.trim(),
          consent: true,
        },
      })
      if (run.status === 'failed') throw new Error(run.error ?? 'Training failed')
      onStarted(run)
      onOpenChange(false)
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : 'Training failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <DialogSurface className="w-[min(94vw,600px)]">
        <div className="flex items-center justify-between">
          <Dialog.Title className="font-display text-[16px] font-semibold">
            Train model · {avatar.name}
          </Dialog.Title>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-ink/40 hover:bg-ink/5 grid size-8 place-items-center rounded-lg transition-[color,background-color,scale] duration-150 ease-out active:scale-[0.94] motion-reduce:active:scale-100"
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </div>

        <div className="border-line mt-3 inline-flex rounded-xl border p-0.5">
          {STEP_LABELS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setStep(entry.id)}
              disabled={busy}
              className={cn(
                'relative rounded-[10px] px-2.5 py-1.5 text-[11px] font-medium transition-colors duration-150 ease-out disabled:opacity-50',
                step === entry.id ? 'text-canvas' : 'text-ink/50 hover:text-ink',
              )}
            >
              {step === entry.id ? (
                <motion.span
                  layoutId="train-dialog-step"
                  transition={motionSpring}
                  className="bg-ink absolute inset-0 rounded-[10px]"
                />
              ) : null}
              <span className="relative">
                {entry.id}. {entry.label}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-4">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              variants={motionSwap}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={motionFast}
            >
              {step === 1 ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <p className="text-ink/45 text-[11px]">
                      {images === null
                        ? 'Cutting the 4×4 panel into training crops…'
                        : `${selected.length} of ${candidates.length} images selected`}
                    </p>
                    {images !== null && !enough ? (
                      <Badge tone="warning">{LORA_MIN_IMAGES} minimum</Badge>
                    ) : null}
                  </div>
                  {images === null && !error ? (
                    <div className="grid grid-cols-4 gap-2">
                      {Array.from({ length: 8 }).map((_, index) => (
                        <Skeleton key={index} className="aspect-square rounded-lg" />
                      ))}
                    </div>
                  ) : (
                    <div className="grid max-h-[38vh] grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-5">
                      {candidates.map((image, index) => {
                        const active = !excluded.includes(image.id)
                        return (
                          <motion.button
                            key={image.id}
                            type="button"
                            onClick={() => toggle(image.id)}
                            aria-pressed={active}
                            initial={{ opacity: 0, scale: 0.97 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ ...motionFast, delay: Math.min(index * 0.01, 0.12) }}
                            className={cn(
                              'group border-line relative aspect-square overflow-hidden rounded-lg border transition-[border-color,opacity] duration-150',
                              active ? 'border-accent/60' : 'opacity-40 hover:opacity-70',
                            )}
                          >
                            <FadeImage
                              src={image.url}
                              alt=""
                              loading="lazy"
                              className="size-full object-cover"
                            />
                            <motion.span
                              animate={{ scale: active ? 1 : 0.85, opacity: active ? 1 : 0 }}
                              transition={motionFast}
                              className="border-accent bg-accent absolute top-1 right-1 grid size-4 place-items-center rounded-full border text-white"
                            >
                              <Check size={9} />
                            </motion.span>
                            <span className="bg-ink/55 text-canvas absolute bottom-0 left-0 w-full truncate px-1 py-0.5 text-[8px]">
                              {image.label}
                            </span>
                          </motion.button>
                        )
                      })}
                    </div>
                  )}
                </div>
              ) : null}

              {step === 2 ? (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label>Training length</Label>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {LORA_STEP_PRESETS.map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => setPresetId(entry.id)}
                          aria-pressed={presetId === entry.id}
                          className={cn(
                            'relative flex flex-col gap-1 rounded-xl border px-3 py-2.5 text-left transition-[border-color,background-color,scale] duration-150 ease-out active:scale-[0.99] motion-reduce:active:scale-100',
                            presetId === entry.id
                              ? 'border-accent/45 bg-accent/[0.06]'
                              : 'border-line bg-surface/60 hover:border-ink/20',
                          )}
                        >
                          <span className="text-ink/80 text-[11.5px] font-semibold">{entry.label}</span>
                          <span className="text-ink/40 text-[10px]">
                            {entry.steps} steps · {costLabel(loraTrainingCost(entry.steps))}
                          </span>
                        </button>
                      ))}
                    </div>
                    <p className="text-ink/35 text-[10px]">{preset.hint}</p>
                  </div>
                  <label className="flex flex-col gap-1.5">
                    <Label>Trigger word</Label>
                    <Input
                      value={triggerWord}
                      onChange={(event) => setTriggerWord(event.target.value)}
                      placeholder="aria"
                      maxLength={64}
                    />
                    <span className="text-ink/35 text-[10px]">
                      Added to the front of every prompt that uses this model.
                    </span>
                  </label>
                </div>
              ) : null}

              {step === 3 ? (
                <div className="flex flex-col gap-3">
                  <div className="border-line bg-canvas/40 flex flex-col gap-1.5 rounded-xl border px-3 py-2.5 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="text-ink/45">Images</span>
                      <span className="text-ink/75 tabular-nums">{selected.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-ink/45">Training length</span>
                      <span className="text-ink/75 tabular-nums">
                        {preset.label} · {preset.steps} steps
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-ink/45">Trigger word</span>
                      <span className="text-ink/75 font-mono text-[10.5px]">{triggerWord.trim() || '—'}</span>
                    </div>
                    <div className="border-line/70 flex items-center justify-between border-t pt-1.5">
                      <span className="text-ink/55 font-medium">Total cost</span>
                      <span className="text-ink/85 font-semibold tabular-nums">{costLabel(cost)}</span>
                    </div>
                  </div>
                  <label className="text-ink/60 flex items-start gap-2 text-[11px] leading-snug">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(event) => setConsent(event.target.checked)}
                      className="accent-accent mt-0.5 size-3.5"
                    />
                    I have permission to train on this person&apos;s likeness
                  </label>
                </div>
              ) : null}
            </motion.div>
          </AnimatePresence>

          <AnimatePresence initial={false}>
            {error ? (
              <motion.p
                key="train-error"
                variants={motionPop}
                initial="hidden"
                animate="visible"
                exit="hidden"
                className="border-error/20 bg-error/5 text-error mt-3 rounded-lg border px-3 py-2 text-[11.5px]"
              >
                {error}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          {step > 1 ? (
            <Button variant="ghost" onClick={() => setStep((step - 1) as Step)} disabled={busy}>
              Back
            </Button>
          ) : null}
          {step < 3 ? (
            <Button
              onClick={() => setStep((step + 1) as Step)}
              disabled={step === 1 && (!enough || images === null)}
            >
              Continue
            </Button>
          ) : (
            <Button onClick={() => void start()} loading={busy} disabled={!consent || !enough}>
              <Sparkles size={12} /> Start training · {costLabel(cost)}
            </Button>
          )}
        </div>
      </DialogSurface>
    </Dialog.Root>
  )
}
