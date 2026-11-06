import {
  SLOT_LABELS,
  SOURCE_LABELS,
  type GarmentSlot,
  type GarmentSource,
  type StudioKind,
} from '@sunnygen/core'
import { Badge, Button, Card, cn } from '@sunnygen/ui'
import { ImagePlus, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
import type { StudioItemDto } from '~/server/studio.functions'

export function StudioLibraryGrid({
  kind,
  items,
  onAdd,
  onEdit,
  onDelete,
  onPrepare,
  preparingId,
}: {
  kind: StudioKind
  items: StudioItemDto[]
  onAdd: () => void
  onEdit: (item: StudioItemDto) => void
  onDelete: (item: StudioItemDto) => void
  onPrepare?: (item: StudioItemDto) => void
  preparingId?: string | null
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <button
        type="button"
        onClick={onAdd}
        className="border-line bg-surface/50 text-ink/40 hover:border-accent/40 hover:text-accent flex min-h-44 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed transition-colors"
      >
        <Plus size={20} />
        <span className="text-[11.5px] font-medium">Add {kind}</span>
      </button>

      {items.map((item) => {
        const sourceKind = item.data.sourceKind as GarmentSource | undefined
        const needsPrep =
          kind === 'garment' &&
          item.assetUrl &&
          !item.cleanAssetUrl &&
          (sourceKind === 'on-model' || sourceKind === 'supplier')
        const image = kind === 'garment' ? (item.cleanAssetUrl ?? item.assetUrl) : item.assetUrl

        return (
          <Card key={item.id} className="overflow-hidden">
            <div className="bg-ink/[0.04] relative aspect-[4/3]">
              {image ? (
                <img src={image} alt="" loading="lazy" className="size-full object-cover" />
              ) : (
                <div className="grid size-full place-items-center bg-[#FFFDF8]">
                  <span className="bg-ink/[0.04] size-8 rounded-full" />
                </div>
              )}
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
            </div>
            <div className="flex flex-col gap-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-ink/80 truncate text-[12px] font-medium">{item.name}</p>
                  <p className="text-ink/40 truncate text-[10px]">
                    {item.kind === 'avatar'
                      ? item.data.style === 'anime'
                        ? 'Anime 2D'
                        : 'Photoreal'
                      : item.kind === 'garment'
                        ? `${SLOT_LABELS[(item.data.slot as GarmentSlot) ?? 'top']} · ${SOURCE_LABELS[(item.data.sourceKind as GarmentSource) ?? 'flat-lay']}`
                        : new Date(item.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {!item.builtin ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onEdit(item)}
                        className="text-ink/40 hover:bg-ink/5 hover:text-ink grid size-7 place-items-center rounded-md"
                        aria-label={`Edit ${item.name}`}
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Delete "${item.name}"?`)) onDelete(item)
                        }}
                        className="text-ink/40 hover:bg-error/10 hover:text-error grid size-7 place-items-center rounded-md"
                        aria-label={`Delete ${item.name}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              {kind === 'garment' && onPrepare && !item.builtin ? (
                <Button
                  size="sm"
                  variant={needsPrep ? 'primary' : 'outline'}
                  className="h-7 text-[10.5px]"
                  loading={preparingId === item.id}
                  onClick={() => onPrepare(item)}
                >
                  <Sparkles size={10} />
                  {item.cleanAssetUrl ? 'Re-prep' : 'Prepare'}
                </Button>
              ) : null}
            </div>
          </Card>
        )
      })}
    </div>
  )
}

export function StudioEmpty({ kind, onAdd }: { kind: StudioKind; onAdd: () => void }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className={cn(
        'border-line bg-surface/50 flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-6 py-16 text-center',
        'text-ink/40 hover:border-accent/40 hover:text-accent',
      )}
    >
      <ImagePlus size={22} />
      <span className="text-[12px] font-medium">Add the first {kind}</span>
    </button>
  )
}
