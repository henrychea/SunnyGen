import {
  GARMENT_SLOTS,
  GARMENT_SOURCES,
  SLOT_LABELS,
  SOURCE_LABELS,
  STUDIO_ANGLES,
  STUDIO_ANGLE_LABELS,
  anglePhrase,
  parseAvatarLora,
  parseGarmentViews,
  type GarmentSlot,
  type GarmentSource,
  type GarmentView,
  type StudioAngle,
  type StudioKind,
} from '@sunnygen/core'
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
  motionFast,
  motionPop,
  toast,
} from '@sunnygen/ui'
import { ImagePlus, Loader2, Sparkles, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useRef, useState } from 'react'
import type { StudioItemDto } from '~/server/studio.functions'
import { saveStudioItemFn } from '~/server/studio.functions'

interface UploadSlot {
  assetId: string | null
  onPick: () => void
  label: string
  hint: string
}

export function StudioItemDialog({
  open,
  onOpenChange,
  kind,
  item,
  onSaved,
  onTrain,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: StudioKind
  item?: StudioItemDto | null
  onSaved: () => void
  onTrain?: (item: StudioItemDto) => void
}) {
  const [name, setName] = useState(item?.name ?? '')
  const [style, setStyle] = useState<'photoreal' | 'anime'>(
    item?.data.style === 'anime' ? 'anime' : 'photoreal',
  )
  const [sheetId, setSheetId] = useState<string | null>(item?.assetId ?? null)
  const [characterSheetId, setCharacterSheetId] = useState<string | null>(
    typeof item?.data.characterSheetAssetId === 'string' ? item.data.characterSheetAssetId : null,
  )
  const [slot, setSlot] = useState<GarmentSlot>((item?.data.slot as GarmentSlot) ?? 'top')
  const [sourceKind, setSourceKind] = useState<GarmentSource>(
    (item?.data.sourceKind as GarmentSource) ?? 'flat-lay',
  )
  const [notes, setNotes] = useState(String(item?.data.notes ?? ''))
  const [views, setViews] = useState<Partial<Record<StudioAngle, GarmentView>>>(() =>
    Object.fromEntries(
      parseGarmentViews({
        assetId: item?.assetId ?? null,
        cleanAssetId: item?.cleanAssetId ?? null,
        data: item?.data ?? {},
      }).map((view) => [view.angle, view]),
    ),
  )
  const [uploading, setUploading] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const pendingField = useRef<string>('asset')

  const pick = (field: string) => {
    pendingField.current = field
    fileRef.current?.click()
  }

  const upload = async (file: File, field: string) => {
    setUploading(field)
    setError(null)
    try {
      const form = new FormData()
      form.set('file', file)
      form.set('kind', kind)
      const response = await fetch('/api/studio-upload', { method: 'POST', body: form })
      const payload = (await response.json()) as { id?: string; name?: string | null; error?: string }
      if (!response.ok || !payload.id) throw new Error(payload.error ?? 'Upload failed')
      const uploadedName = payload.name ?? file.name
      toast(uploadedName === file.name ? `Uploaded ${uploadedName}` : `Uploaded as ${uploadedName}`, {
        tone: 'info',
      })
      if (field === 'character') setCharacterSheetId(payload.id)
      else if (field.startsWith('view:')) {
        const angle = field.slice('view:'.length) as StudioAngle
        // A new photo invalidates any prep done on the old one.
        setViews((current) => ({ ...current, [angle]: { angle, assetId: payload.id!, cleanAssetId: null } }))
      } else setSheetId(payload.id)
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : 'Upload failed'
      setError(message)
      toast(message, { tone: 'error' })
    } finally {
      setUploading(null)
    }
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const data: Record<string, unknown> = {}
      if (kind === 'avatar') {
        data.style = style
        data.characterSheetAssetId = characterSheetId
      }
      if (kind === 'garment') {
        data.slot = slot
        data.sourceKind = sourceKind
        data.notes = notes.trim()
        data.views = STUDIO_ANGLES.flatMap((angle) => {
          const view = views[angle]
          return angle === 'front' || !view
            ? []
            : [{ angle, assetId: view.assetId, cleanAssetId: view.cleanAssetId }]
        })
      }
      const front = views.front
      await saveStudioItemFn({
        data: {
          id: item?.id,
          kind,
          name: name.trim(),
          assetId: kind === 'garment' ? (front?.assetId ?? null) : sheetId,
          cleanAssetId: kind === 'garment' ? (front?.cleanAssetId ?? null) : (item?.cleanAssetId ?? null),
          data,
        },
      })
      onSaved()
      onOpenChange(false)
      toast(item ? `${title} saved` : `${title} created`, { tone: 'info' })
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Could not save'
      setError(message)
      toast(message, { tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const title =
    kind === 'avatar' ? 'Avatar' : kind === 'garment' ? 'Garment' : kind === 'pose' ? 'Pose' : 'Scene'
  const lora = parseAvatarLora(item?.data.lora)
  const preppedViews = STUDIO_ANGLES.filter((angle) => views[angle]?.cleanAssetId).length

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <DialogSurface className="w-[min(94vw,560px)]">
        <div className="flex items-center justify-between">
          <Dialog.Title className="font-display text-[16px] font-semibold">
            {item ? `Edit ${title.toLowerCase()}` : `New ${title.toLowerCase()}`}
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

        <div className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={`Name the ${title.toLowerCase()}`}
            />
          </label>

          {kind === 'avatar' ? (
            <>
              <label className="flex flex-col gap-1.5">
                <Label>Style</Label>
                <Select
                  value={style}
                  onChange={(event) => setStyle(event.target.value as 'photoreal' | 'anime')}
                >
                  <option value="photoreal">Photoreal</option>
                  <option value="anime">Anime 2D</option>
                </Select>
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <UploadBox
                  label="Character sheet"
                  hint="Annotated reference"
                  assetId={characterSheetId}
                  busy={uploading === 'character'}
                  onPick={() => pick('character')}
                />
                <UploadBox
                  label="4×4 panel sheet"
                  hint="Identity reference"
                  assetId={sheetId}
                  busy={uploading === 'asset'}
                  onPick={() => pick('asset')}
                />
              </div>
              {item && onTrain ? (
                <div className="border-line bg-canvas/40 flex items-center gap-2 rounded-xl border px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-ink/65 text-[11px] font-medium">
                      {lora ? `LoRA v${lora.version} trained` : 'No LoRA yet'}
                    </p>
                    <p className="text-ink/35 truncate text-[10px]">
                      {lora ? `Trigger: ${lora.triggerWord}` : 'Train on this avatar to reuse the likeness.'}
                    </p>
                  </div>
                  {lora ? <Badge tone="accent">LoRA</Badge> : null}
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto h-7 text-[10.5px]"
                    onClick={() => onTrain(item)}
                  >
                    <Sparkles size={10} /> {lora ? 'Retrain' : 'Train model'}
                  </Button>
                </div>
              ) : null}
            </>
          ) : null}

          {kind === 'garment' ? (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <Label>Slot</Label>
                  <Select value={slot} onChange={(event) => setSlot(event.target.value as GarmentSlot)}>
                    {GARMENT_SLOTS.map((value) => (
                      <option key={value} value={value}>
                        {SLOT_LABELS[value]}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <Label>Source</Label>
                  <Select
                    value={sourceKind}
                    onChange={(event) => setSourceKind(event.target.value as GarmentSource)}
                  >
                    {GARMENT_SOURCES.map((value) => (
                      <option key={value} value={value}>
                        {SOURCE_LABELS[value]}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>
              <ViewGrid
                views={views}
                uploading={uploading}
                onPick={(angle) => pick(`view:${angle}`)}
                onClear={(angle) =>
                  setViews((current) => {
                    const next = { ...current }
                    delete next[angle]
                    return next
                  })
                }
              />
              <label className="flex flex-col gap-1.5">
                <Label>Details to keep</Label>
                <Textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Print, hardware, stitching, fabric…"
                  className="min-h-20"
                />
              </label>
            </>
          ) : null}

          {kind === 'pose' || kind === 'scene' ? (
            <UploadBox
              label={kind === 'pose' ? 'Pose diagram' : 'Scene image'}
              hint={kind === 'pose' ? 'Stance reference only' : 'Light and background reference'}
              assetId={sheetId}
              busy={uploading === 'asset'}
              onPick={() => pick('asset')}
            />
          ) : null}

          {kind === 'garment' ? (
            preppedViews > 0 ? (
              <div className="flex items-center gap-2">
                <Badge tone="success">
                  {preppedViews} view{preppedViews === 1 ? '' : 's'} prepped
                </Badge>
                <span className="text-ink/35 text-[10px]">Prep from the Wardrobe tab to fill the rest.</span>
              </div>
            ) : null
          ) : (
            <AnimatePresence initial={false}>
              {item?.cleanAssetUrl ? (
                <motion.div
                  key="clean-reference"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={motionFast}
                  className="overflow-hidden"
                >
                  <div className="flex items-center gap-2">
                    <Badge tone="success">Clean reference ready</Badge>
                    <span className="border-line relative size-10 overflow-hidden rounded-md border">
                      <FadeImage shimmer src={item.cleanAssetUrl} alt="" className="size-full object-cover" />
                    </span>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          )}

          <AnimatePresence initial={false}>
            {error ? (
              <motion.p
                key="item-error"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={motionFast}
                className="border-error/20 bg-error/5 text-error overflow-hidden rounded-lg border px-3 py-2 text-[11.5px]"
              >
                {error}
              </motion.p>
            ) : null}
          </AnimatePresence>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => void save()} loading={saving} disabled={!name.trim()}>
              Save
            </Button>
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void upload(file, pendingField.current)
            event.target.value = ''
          }}
        />
      </DialogSurface>
    </Dialog.Root>
  )
}

function ViewGrid({
  views,
  uploading,
  onPick,
  onClear,
}: {
  views: Partial<Record<StudioAngle, GarmentView>>
  uploading: string | null
  onPick: (angle: StudioAngle) => void
  onClear: (angle: StudioAngle) => void
}) {
  const count = STUDIO_ANGLES.filter((angle) => views[angle]?.assetId).length
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label>Views</Label>
        <span className="text-ink/35 text-[10px] tabular-nums">
          {count}/{STUDIO_ANGLES.length}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {STUDIO_ANGLES.map((angle) => {
          const view = views[angle]
          const image = view?.cleanAssetId ?? view?.assetId
          const label = STUDIO_ANGLE_LABELS[angle]
          return (
            <div key={angle} className="relative flex flex-col gap-1">
              <button
                type="button"
                onClick={() => onPick(angle)}
                aria-label={`${image ? 'Replace' : 'Add'} ${anglePhrase(angle)} view`}
                className={cn(
                  'border-line bg-canvas/50 text-ink/35 relative grid h-20 place-items-center overflow-hidden rounded-lg border border-dashed',
                  'transition-[color,border-color,background-color,scale] duration-200 ease-out hover:border-accent/40 hover:bg-surface hover:text-accent',
                  'active:scale-[0.98] motion-reduce:active:scale-100',
                )}
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={uploading === `view:${angle}` ? 'busy' : image ? 'asset' : 'empty'}
                    variants={motionPop}
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    className="absolute inset-0 grid place-items-center"
                  >
                    {uploading === `view:${angle}` ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : image ? (
                      <FadeImage
                        shimmer
                        src={`/api/media/${image}`}
                        alt=""
                        className="size-full object-contain"
                      />
                    ) : (
                      <ImagePlus size={14} />
                    )}
                  </motion.span>
                </AnimatePresence>
              </button>
              {image && angle !== 'front' ? (
                <button
                  type="button"
                  onClick={() => onClear(angle)}
                  aria-label={`Remove ${anglePhrase(angle)} view`}
                  className="border-line bg-surface/95 text-ink/40 hover:text-error absolute top-1 right-1 grid size-5 place-items-center rounded-full border transition-colors duration-150 ease-out"
                >
                  <X size={10} />
                </button>
              ) : null}
              <span className="text-ink/45 text-center text-[9.5px]">{label}</span>
            </div>
          )
        })}
      </div>
      <p className="text-ink/35 text-[10px] leading-snug">
        Add the angles you have. A shoot uses the closest one for each shot angle.
      </p>
    </div>
  )
}

function UploadBox({ label, hint, assetId, busy, onPick }: UploadSlot & { busy: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <button
        type="button"
        onClick={onPick}
        className={cn(
          'border-line bg-canvas/50 text-ink/35 relative grid h-28 place-items-center overflow-hidden rounded-xl border border-dashed',
          'transition-[color,border-color,background-color,scale] duration-200 ease-out hover:border-accent/40 hover:bg-surface hover:text-accent',
          'active:scale-[0.99] motion-reduce:active:scale-100',
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={busy ? 'busy' : assetId ? 'asset' : 'empty'}
            variants={motionPop}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="absolute inset-0 grid place-items-center"
          >
            {busy ? (
              <Loader2 size={18} className="animate-spin" />
            ) : assetId ? (
              <FadeImage shimmer src={`/api/media/${assetId}`} alt="" className="size-full object-contain" />
            ) : (
              <span className="flex flex-col items-center gap-1 text-[10.5px]">
                <ImagePlus size={16} />
                {hint}
              </span>
            )}
          </motion.span>
        </AnimatePresence>
      </button>
    </div>
  )
}
