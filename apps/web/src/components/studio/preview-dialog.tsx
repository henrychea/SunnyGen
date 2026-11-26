import { useEffect, useState } from 'react'
import { STUDIO_ANGLE_LABELS, parseGarmentViews, type GarmentView } from '@sunnygen/core'
import { Button, Dialog, DialogSurface, cn } from '@sunnygen/ui'
import { Paintbrush, X } from 'lucide-react'
import { MediaCard, MediaThumbStrip } from '~/components/media-preview'
import type { StudioItemDto } from '~/server/studio.functions'

type Compare = 'prepared' | 'original'

function viewsFor(item: StudioItemDto): GarmentView[] {
  if (item.kind === 'garment') return parseGarmentViews(item)
  if (!item.assetId) return []
  return [{ angle: 'front', assetId: item.assetId, cleanAssetId: item.cleanAssetId }]
}

function urlOf(assetId: string | null): string | null {
  return assetId ? `/api/media/${assetId}` : null
}

export function StudioPreviewDialog({
  open,
  onOpenChange,
  item,
  onPrepare,
  preparing,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: StudioItemDto
  onPrepare?: () => void
  preparing?: boolean
}) {
  const views = viewsFor(item)
  const [index, setIndex] = useState(0)
  const [compare, setCompare] = useState<Compare>('prepared')
  const safeIndex = Math.min(index, Math.max(0, views.length - 1))
  const view = views[safeIndex]
  const preparedAny = views.some((entry) => entry.cleanAssetId)
  const showingPrepared = compare === 'prepared' && Boolean(view?.cleanAssetId)
  const image = urlOf(showingPrepared ? (view?.cleanAssetId ?? null) : (view?.assetId ?? null))
  const angleLabel = item.kind === 'garment' ? STUDIO_ANGLE_LABELS[view?.angle ?? 'front'] : 'Scene'

  useEffect(() => {
    if (!open || views.length < 2) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      setIndex((current) => {
        const step = event.key === 'ArrowRight' ? 1 : -1
        return (current + step + views.length) % views.length
      })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, views.length])

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) setIndex(0)
        onOpenChange(next)
      }}
    >
      <DialogSurface className="w-[min(96vw,1040px)]">
        <div className="flex items-start gap-3">
          <div className="min-w-0">
            <Dialog.Title className="font-display text-ink truncate text-[15px] font-semibold">
              {item.name}
            </Dialog.Title>
            <p className="text-ink/65 mt-0.5 text-[11px]">
              {angleLabel}
              {views.length > 1 ? ` · ${safeIndex + 1} / ${views.length}` : ''}
              {preparedAny ? '' : ' · not prepared yet'}
            </p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {onPrepare && !item.builtin ? (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px]"
                loading={preparing}
                onClick={onPrepare}
              >
                <Paintbrush size={10} />
                {preparedAny ? 'Re-prep' : 'Prepare'}
              </Button>
            ) : null}
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="text-ink/65 hover:bg-ink/5 hover:text-ink grid size-8 place-items-center rounded-lg transition-[color,background-color,scale] duration-150 ease-out active:scale-[0.94] motion-reduce:active:scale-100"
              aria-label="Close preview"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="border-line-strong bg-surface/80 mt-3 mb-2 inline-flex rounded-lg border p-0.5">
          {(['original', 'prepared'] as const).map((mode) => {
            const active = mode === 'prepared' ? showingPrepared : !showingPrepared
            const disabled = mode === 'prepared' && !preparedAny
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setCompare(mode)}
                disabled={disabled}
                aria-pressed={active}
                className={cn(
                  'rounded-[7px] px-2.5 py-1 text-[11px] font-medium transition-colors duration-150 ease-out',
                  active ? 'bg-ink text-canvas' : 'text-ink/65 hover:text-ink',
                  disabled ? 'cursor-not-allowed opacity-40' : '',
                )}
              >
                {mode === 'original' ? 'Original' : 'Prepared'}
              </button>
            )
          })}
        </div>

        <div className="min-h-0">
          {image ? (
            <MediaCard
              key={`${item.id}:${view?.angle}:${showingPrepared ? 'clean' : 'raw'}`}
              url={image}
              kind="image"
              alt={`${item.name} ${angleLabel.toLowerCase()}`}
              mediaClassName="max-h-[calc(92dvh-16rem)]"
            />
          ) : (
            <p className="text-ink/65 py-16 text-center text-[11.5px]">This item has no image yet.</p>
          )}
        </div>

        <MediaThumbStrip
          items={views.map((entry) => ({
            id: `${entry.angle}:${entry.cleanAssetId ?? entry.assetId}`,
            url: urlOf(entry.cleanAssetId ?? entry.assetId) ?? '',
            kind: 'image' as const,
          }))}
          index={safeIndex}
          onSelect={setIndex}
          label="Choose a view"
        />
        {views.length > 1 ? (
          <p className="text-ink/65 text-[11px]">Arrow keys switch views. Esc closes.</p>
        ) : null}
      </DialogSurface>
    </Dialog.Root>
  )
}
