import { panelSizeError } from '@sunnygen/core'
import { FadeImage, Button, Label, toast } from '@sunnygen/ui'
import { ImagePlus } from 'lucide-react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { ReferencePicker } from '~/components/home/reference-picker'
import type { ReferenceItem } from '~/lib/reference-images'

export interface SlotAsset {
  id: string
  name: string | null
  width: number | null
  height: number | null
}

function slotLabel(asset: SlotAsset): string {
  const size = asset.width && asset.height ? `${asset.width} x ${asset.height} px` : 'size unknown'
  return `${asset.name ?? 'Untitled'} · ${size}`
}

function UploadSlot({
  label,
  asset,
  note,
  noteTone = 'muted',
  onPick,
  onClear,
  onCopy,
}: {
  label: string
  asset: SlotAsset | null
  note?: string | null
  noteTone?: 'muted' | 'error'
  onPick: () => void
  onClear: () => void
  onCopy?: () => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <button
        type="button"
        onClick={onPick}
        aria-label={asset ? `Replace ${label}` : `Upload ${label}`}
        className="border-line bg-canvas/40 text-ink/65 hover:border-accent/40 hover:text-accent focus-visible:ring-accent/50 relative grid h-28 place-items-center overflow-hidden rounded-xl border border-dashed transition-[color,border-color,background-color] duration-200 ease-out focus-visible:ring-2 focus-visible:outline-none"
      >
        {asset ? (
          <FadeImage
            shimmer
            src={`/api/media/${asset.id}`}
            alt={`${label} image`}
            className="size-full object-contain"
          />
        ) : (
          <span className="flex flex-col items-center gap-1 text-[10.5px]">
            <ImagePlus size={16} aria-hidden="true" />
            Upload image
          </span>
        )}
      </button>
      <p className="text-ink/65 truncate text-[10px]">{asset ? slotLabel(asset) : 'No file yet'}</p>
      {note ? (
        <p className={noteTone === 'error' ? 'text-error text-[10.5px]' : 'text-ink/65 text-[10.5px]'}>
          {note}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="min-h-11 text-[11px] sm:h-7 sm:min-h-0 sm:text-[10.5px]"
          onClick={onPick}
        >
          {asset ? 'Replace' : 'Choose'}
        </Button>
        {asset ? (
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11 text-[11px] sm:h-7 sm:min-h-0 sm:text-[10.5px]"
            onClick={onClear}
          >
            Clear
          </Button>
        ) : null}
        {onCopy ? (
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11 text-[11px] sm:h-7 sm:min-h-0 sm:text-[10.5px]"
            onClick={onCopy}
          >
            Copy prompt
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export type AvatarSlotKind = 'sheet' | 'body-panel' | 'face-panel'

export function AvatarSheetUploads({
  sheet,
  panel,
  face,
  onSheet,
  onPanel,
  onFace,
  picker,
  onPicker,
  onCopy,
}: {
  sheet: SlotAsset | null
  panel: SlotAsset | null
  face: SlotAsset | null
  onSheet: (next: SlotAsset | null) => void
  onPanel: (next: SlotAsset | null) => void
  onFace: (next: SlotAsset | null) => void
  picker: AvatarSlotKind | null
  onPicker: (next: AvatarSlotKind | null) => void
  onCopy?: (kind: AvatarSlotKind) => void
}) {
  const [rejectedPanelError, setRejectedPanelError] = useState<string | null>(null)

  const open = (kind: AvatarSlotKind) => onPicker(kind)
  const close = () => onPicker(null)

  const adopt = (kind: AvatarSlotKind, item: ReferenceItem) => {
    const next: SlotAsset = {
      id: item.id,
      name: item.name,
      width: item.width ?? null,
      height: item.height ?? null,
    }
    if (kind === 'sheet') {
      const longest = Math.max(next.width ?? 0, next.height ?? 0)
      if (longest < 4096) {
        const error = 'The reference sheet must be at least 4096 px on its long side.'
        setRejectedPanelError(error)
        toast(error, { tone: 'error' })
        return
      }
      setRejectedPanelError(null)
      onSheet(next)
      return
    }
    const error = panelSizeError(next.width, next.height)
    if (error) {
      setRejectedPanelError(error)
      toast(error, { tone: 'error' })
      return
    }
    setRejectedPanelError(null)
    if (kind === 'body-panel') onPanel(next)
    else onFace(next)
  }

  const adoptedPanelError = panel ? panelSizeError(panel.width, panel.height) : null
  const adoptedFaceError = face ? panelSizeError(face.width, face.height) : null

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <UploadSlot
          label="Reference sheet"
          asset={sheet}
          onPick={() => open('sheet')}
          onClear={() => onSheet(null)}
          onCopy={onCopy ? () => onCopy('sheet') : undefined}
        />
        <UploadSlot
          label="Body panel"
          asset={panel}
          note={rejectedPanelError ?? adoptedPanelError}
          noteTone={rejectedPanelError ? 'error' : 'muted'}
          onPick={() => open('body-panel')}
          onClear={() => {
            setRejectedPanelError(null)
            onPanel(null)
          }}
          onCopy={onCopy ? () => onCopy('body-panel') : undefined}
        />
        <UploadSlot
          label="Face panel"
          asset={face}
          note={rejectedPanelError ?? adoptedFaceError}
          noteTone={rejectedPanelError ? 'error' : 'muted'}
          onPick={() => open('face-panel')}
          onClear={() => {
            setRejectedPanelError(null)
            onFace(null)
          }}
          onCopy={onCopy ? () => onCopy('face-panel') : undefined}
        />
      </div>
      {picker
        ? createPortal(
            <ReferencePicker
              title={
                picker === 'sheet' ? 'Reference sheet' : picker === 'body-panel' ? 'Body panel' : 'Face panel'
              }
              allowAvatars={false}
              existingIds={[]}
              max={1}
              onClose={close}
              onConfirm={(picked: ReferenceItem[]) => {
                const chosen = picked[0]
                if (chosen) adopt(picker, chosen)
                close()
              }}
            />,
            document.body,
          )
        : null}
    </>
  )
}
