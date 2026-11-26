import { cn, FadeImage } from '@sunnygen/ui'
import { Play } from 'lucide-react'
import { thumbSrcSet, thumbUrl } from '~/lib/media-thumbs'
import type { GalleryItem } from '~/server/library.functions'

export function GalleryCard({ item, onOpen }: { item: GalleryItem; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'border-line-strong bg-surface hover:border-ink/60 group relative overflow-hidden rounded-2xl border text-left transition-[transform,border-color] duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.985] motion-reduce:active:scale-100',
      )}
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
            <span className="bg-ink/70 text-canvas absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold">
              <Play size={9} fill="currentColor" /> Video
            </span>
          </>
        ) : (
          <FadeImage
            shimmer
            src={thumbUrl(item.url, 640)}
            srcSet={thumbSrcSet(item.url, [320, 640])}
            sizes="(min-width: 1280px) 320px, (min-width: 640px) 45vw, 92vw"
            width={item.width ?? undefined}
            height={item.height ?? undefined}
            alt={item.prompt || 'Generated image'}
            loading="lazy"
            decoding="async"
            className="size-full object-cover group-hover:scale-[1.025]"
          />
        )}
        {item.outputCount > 1 ? (
          <span className="bg-ink/70 text-canvas absolute top-2.5 right-2.5 rounded-md px-1.5 py-1 text-[11px] font-semibold">
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
          <p className="text-ink/65 text-[11px]">
            {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </p>
        </div>
        <span className="bg-ink/[0.05] text-ink/65 rounded px-1.5 py-0.5 text-[11px] font-semibold">
          {item.provider}
        </span>
      </div>
    </button>
  )
}

export function GalleryWallTile({ item, onOpen }: { item: GalleryItem; onOpen: () => void }) {
  const ratio = item.width && item.height ? `${item.width} / ${item.height}` : '4 / 5'
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'group bg-ink/[0.04] border-line-strong hover:border-ink/60 relative block w-full overflow-hidden rounded-xl border text-left transition-[border-color,scale] duration-200 ease-out active:scale-[0.985] motion-reduce:active:scale-100',
      )}
    >
      <div style={{ aspectRatio: ratio }} className="relative w-full overflow-hidden">
        {item.kind === 'video' ? (
          <video
            src={item.url}
            muted
            loop
            playsInline
            preload="metadata"
            className="size-full object-cover"
          />
        ) : (
          <FadeImage
            shimmer
            src={thumbUrl(item.url, 640)}
            srcSet={thumbSrcSet(item.url, [320, 640])}
            sizes="(min-width: 1280px) 320px, (min-width: 640px) 45vw, 92vw"
            width={item.width ?? undefined}
            height={item.height ?? undefined}
            alt={item.prompt || 'Generated image'}
            loading="lazy"
            decoding="async"
            className="size-full object-cover group-hover:scale-[1.02]"
          />
        )}
        {item.kind === 'video' ? (
          <span className="bg-ink/70 text-canvas absolute top-2 left-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold">
            <Play size={8} fill="currentColor" /> Video
          </span>
        ) : null}
        {item.outputCount > 1 ? (
          <span className="bg-ink/70 text-canvas absolute top-2 right-2 rounded px-1.5 py-0.5 text-[11px] font-semibold">
            {item.outputCount}
          </span>
        ) : null}
        <div className="from-ink/80 pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t to-transparent p-3 pt-10 opacity-0 transition-opacity group-hover:opacity-100">
          <p className="text-canvas/90 line-clamp-2 text-[11px] leading-snug">{item.prompt}</p>
          <p className="text-canvas/90 mt-0.5 truncate text-[11px]">{item.model}</p>
        </div>
      </div>
    </button>
  )
}
