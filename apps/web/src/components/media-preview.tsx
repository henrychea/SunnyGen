import { cn, FadeImage, motionFast, motionList, motionListItem } from '@sunnygen/ui'
import { FileAudio } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { thumbSrcSet, thumbUrl } from '~/lib/media-thumbs'

export type MediaKind = 'image' | 'video' | 'audio'

export interface MediaThumbItem {
  id: string
  url: string
  kind: MediaKind
}

export function MediaCard({
  url,
  kind,
  alt,
  mediaClassName,
  className,
}: {
  url: string
  kind: MediaKind
  alt: string
  mediaClassName: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'bg-ink/[0.03] border-line/70 flex items-center justify-center overflow-hidden rounded-xl border p-2',
        className,
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${kind}:${url}`}
          initial={{ opacity: 0, scale: 0.995 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={motionFast}
          className="relative flex w-full items-center justify-center"
        >
          {kind === 'video' ? (
            <video
              src={url}
              controls
              autoPlay
              loop
              playsInline
              className={cn('w-auto max-w-full rounded-lg', mediaClassName)}
            />
          ) : kind === 'audio' ? (
            <audio src={url} controls autoPlay className="w-full max-w-md" />
          ) : (
            <FadeImage
              shimmer
              src={url}
              alt={alt}
              className={cn('w-auto max-w-full rounded-lg object-contain', mediaClassName)}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

export function MediaThumbStrip({
  items,
  index,
  onSelect,
  label,
}: {
  items: MediaThumbItem[]
  index: number
  onSelect: (index: number) => void
  label: string
}) {
  return (
    <motion.div
      role="listbox"
      aria-label={label}
      variants={motionList}
      initial="hidden"
      animate="visible"
      className="mt-2 flex gap-1.5 overflow-x-auto pb-1"
    >
      {items.map((item, itemIndex) => (
        <motion.button
          key={item.id}
          variants={motionListItem}
          type="button"
          role="option"
          aria-selected={itemIndex === index}
          aria-label={`Show item ${itemIndex + 1} of ${items.length}`}
          onClick={() => onSelect(itemIndex)}
          whileTap={{ scale: 0.96 }}
          className={cn(
            'relative size-16 shrink-0 overflow-hidden rounded-lg border transition-[border-color,box-shadow] duration-150 ease-out',
            itemIndex === index ? 'border-accent ring-accent/25 ring-2' : 'border-line hover:border-ink/25',
          )}
        >
          {item.kind === 'video' ? (
            <video src={item.url} muted preload="metadata" className="size-full object-cover" />
          ) : item.kind === 'audio' ? (
            <span className="text-ink/35 grid size-full place-items-center">
              <FileAudio size={16} />
            </span>
          ) : (
            <FadeImage
              shimmer
              src={thumbUrl(item.url, 160)}
              srcSet={thumbSrcSet(item.url, [160, 320])}
              sizes="64px"
              alt=""
              decoding="async"
              className="size-full object-cover"
              loading="lazy"
            />
          )}
        </motion.button>
      ))}
    </motion.div>
  )
}
