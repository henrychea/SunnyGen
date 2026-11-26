import { useQuery } from '@tanstack/react-query'
import {
  Badge,
  Button,
  cn,
  Dialog,
  DialogSurface,
  FadeImage,
  motionFade,
  motionFast,
  Skeleton,
} from '@sunnygen/ui'
import { Check, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { thumbSrcSet, thumbUrl } from '~/lib/media-thumbs'
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
            <p className="text-ink/65 mt-0.5 text-[11px]">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={assets.isPending ? 'loading' : `count-${assets.data?.length ?? 0}`}
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -3 }}
                  transition={motionFast}
                  className="inline-block"
                >
                  {assets.isPending ? 'Loading the local library…' : `${assets.data?.length ?? 0} files`}
                </motion.span>
              </AnimatePresence>
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-ink/65 hover:bg-ink/5 hover:text-ink grid size-8 place-items-center rounded-lg transition-[color,background-color,scale] duration-150 ease-out active:scale-[0.94] motion-reduce:active:scale-100"
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </div>

        <div className="max-h-[60dvh] overflow-y-auto p-4">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={assets.isPending ? 'loading' : (assets.data ?? []).length === 0 ? 'empty' : 'items'}
              variants={motionFade}
              initial="hidden"
              animate="visible"
              exit="hidden"
              transition={motionFast}
            >
              {assets.isPending ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                  {Array.from({ length: 15 }).map((_, index) => (
                    <Skeleton key={index} className="aspect-square rounded-lg" />
                  ))}
                </div>
              ) : (assets.data ?? []).length === 0 ? (
                <p className="text-ink/65 py-16 text-center text-[12.5px]">
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
                          'bg-ink/[0.04] group relative aspect-square overflow-hidden rounded-lg border transition-[border-color,box-shadow] duration-150 ease-out',
                          active
                            ? 'border-accent ring-accent/25 ring-2'
                            : 'border-line-strong hover:border-ink/60',
                        )}
                      >
                        {asset.kind === 'video' ? (
                          <video src={asset.url} muted loop playsInline className="size-full object-cover" />
                        ) : (
                          <FadeImage
                            shimmer
                            src={thumbUrl(asset.url, 320)}
                            srcSet={thumbSrcSet(asset.url, [320, 640])}
                            sizes="(min-width: 768px) 180px, 33vw"
                            width={asset.width ?? undefined}
                            height={asset.height ?? undefined}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="size-full object-cover"
                          />
                        )}
                        {asset.kind !== 'image' ? (
                          <Badge tone="neutral" className="bg-ink/60 text-canvas absolute top-1 left-1">
                            {asset.kind}
                          </Badge>
                        ) : null}
                        <AnimatePresence initial={false}>
                          {active ? (
                            <motion.span
                              key="check"
                              initial={{ opacity: 0, scale: 0.6 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.6 }}
                              transition={motionFast}
                              className="bg-accent text-accent-ink absolute top-1 right-1 grid size-5 place-items-center rounded-full"
                            >
                              <Check size={11} />
                            </motion.span>
                          ) : null}
                        </AnimatePresence>
                      </button>
                    )
                  })}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="border-line flex items-center justify-between border-t px-5 py-3">
          <p className="text-ink/65 text-[11px]">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={selected.length}
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -3 }}
                transition={motionFast}
                className="inline-block"
              >
                {selected.length} selected{multiple ? '' : ' · one at a time'}
              </motion.span>
            </AnimatePresence>
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
