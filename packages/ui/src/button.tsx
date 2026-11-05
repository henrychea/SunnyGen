import type { ComponentProps } from 'react'
import { cn } from './cn'

const VARIANTS = {
  primary:
    'bg-accent text-white shadow-[0_1px_0_rgba(255,255,255,0.18)_inset,0_6px_18px_-8px_rgba(163,22,33,0.55)] hover:bg-accent/90',
  secondary: 'bg-ink text-canvas hover:bg-ink/90',
  outline: 'border border-line bg-surface text-ink hover:border-ink/25 hover:bg-canvas',
  ghost: 'text-ink/70 hover:bg-ink/5 hover:text-ink',
  danger: 'bg-error text-white hover:bg-error/90',
} as const

const SIZES = {
  sm: 'h-8 rounded-lg px-3 text-[12.5px]',
  md: 'h-10 rounded-xl px-4 text-[13.5px]',
  lg: 'h-12 rounded-xl px-5 text-[14px]',
  icon: 'size-9 rounded-lg',
} as const

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: keyof typeof VARIANTS
  size?: keyof typeof SIZES
  loading?: boolean
}

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex select-none items-center justify-center gap-2 font-medium transition-colors',
        'focus-visible:ring-accent/35 focus-visible:ring-offset-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-45',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('size-3.5 animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
