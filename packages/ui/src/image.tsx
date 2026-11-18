import { useEffect, useState, type ComponentProps } from 'react'
import { cn } from './cn'

export interface FadeImageProps extends ComponentProps<'img'> {
  onLoadedChange?: (loaded: boolean) => void
  shimmer?: boolean
  shimmerClassName?: string
}

export function FadeImage({
  className,
  src,
  ref,
  onLoad,
  onLoadedChange,
  shimmer,
  shimmerClassName = 'inset-0',
  ...props
}: FadeImageProps) {
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null)
  const loaded = typeof src === 'string' && loadedSrc === src

  useEffect(() => {
    onLoadedChange?.(loaded)
  }, [loaded, onLoadedChange])

  const markLoaded = () => {
    if (typeof src !== 'string') return
    setLoadedSrc((current) => (current === src ? current : src))
  }

  return (
    <>
      {shimmer ? (
        <span
          aria-hidden="true"
          className={cn(
            'bg-ink/[0.06] pointer-events-none absolute transition-opacity duration-300 ease-out',
            loaded ? 'opacity-0' : 'animate-pulse motion-reduce:animate-none',
            shimmerClassName,
          )}
        />
      ) : null}
      <img
        {...props}
        src={src}
        ref={(node) => {
          if (node?.complete) markLoaded()
          if (typeof ref === 'function') ref(node)
          else if (ref) ref.current = node
        }}
        onLoad={(event) => {
          markLoaded()
          onLoad?.(event)
        }}
        className={cn(
          'transition-[opacity,scale] duration-300 ease-out motion-reduce:transition-none',
          loaded ? 'opacity-100' : 'opacity-0',
          className,
        )}
      />
    </>
  )
}
