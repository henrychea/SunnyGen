import { cn } from '@sunnygen/ui'
import { FileAudio } from 'lucide-react'

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
        <img
          src={url}
          alt={alt}
          className={cn('w-auto max-w-full rounded-lg object-contain', mediaClassName)}
        />
      )}
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
    <div role="listbox" aria-label={label} className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
      {items.map((item, itemIndex) => (
        <button
          key={item.id}
          type="button"
          role="option"
          aria-selected={itemIndex === index}
          aria-label={`Show item ${itemIndex + 1} of ${items.length}`}
          onClick={() => onSelect(itemIndex)}
          className={cn(
            'relative size-16 shrink-0 overflow-hidden rounded-lg border transition-colors',
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
            <img src={item.url} alt="" className="size-full object-cover" loading="lazy" />
          )}
        </button>
      ))}
    </div>
  )
}
