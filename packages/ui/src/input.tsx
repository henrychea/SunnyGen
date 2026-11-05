import type { ComponentProps } from 'react'
import { cn } from './cn'

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'border-line bg-surface text-ink flex h-10 w-full rounded-xl border px-3 text-[13.5px]',
        'placeholder:text-ink/35 transition-colors',
        'focus-visible:border-accent/45 focus-visible:ring-accent/15 focus-visible:outline-none focus-visible:ring-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
