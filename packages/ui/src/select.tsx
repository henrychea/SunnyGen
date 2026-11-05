import type { ComponentProps } from 'react'
import { cn } from './cn'

export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'border-line bg-surface text-ink h-10 w-full appearance-none rounded-xl border px-3 text-[13px]',
        'focus-visible:border-accent/45 focus-visible:ring-accent/15 focus-visible:outline-none focus-visible:ring-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
}
