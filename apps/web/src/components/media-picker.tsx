import { useQuery } from '@tanstack/react-query'
import { Badge, Button, cn, Dialog, DialogSurface } from '@sunnygen/ui'
import { Check, X } from 'lucide-react'
import { useState } from 'react'
import { loadMediaAssets } from '~/server/library.functions'

export interface MediaPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind?: 'all' | 'image' | 'video'
  multiple?: boolean
  onSelect: (assetIds: string[]) => void
}

export function MediaPicker({
  open,
  onOpenChange,
  kind = 'image',
  multiple = true,
  onSelect,
}: MediaPickerProps) {
  const [selected, setSelected] = useState<string[]>([])
  const assets = useQuery({
    queryKey: ['media-assets', kind],
    queryFn: () => loadMediaAssets({ data: { kind } }),
    enabled: open,
  })

  const toggle = (id: string) => {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id)
      return multiple ? [...current, id] : [id]
    })
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) setSelected([])
        onOpenChange(next)
      }}
    >
      <DialogSurface className="w-[min(94vw,760px)] p-0">
        <div className="border-line flex items-center justify-between border-b px-5 py-3.5">
          <div>
            <Dialog.Title className="font-display text-[15px] font-semibold">Choose media</Dialog.Title>
            <p className="text-ink/40 mt-0.5 text-[11px]">
              {assets.isLoading ? 'Loading the local library…' : `${assets.data?.length ?? 0} files`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-ink/40 hover:bg-ink/5 hover:text-ink grid size-8 place-items-center rounded-lg"
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </div>

        <div className="max-h-[60dvh] overflow-y-auto p-4">
          {(assets.data ?? []).length === 0 ? (
            <p className="text-ink/45 py-16 text-center text-[12.5px]">
              Nothing in the library yet. Upload files in Assets first.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
              {(assets.data ?? []).map((asset) => {
                const active = selected.includes(asset.id)
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => toggle(asset.id)}
                    className={cn(
                      'bg-ink/[0.04] group relative aspect-square overflow-hidden rounded-lg border',
                      active ? 'border-accent ring-accent/25 ring-2' : 'border-line hover:border-ink/25',
                    )}
                  >
                    {asset.kind === 'video' ? (
                      <video src={asset.url} muted loop playsInline className="size-full object-cover" />
                    ) : (
                      <img src={asset.url} alt="" loading="lazy" className="size-full object-cover" />
                    )}
                    {asset.kind !== 'image' ? (
                      <Badge tone="neutral" className="bg-ink/60 text-canvas absolute left-1 top-1">
                        {asset.kind}
                      </Badge>
                    ) : null}
                    {active ? (
                      <span className="bg-accent absolute right-1 top-1 grid size-5 place-items-center rounded-full text-white">
                        <Check size={11} />
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="border-line flex items-center justify-between border-t px-5 py-3">
          <p className="text-ink/40 text-[11px]">
            {selected.length} selected{multiple ? '' : ' · one at a time'}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              disabled={selected.length === 0}
              onClick={() => {
                onSelect(selected)
                setSelected([])
                onOpenChange(false)
              }}
            >
              Use selection
            </Button>
          </div>
        </div>
      </DialogSurface>
    </Dialog.Root>
  )
}
