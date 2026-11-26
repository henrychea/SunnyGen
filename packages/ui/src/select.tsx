import type { ComponentProps } from 'react'
import { cn } from './cn'

export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'border-line-strong bg-surface text-ink h-10 w-full appearance-none rounded-xl border px-3 text-[13px]',
        'transition-[color,box-shadow,border-color] duration-150 ease-out',
        'hover:border-ink/60 focus-visible:border-accent/70 focus-visible:ring-accent/70 focus-visible:outline-none focus-visible:ring-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
}
