import { useRouterState } from '@tanstack/react-router'
import { cn, motionTransition } from '@sunnygen/ui'
import { motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { AssistantFab } from './assistant/fab'
import { AssistantPanel } from './assistant/panel'
import { isAssistantShortcut } from '~/lib/assistant-shortcut'
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
  const onChat = pathname === '/chat'

  const [assistantOpen, setAssistantOpen] = useState(false)
  const [assistantWorking, setAssistantWorking] = useState(false)
  const [assistantUnread, setAssistantUnread] = useState(false)
  const openRef = useRef(false)
  const workingRef = useRef(false)
  const openedAt = useRef(0)
  const panelOpen = assistantOpen && !onChat

  useEffect(() => {
    openRef.current = assistantOpen
  }, [assistantOpen])

  const handlePanelOpenChange = useCallback((next: boolean) => {
    if (!next && Date.now() - openedAt.current < 250) return
    if (next) {
      openedAt.current = Date.now()
      setAssistantUnread(false)
    }
    setAssistantOpen(next)
  }, [])

  const handleWorkingChange = useCallback((working: boolean) => {
    if (working === workingRef.current) return
    workingRef.current = working
    setAssistantWorking(working)
    if (!working && !openRef.current) setAssistantUnread(true)
  }, [])

  useEffect(() => {
    if (onChat) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isAssistantShortcut(event)) return
      event.preventDefault()
      if (openRef.current) {
        setAssistantOpen(false)
        return
      }
      setAssistantUnread(false)
      openedAt.current = Date.now()
      setAssistantOpen(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onChat])

  return (
    <div className="bg-canvas flex h-dvh overflow-hidden">
      <Sidebar />
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <NavigationProgress pending={pending} />
        <MobileNav />
        <main
          className={cn(
            'min-h-0 flex-1 overflow-hidden',
            panelOpen &&
              'md:pr-[420px] transition-[padding] duration-200 ease-out motion-reduce:transition-none',
          )}
        >
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

      {!onChat && !panelOpen ? (
        <AssistantFab
          onOpen={() => {
            openedAt.current = Date.now()
            setAssistantUnread(false)
            setAssistantOpen(true)
          }}
          working={assistantWorking}
          unread={assistantUnread}
          pathname={pathname}
        />
      ) : null}

      <AssistantPanel
        open={panelOpen}
        onOpenChange={handlePanelOpenChange}
        onWorkingChange={handleWorkingChange}
      />
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
        {eyebrow ? <p className="text-accent text-[11px] font-semibold">{eyebrow}</p> : null}
        <h1 className="font-display text-ink mt-1 text-[24px] font-semibold tracking-tight md:text-[27px]">
          {title}
        </h1>
        {description ? (
          <p className="text-ink/65 mt-1.5 max-w-2xl text-[12.5px] leading-relaxed">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

export function PageBody({ children }: { children: ReactNode }) {
  return <div className="px-4 py-5 md:px-9 md:py-8">{children}</div>
}
