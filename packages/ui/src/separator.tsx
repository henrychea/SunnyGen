import type { ComponentProps } from 'react'
import { cn } from './cn'

export function Separator({ className, ...props }: ComponentProps<'div'>) {
  return <div role="separator" className={cn('bg-line h-px w-full', className)} {...props} />
}

export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'border-line bg-canvas text-ink/55 inline-flex h-5 min-w-5 items-center justify-center rounded border px-1.5 font-sans text-[10px] font-semibold',
        className,
      )}
      {...props}
    />
  )
}
