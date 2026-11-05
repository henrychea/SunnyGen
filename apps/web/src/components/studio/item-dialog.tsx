import {
  GARMENT_SLOTS,
  GARMENT_SOURCES,
  SLOT_LABELS,
  SOURCE_LABELS,
  type GarmentSlot,
  type GarmentSource,
  type StudioKind,
} from '@sunnygen/core'
import { Badge, Button, Dialog, DialogSurface, Input, Label, Select, Textarea, cn } from '@sunnygen/ui'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
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
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: StudioKind
  item?: StudioItemDto | null
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [style, setStyle] = useState<'photoreal' | 'anime'>('photoreal')
  const [sheetId, setSheetId] = useState<string | null>(null)
  const [characterSheetId, setCharacterSheetId] = useState<string | null>(null)
  const [slot, setSlot] = useState<GarmentSlot>('top')
  const [sourceKind, setSourceKind] = useState<GarmentSource>('flat-lay')
  const [notes, setNotes] = useState('')
  const [uploading, setUploading] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const pendingField = useRef<string>('asset')

  useEffect(() => {
    if (!open) return
    setName(item?.name ?? '')
    setStyle(item?.data.style === 'anime' ? 'anime' : 'photoreal')
    setSheetId(item?.assetId ?? null)
    setCharacterSheetId(
      typeof item?.data.characterSheetAssetId === 'string' ? item.data.characterSheetAssetId : null,
    )
    setSlot((item?.data.slot as GarmentSlot) ?? 'top')
    setSourceKind((item?.data.sourceKind as GarmentSource) ?? 'flat-lay')
    setNotes(String(item?.data.notes ?? ''))
    setError(null)
  }, [open, item])

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
      const payload = (await response.json()) as { id?: string; error?: string }
      if (!response.ok || !payload.id) throw new Error(payload.error ?? 'Upload failed')
      if (field === 'character') setCharacterSheetId(payload.id)
      else setSheetId(payload.id)
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed')
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
      }
      await saveStudioItemFn({
        data: {
          id: item?.id,
          kind,
          name: name.trim(),
          assetId: sheetId,
          cleanAssetId: item?.cleanAssetId ?? null,
          data,
        },
      })
      onSaved()
      onOpenChange(false)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const title =
    kind === 'avatar' ? 'Avatar' : kind === 'garment' ? 'Garment' : kind === 'pose' ? 'Pose' : 'Scene'

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
            className="text-ink/40 hover:bg-ink/5 grid size-8 place-items-center rounded-lg"
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
              <UploadBox
                label="Garment photo"
                hint={sourceKind === 'flat-lay' ? 'Clean flat lay' : 'Needs prep after saving'}
                assetId={sheetId}
                busy={uploading === 'asset'}
                onPick={() => pick('asset')}
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

          {item?.cleanAssetUrl ? (
            <div className="flex items-center gap-2">
              <Badge tone="success">Clean reference ready</Badge>
              <img
                src={item.cleanAssetUrl}
                alt=""
                className="border-line size-10 rounded-md border object-cover"
              />
            </div>
          ) : null}

          {error ? (
            <p className="border-error/20 bg-error/5 text-error rounded-lg border px-3 py-2 text-[11.5px]">
              {error}
            </p>
          ) : null}

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

function UploadBox({ label, hint, assetId, busy, onPick }: UploadSlot & { busy: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <button
        type="button"
        onClick={onPick}
        className={cn(
          'border-line bg-canvas/50 text-ink/35 relative grid h-28 place-items-center overflow-hidden rounded-xl border border-dashed',
          'hover:border-accent/40 hover:text-accent',
        )}
      >
        {busy ? (
          <Loader2 size={18} className="animate-spin" />
        ) : assetId ? (
          <img src={`/api/media/${assetId}`} alt="" className="size-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1 text-[10.5px]">
            <ImagePlus size={16} />
            {hint}
          </span>
        )}
      </button>
    </div>
  )
}
