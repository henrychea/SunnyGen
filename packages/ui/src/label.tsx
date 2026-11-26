import type { ComponentProps } from 'react'
import { cn } from './cn'

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return <label className={cn('text-ink/65 text-[11.5px] font-semibold', className)} {...props} />
}
