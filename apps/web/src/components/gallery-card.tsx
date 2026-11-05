import { Play } from 'lucide-react'
import type { GalleryItem } from '~/server/library.functions'

export function GalleryCard({ item, onOpen }: { item: GalleryItem; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="border-line bg-surface hover:border-ink/20 group relative overflow-hidden rounded-2xl border text-left shadow-[0_14px_40px_-30px_rgba(42,30,23,0.4)] transition-[transform,border-color] hover:-translate-y-0.5"
    >
      <div className="bg-ink/[0.04] relative aspect-[4/5] overflow-hidden">
        {item.kind === 'video' ? (
          <>
            <video
              src={item.url}
              muted
              loop
              playsInline
              preload="metadata"
              className="size-full object-cover"
            />
            <span className="bg-ink/70 text-canvas absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.06em] backdrop-blur">
              <Play size={9} fill="currentColor" /> Video
            </span>
          </>
        ) : (
          <img
            src={item.url}
            alt={item.prompt || 'Generated image'}
            loading="lazy"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.025]"
          />
        )}
        {item.outputCount > 1 ? (
          <span className="bg-ink/70 text-canvas absolute right-2.5 top-2.5 rounded-md px-1.5 py-1 text-[9.5px] font-semibold backdrop-blur">
            {item.outputCount}
          </span>
        ) : null}
        <div className="from-ink/75 via-ink/20 pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t to-transparent p-3 pt-10 opacity-0 transition-opacity group-hover:opacity-100">
          <p className="text-canvas/90 line-clamp-2 text-[11px] leading-snug">{item.prompt}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-ink/75 truncate text-[11.5px] font-medium">{item.model}</p>
          <p className="text-ink/35 text-[10px]">
            {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </p>
        </div>
        <span className="bg-ink/[0.05] text-ink/45 rounded px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.05em]">
          {item.provider}
        </span>
      </div>
    </button>
  )
}
