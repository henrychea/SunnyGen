import { Loader2, MessageSquareText } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { LAYER, cn, motionPop } from '@sunnygen/ui'
import { assistantShortcutLabel } from '~/lib/assistant-shortcut'
import { usePromptContext } from '~/lib/assistant-context'

const noopSubscribe = () => () => {}

export function AssistantFab({
  onOpen,
  working,
  unread,
  pathname,
}: {
  onOpen: () => void
  working: boolean
  unread: boolean
  pathname: string
}) {
  const context = usePromptContext()
  const expanded = context?.expanded ?? false
  const [offset, setOffset] = useState(16)
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  )
  const shortcut = hydrated ? assistantShortcutLabel(navigator.userAgent) : 'Ctrl J'

  useEffect(() => {
    let frame = 0
    let observer: ResizeObserver | null = null

    const measure = () => {
      frame = 0
      const center = window.innerWidth - 24 - 28
      let bottom = 16
      document.querySelectorAll<HTMLElement>('[data-assistant-clearance]').forEach((element) => {
        const rect = element.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) return
        if (rect.right < center - 44 || rect.left > center + 44) return
        if (rect.top >= window.innerHeight || rect.bottom < window.innerHeight - 96) return
        bottom = Math.max(bottom, window.innerHeight - rect.top + 12)
      })
      setOffset(Math.min(Math.round(bottom), Math.round(window.innerHeight * 0.55)))
    }

    const schedule = () => {
      if (frame) return
      frame = requestAnimationFrame(measure)
    }

    schedule()
    observer = new ResizeObserver(schedule)
    document.querySelectorAll('[data-assistant-clearance]').forEach((element) => {
      observer?.observe(element)
    })
    window.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)

    return () => {
      if (frame) cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
    }
  }, [expanded, pathname])

  if (expanded) return null

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open assistant"
      aria-keyshortcuts="Meta+J Control+J"
      title={`Open assistant (${shortcut})`}
      style={{ bottom: offset }}
      className={cn(
        'bg-accent hover:bg-accent/90 text-accent-ink fixed right-4 grid size-14 place-items-center rounded-full',
        'shadow-fab transition-[background-color,transform] duration-150 ease-out',
        'hover:scale-[1.03] active:scale-95 motion-reduce:hover:scale-100 motion-reduce:active:scale-100',
        'focus-visible:ring-accent/70 focus-visible:ring-offset-canvas focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
        'md:right-6',
        LAYER.fab,
      )}
    >
      <span className="relative grid place-items-center">
        <AnimatePresence initial={false} mode="popLayout">
          {working ? (
            <motion.span
              key="working"
              variants={motionPop}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className="grid place-items-center"
            >
              <Loader2 size={21} className="animate-spin" />
            </motion.span>
          ) : (
            <motion.span
              key="idle"
              variants={motionPop}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className="grid place-items-center"
            >
              <MessageSquareText size={21} />
            </motion.span>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {unread && !working ? (
            <motion.span
              key="unread"
              variants={motionPop}
              initial="hidden"
              animate="visible"
              exit="hidden"
              aria-hidden="true"
              className="bg-surface border-accent absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2"
            />
          ) : null}
        </AnimatePresence>
      </span>
      <span className="sr-only">
        {working ? 'Assistant is replying' : unread ? 'New assistant reply' : ''}
      </span>
    </button>
  )
}
