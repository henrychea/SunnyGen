import { useRef, useState } from 'react'
import { REGION_MIN_SIDE, clampCropRegion, type CropRegion, type CropRegionRole } from '@sunnygen/core'
import { Button, FadeImage, cn } from '@sunnygen/ui'

export interface CropAdjusterSource {
  url: string
  width: number
  height: number
}

/**
 * One freeform box for one role. It moves and resizes anywhere inside the image, not snapped to
 * a cell, and is clamped to the image edge and REGION_MIN_SIDE while dragging.
 */
export function AvatarCropAdjuster({
  role,
  label,
  source,
  region,
  saving,
  onSave,
  onCancel,
}: {
  role: CropRegionRole
  label: string
  source: CropAdjusterSource
  region: CropRegion
  saving: boolean
  onSave: (region: CropRegion) => void
  onCancel: () => void
}) {
  const [box, setBox] = useState<CropRegion>(() => clampCropRegion(region, source))
  const frame = useRef<HTMLDivElement>(null)

  const drag = (event: React.PointerEvent, mode: 'move' | 'resize') => {
    event.preventDefault()
    event.stopPropagation()
    const bounds = frame.current?.getBoundingClientRect()
    if (!bounds) return
    const scaleX = source.width / bounds.width
    const scaleY = source.height / bounds.height
    const startX = event.clientX
    const startY = event.clientY
    const from = box
    const target = event.currentTarget as HTMLElement
    try {
      target.setPointerCapture(event.pointerId)
    } catch {
      // A synthetic pointer cannot be captured; dragging still works through the listeners.
    }

    const move = (moveEvent: PointerEvent) => {
      const dx = Math.round((moveEvent.clientX - startX) * scaleX)
      const dy = Math.round((moveEvent.clientY - startY) * scaleY)
      const next =
        mode === 'move'
          ? { ...from, x: from.x + dx, y: from.y + dy }
          : { ...from, w: from.w + dx, h: from.h + dy }
      setBox(clampCropRegion(next, source))
    }
    const end = () => {
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', end)
      target.removeEventListener('pointercancel', end)
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', end)
    target.addEventListener('pointercancel', end)
  }

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-ink/65 text-[10.5px]">
        Move or resize the {label.toLowerCase()} box anywhere inside the image, across cell lines if you need
        to. At least {REGION_MIN_SIDE} px a side.
      </p>

      <div
        ref={frame}
        className="border-line relative w-full max-w-[460px] touch-none overflow-hidden rounded-lg border"
      >
        <FadeImage shimmer src={source.url} alt={label} className="w-full object-contain" />
        <div
          role="group"
          data-role={role}
          aria-label={`${label} box`}
          onPointerDown={(event) => drag(event, 'move')}
          className="border-accent bg-accent/15 absolute cursor-move border-2"
          style={{
            left: `${(box.x / source.width) * 100}%`,
            top: `${(box.y / source.height) * 100}%`,
            width: `${(box.w / source.width) * 100}%`,
            height: `${(box.h / source.height) * 100}%`,
          }}
        >
          <span className="bg-accent/85 text-canvas m-0.5 inline-block rounded px-1 text-[9px] font-semibold">
            {label}
          </span>
          <button
            type="button"
            aria-label={`Resize ${label}`}
            onPointerDown={(event) => drag(event, 'resize')}
            className="bg-accent border-canvas absolute -right-1.5 -bottom-1.5 size-4 cursor-nwse-resize rounded-sm border"
          />
        </div>
      </div>

      <p
        className={cn(
          'text-[10px] tabular-nums',
          box.w < REGION_MIN_SIDE || box.h < REGION_MIN_SIDE ? 'text-error' : 'text-ink/55',
        )}
      >
        {box.w} x {box.h} px at {box.x}, {box.y}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onSave(box)}
          loading={saving}
          disabled={saving}
          className="min-h-11 text-[11px] sm:h-7 sm:min-h-0 sm:text-[10.5px]"
        >
          Save {label.toLowerCase()} box
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={saving}
          className="min-h-11 text-[11px] sm:h-7 sm:min-h-0 sm:text-[10.5px]"
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
