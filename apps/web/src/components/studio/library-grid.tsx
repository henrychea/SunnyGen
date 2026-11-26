import {
  SLOT_LABELS,
  SOURCE_LABELS,
  parseAvatarLora,
  parseGarmentViews,
  type GarmentSlot,
  type GarmentSource,
  type StudioKind,
} from '@sunnygen/core'
import { Badge, Button, Card, cn, FadeImage, motionFast } from '@sunnygen/ui'
import { ImagePlus, Paintbrush, Pencil, Plus, Trash2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { thumbSrcSet, thumbUrl } from '~/lib/media-thumbs'
import type { StudioItemDto } from '~/server/studio.functions'

export function StudioLibraryGrid({
  kind,
  items,
  onAdd,
  onEdit,
  onDelete,
  onPrepare,
  onPreview,
  preparingId,
}: {
  kind: StudioKind
  items: StudioItemDto[]
  onAdd: () => void
  onEdit: (item: StudioItemDto) => void
  onDelete: (item: StudioItemDto) => void
  onPrepare?: (item: StudioItemDto) => void
  onPreview?: (item: StudioItemDto) => void
  preparingId?: string | null
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <button
        type="button"
        onClick={onAdd}
        className="border-line-strong bg-surface/50 text-ink/65 hover:border-accent/40 hover:text-accent hover:bg-surface flex min-h-44 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed transition-[color,border-color,background-color,scale] duration-200 ease-out active:scale-[0.99] motion-reduce:active:scale-100"
      >
        <Plus size={20} />
        <span className="text-[11.5px] font-medium">{kind === 'avatar' ? 'New avatar' : `Add ${kind}`}</span>
      </button>

      <AnimatePresence initial={false}>
        {items.map((item) => {
          const sourceKind = item.data.sourceKind as GarmentSource | undefined
          const views = kind === 'garment' ? parseGarmentViews(item) : []
          const unprepared =
            kind === 'garment' ? views.filter((view) => !view.cleanAssetId).length : item.cleanAssetId ? 0 : 1
          const prepared = kind === 'garment' || kind === 'scene'
          const needsPrep =
            prepared &&
            !item.builtin &&
            unprepared > 0 &&
            (kind === 'scene' || sourceKind === 'on-model' || sourceKind === 'supplier')
          const image =
            kind === 'garment' || kind === 'scene' ? (item.cleanAssetUrl ?? item.assetUrl) : item.assetUrl
          const canPreview = Boolean(onPreview) && (kind === 'garment' || kind === 'scene')
          const lora = kind === 'avatar' ? parseAvatarLora(item.data.lora) : null

          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={motionFast}
              className="min-w-0"
            >
              <Card className="hover:border-ink/60 h-full overflow-hidden transition-[border-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5">
                <div className="bg-ink/[0.04] relative aspect-[4/3]">
                  {image ? (
                    <FadeImage
                      shimmer
                      src={thumbUrl(image, 640)}
                      srcSet={thumbSrcSet(image, [320, 640])}
                      sizes="(min-width: 1280px) 280px, (min-width: 640px) 45vw, 92vw"
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="bg-surface grid size-full place-items-center">
                      <span className="bg-ink/[0.04] size-8 rounded-full" />
                    </div>
                  )}
                  {canPreview ? (
                    <button
                      type="button"
                      onClick={() => onPreview?.(item)}
                      aria-label={`Preview ${item.name}`}
                      className="group text-canvas hover:bg-ink/25 absolute inset-0 grid place-items-center bg-transparent transition-colors duration-150 ease-out"
                    >
                      <span className="bg-ink/70 rounded-md px-2 py-1 text-[11px] font-medium opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100 group-focus-visible:opacity-100">
                        Preview
                      </span>
                    </button>
                  ) : null}
                  {item.builtin ? (
                    <Badge tone="neutral" className="absolute top-2 left-2">
                      Built in
                    </Badge>
                  ) : null}
                  {needsPrep ? (
                    <Badge tone="warning" className="absolute top-2 left-2">
                      Needs prep
                    </Badge>
                  ) : null}
                  {lora ? (
                    <Badge
                      tone="accent"
                      className="border-line-strong bg-surface absolute top-2 right-2 border px-2 whitespace-nowrap"
                    >
                      LoRA v{lora.version}
                    </Badge>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-ink/80 truncate text-[12px] font-medium">{item.name}</p>
                      <p className="text-ink/65 truncate text-[11px]">
                        {item.kind === 'avatar'
                          ? item.data.style === 'anime'
                            ? 'Anime 2D'
                            : 'Photoreal'
                          : item.kind === 'garment'
                            ? `${SLOT_LABELS[(item.data.slot as GarmentSlot) ?? 'top']} · ${SOURCE_LABELS[(item.data.sourceKind as GarmentSource) ?? 'flat-lay']}${
                                views.length > 1 ? ` · ${views.length} views` : ''
                              }`
                            : new Date(item.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {!item.builtin ? (
                        <>
                          {kind === 'avatar' ? (
                            <button
                              type="button"
                              onClick={() => onEdit(item)}
                              className="text-ink/65 hover:bg-ink/5 hover:text-ink rounded-md px-1.5 py-1 text-[11px] font-medium transition-[color,background-color] duration-150 ease-out"
                            >
                              Edit profile
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onEdit(item)}
                              className="text-ink/65 hover:bg-ink/5 hover:text-ink grid size-7 place-items-center rounded-md transition-[color,background-color,scale] duration-150 ease-out active:scale-[0.92] motion-reduce:active:scale-100"
                              aria-label={`Edit ${item.name}`}
                            >
                              <Pencil size={12} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                window.confirm(`Delete "${item.name}"? Its images are deleted from disk too.`)
                              ) {
                                onDelete(item)
                              }
                            }}
                            className="text-ink/65 hover:bg-error/10 hover:text-error grid size-7 place-items-center rounded-md transition-[color,background-color,scale] duration-150 ease-out active:scale-[0.92] motion-reduce:active:scale-100"
                            aria-label={`Delete ${item.name}`}
                          >
                            <Trash2 size={12} />
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>

                  {(kind === 'garment' || kind === 'scene') && onPrepare && !item.builtin ? (
                    <Button
                      size="sm"
                      variant={needsPrep ? 'primary' : 'outline'}
                      className="h-7 text-[11px]"
                      loading={preparingId === item.id}
                      onClick={() => onPrepare(item)}
                    >
                      <Paintbrush size={10} />
                      {unprepared === 0
                        ? 'Re-prep'
                        : kind === 'garment'
                          ? `Prepare ${unprepared} view${unprepared === 1 ? '' : 's'}`
                          : 'Prepare'}
                    </Button>
                  ) : null}
                </div>
              </Card>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

export function StudioEmpty({ kind, onAdd }: { kind: StudioKind; onAdd: () => void }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className={cn(
        'border-line-strong bg-surface/50 flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-6 py-16 text-center',
        'text-ink/65 hover:border-accent/40 hover:text-accent transition-[color,border-color,scale] duration-200 ease-out active:scale-[0.99] motion-reduce:active:scale-100',
      )}
    >
      <ImagePlus size={22} />
      <span className="text-[12px] font-medium">Add the first {kind}</span>
    </button>
  )
}
