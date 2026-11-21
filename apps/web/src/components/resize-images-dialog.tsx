import type { ImageLimits } from '@sunnygen/core'
import { Button, Dialog, DialogSurface } from '@sunnygen/ui'
import { useState } from 'react'
import { formatBytes } from '~/lib/format'
import type { ReferenceItem } from '~/lib/reference-images'

function limitLabel(limits: ImageLimits): string {
  const megapixels = (limits.pixels / 1_000_000).toFixed(1).replace(/\.0$/, '')
  return `${formatBytes(limits.bytes)} per file · ${limits.side} px longest side · ${megapixels} MP`
}

function itemSize(item: ReferenceItem): string {
  const bytes = item.byteSize === undefined ? 'Unknown size' : formatBytes(item.byteSize)
  const dimensions = item.width && item.height ? `${item.width}×${item.height}` : null
  return dimensions ? `${bytes} · ${dimensions}` : bytes
}

export function ResizeImagesDialog({
  open,
  items,
  limits,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  items: ReferenceItem[]
  limits: ImageLimits
  onOpenChange: (open: boolean) => void
  onConfirm: (dontAskAgain: boolean) => void
}) {
  const [dontAskAgain, setDontAskAgain] = useState(false)
  const count = items.length
  const listed = items.slice(0, 4)
  const rest = count - listed.length

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <DialogSurface>
        <Dialog.Title className="font-display text-[16px] font-semibold">Resize large images?</Dialog.Title>
        <Dialog.Description className="text-ink/60 mt-1.5 text-[12.5px] leading-relaxed">
          {count === 1
            ? '1 attached image is larger than providers accept.'
            : `${count} attached images are larger than providers accept.`}{' '}
          They will be downscaled before upload. Your originals in the library are not changed.
        </Dialog.Description>

        <p className="text-ink/40 mt-3 text-[10.5px] font-semibold tracking-[0.06em] uppercase">
          {limitLabel(limits)}
        </p>

        <ul className="border-line bg-canvas/60 mt-2 divide-y rounded-xl border">
          {listed.map((item) => (
            <li key={item.id} className="flex items-baseline justify-between gap-3 px-3 py-2">
              <span className="text-ink truncate text-[12px]">{item.name}</span>
              <span className="text-ink/45 shrink-0 text-[11px] tabular-nums">{itemSize(item)}</span>
            </li>
          ))}
          {rest > 0 ? <li className="text-ink/45 px-3 py-2 text-[11px]">and {rest} more</li> : null}
        </ul>

        <label className="text-ink/60 mt-3 flex cursor-pointer items-center gap-2 text-[12px]">
          <input
            type="checkbox"
            checked={dontAskAgain}
            onChange={(event) => setDontAskAgain(event.target.checked)}
            className="accent-accent size-3.5"
          />
          Don't ask again
        </label>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button autoFocus onClick={() => onConfirm(dontAskAgain)}>
            Resize &amp; generate
          </Button>
        </div>
      </DialogSurface>
    </Dialog.Root>
  )
}
