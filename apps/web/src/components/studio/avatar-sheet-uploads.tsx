import { FadeImage, Button, Label } from '@sunnygen/ui'
import { ImagePlus } from 'lucide-react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { ReferencePicker } from '~/components/home/reference-picker'
import type { ReferenceItem } from '~/lib/reference-images'

function UploadSlot({
  label,
  assetId,
  onPick,
  onClear,
}: {
  label: string
  assetId: string | null
  onPick: () => void
  onClear: () => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <button
        type="button"
        onClick={onPick}
        aria-label={assetId ? `Replace ${label}` : `Upload ${label}`}
        className="border-line bg-canvas/40 text-ink/65 hover:border-accent/40 hover:text-accent focus-visible:ring-accent/50 relative grid h-28 place-items-center overflow-hidden rounded-xl border border-dashed transition-[color,border-color,background-color] duration-200 ease-out focus-visible:ring-2 focus-visible:outline-none"
      >
        {assetId ? (
          <FadeImage
            shimmer
            src={`/api/media/${assetId}`}
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
      <div className="flex flex-wrap gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="min-h-11 text-[11px] sm:h-7 sm:min-h-0 sm:text-[10.5px]"
          onClick={onPick}
        >
          {assetId ? 'Replace' : 'Choose'}
        </Button>
        {assetId ? (
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11 text-[11px] sm:h-7 sm:min-h-0 sm:text-[10.5px]"
            onClick={onClear}
          >
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export function AvatarSheetUploads({
  sheetId,
  panelId,
  onSheet,
  onPanel,
  onPickerOpenChange,
}: {
  sheetId: string | null
  panelId: string | null
  onSheet: (id: string | null) => void
  onPanel: (id: string | null) => void
  onPickerOpenChange?: (open: boolean) => void
}) {
  const [picker, setPicker] = useState<'sheet' | 'panel' | null>(null)

  const open = (kind: 'sheet' | 'panel') => {
    setPicker(kind)
    onPickerOpenChange?.(true)
  }
  const close = () => {
    setPicker(null)
    onPickerOpenChange?.(false)
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <UploadSlot
          label="Reference sheet"
          assetId={sheetId}
          onPick={() => open('sheet')}
          onClear={() => onSheet(null)}
        />
        <UploadSlot
          label="4×4 panel"
          assetId={panelId}
          onPick={() => open('panel')}
          onClear={() => onPanel(null)}
        />
      </div>
      {picker
        ? createPortal(
            <ReferencePicker
              title={picker === 'sheet' ? 'Reference sheet' : '4×4 panel'}
              allowAvatars={false}
              existingIds={[]}
              max={1}
              onClose={close}
              onConfirm={(picked: ReferenceItem[]) => {
                const chosen = picked[0]
                if (chosen) {
                  if (picker === 'sheet') onSheet(chosen.id)
                  else onPanel(chosen.id)
                }
                close()
              }}
            />,
            document.body,
          )
        : null}
    </>
  )
}
