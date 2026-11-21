import { useSyncExternalStore } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { cn } from './cn'
import { LAYER } from './layers'
import { motionFadeRise } from './motion'

export type ToastTone = 'info' | 'warning' | 'error'

export interface ToastOptions {
  tone?: ToastTone
  duration?: number
}

export interface ToastRecord {
  id: string
  message: string
  tone: ToastTone
  duration: number
}

const DEFAULT_DURATION = 4000
const MAX_VISIBLE = 4

let records: ToastRecord[] = []
let counter = 0
const listeners = new Set<() => void>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()

function emit(): void {
  for (const listener of listeners) listener()
}

function schedule(id: string, duration: number): void {
  if (duration <= 0) return
  const timer = setTimeout(() => dismissToast(id), duration)
  timers.set(id, timer)
}

function clearTimer(id: string): void {
  const timer = timers.get(id)
  if (!timer) return
  clearTimeout(timer)
  timers.delete(id)
}

export function toast(message: string, options: ToastOptions = {}): string {
  const trimmed = message.trim()
  const id = `toast-${(counter += 1)}`
  if (!trimmed) return id
  const entry: ToastRecord = {
    id,
    message: trimmed,
    tone: options.tone ?? 'info',
    duration: options.duration ?? DEFAULT_DURATION,
  }
  const next = [...records, entry]
  const overflow = next.slice(0, Math.max(0, next.length - MAX_VISIBLE))
  for (const dropped of overflow) clearTimer(dropped.id)
  records = next.slice(-MAX_VISIBLE)
  emit()
  schedule(id, entry.duration)
  return id
}

export function dismissToast(id: string): void {
  clearTimer(id)
  if (!records.some((entry) => entry.id === id)) return
  records = records.filter((entry) => entry.id !== id)
  emit()
}

export function clearToasts(): void {
  for (const id of timers.keys()) clearTimer(id)
  if (records.length === 0) return
  records = []
  emit()
}

export function useToasts(): ToastRecord[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): ToastRecord[] {
  return records
}

const EMPTY: ToastRecord[] = []

function getServerSnapshot(): ToastRecord[] {
  return EMPTY
}

const TONE_ACCENT: Record<ToastTone, string> = {
  info: 'bg-ink/25',
  warning: 'bg-warning',
  error: 'bg-error',
}

const TONE_ICON: Record<ToastTone, string> = {
  info: 'bg-ink/10 text-ink/60',
  warning: 'bg-warning/15 text-warning',
  error: 'bg-error/12 text-error',
}

const TONE_MARK: Record<ToastTone, string> = {
  info: 'i',
  warning: '!',
  error: '×',
}

export function Toaster({ className }: { className?: string }) {
  const toasts = useToasts()
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className={cn(
        'pointer-events-none fixed inset-x-3 bottom-[184px] flex flex-col items-center gap-2 md:inset-x-auto md:right-6 md:bottom-[196px] md:items-end',
        LAYER.toast,
        className,
      )}
    >
      <AnimatePresence initial={false}>
        {toasts.map((entry) => (
          <motion.div
            key={entry.id}
            layout
            variants={motionFadeRise}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="border-line bg-surface/95 pointer-events-auto relative w-full max-w-[360px] overflow-hidden rounded-xl border shadow-[0_18px_50px_-24px_rgba(42,30,23,0.55)] backdrop-blur-xl md:max-w-[340px]"
          >
            <span className={cn('absolute inset-y-0 left-0 w-[3px]', TONE_ACCENT[entry.tone])} />
            <div className="flex items-start gap-2 py-2.5 pr-2 pl-3.5">
              <span
                aria-hidden="true"
                className={cn(
                  'mt-px grid size-4 shrink-0 place-items-center rounded-full text-[10px] font-bold',
                  TONE_ICON[entry.tone],
                )}
              >
                {TONE_MARK[entry.tone]}
              </span>
              <p className="text-ink/80 flex-1 text-[11.5px] leading-[16px] font-medium">{entry.message}</p>
              <button
                type="button"
                onClick={() => dismissToast(entry.id)}
                aria-label="Dismiss notification"
                className="text-ink/30 hover:bg-ink/[0.06] hover:text-ink -mt-1 grid size-6 shrink-0 place-items-center rounded-md transition-[color,background-color,transform] active:scale-90"
              >
                <svg viewBox="0 0 12 12" aria-hidden="true" className="size-2.5">
                  <path
                    d="M2 2l8 8M10 2l-8 8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
