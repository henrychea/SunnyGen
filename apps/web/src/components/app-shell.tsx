import { useRouterState } from '@tanstack/react-router'
import { motionTransition } from '@sunnygen/ui'
import { motion } from 'motion/react'
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { MobileNav, Sidebar } from './sidebar'

const noopSubscribe = () => () => {}

const PROGRESS_DELAY_MS = 120
const PROGRESS_FADE_MS = 240
const PROGRESS_DONE_MS = 480

function NavigationProgress({ pending }: { pending: boolean }) {
  const [visible, setVisible] = useState(false)
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (pending) {
      const show = window.setTimeout(() => {
        setVisible(true)
        setValue(12)
      }, PROGRESS_DELAY_MS)
      return () => window.clearTimeout(show)
    }
    const settle = window.setTimeout(() => setValue((current) => (current > 0 ? 100 : 0)), 0)
    const fade = window.setTimeout(() => setVisible(false), PROGRESS_FADE_MS)
    const reset = window.setTimeout(() => setValue(0), PROGRESS_DONE_MS)
    return () => {
      window.clearTimeout(settle)
      window.clearTimeout(fade)
      window.clearTimeout(reset)
    }
  }, [pending])

  useEffect(() => {
    if (!pending || !visible) return
    const timer = window.setInterval(() => {
      setValue((current) => (current < 30 ? 42 : current < 62 ? 74 : Math.min(93, current + 2)))
    }, 180)
    return () => window.clearInterval(timer)
  }, [pending, visible])

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-[70] h-[2px]">
      <div
        className="bg-accent h-full origin-left transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none"
        style={{ transform: `scaleX(${value / 100})`, opacity: visible ? 1 : 0 }}
      />
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const pending = useRouterState({ select: (state) => state.status === 'pending' })
  const segment = pathname.split('/')[1] ?? ''
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  )
  const viewTransition = hydrated && 'startViewTransition' in window

  return (
    <div className="bg-canvas flex h-dvh overflow-hidden">
      <Sidebar />
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <NavigationProgress pending={pending} />
        <MobileNav />
        <main className="min-h-0 flex-1 overflow-hidden">
          <motion.div
            key={segment}
            initial={hydrated && !viewTransition ? { opacity: 0, y: 6 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={motionTransition}
            className="h-full"
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  )
}

export function PageScroll({ children }: { children: ReactNode }) {
  return <div className="pwa-safe-bottom h-full overflow-y-auto">{children}</div>
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <header className="border-line/70 flex flex-wrap items-end justify-between gap-4 border-b px-6 py-6 md:px-9">
      <div>
        {eyebrow ? (
          <p className="text-accent/80 text-[10.5px] font-semibold tracking-[0.14em] uppercase">{eyebrow}</p>
        ) : null}
        <h1 className="font-display text-ink mt-1 text-[24px] font-semibold tracking-tight md:text-[27px]">
          {title}
        </h1>
        {description ? (
          <p className="text-ink/50 mt-1.5 max-w-2xl text-[12.5px] leading-relaxed">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

export function PageBody({ children }: { children: ReactNode }) {
  return <div className="px-4 py-5 md:px-9 md:py-8">{children}</div>
}
