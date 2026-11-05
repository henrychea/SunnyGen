import type { ComponentProps } from 'react'
import { cn } from './cn'

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'border-line bg-surface text-ink flex min-h-24 w-full resize-y rounded-xl border px-3 py-2.5 text-[13.5px] leading-relaxed',
        'placeholder:text-ink/35 transition-colors',
        'focus-visible:border-accent/45 focus-visible:ring-accent/15 focus-visible:outline-none focus-visible:ring-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
