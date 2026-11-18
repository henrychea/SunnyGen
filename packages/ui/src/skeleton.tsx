import type { ComponentProps } from 'react'
import { cn } from './cn'

export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      className={cn('bg-ink/[0.06] animate-pulse rounded-xl motion-reduce:animate-none', className)}
      {...props}
    />
  )
}
