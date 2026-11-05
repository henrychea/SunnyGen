import type { ComponentProps } from 'react'
import { cn } from './cn'

const TONES = {
  neutral: 'bg-ink/6 text-ink/65',
  accent: 'bg-accent/10 text-accent',
  success: 'bg-success/12 text-success',
  warning: 'bg-warning/15 text-warning',
  error: 'bg-error/10 text-error',
} as const

export interface BadgeProps extends ComponentProps<'span'> {
  tone?: keyof typeof TONES
}

export function Badge({ className, tone = 'neutral', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em]',
        TONES[tone],
        className,
      )}
      {...props}
    />
  )
}
