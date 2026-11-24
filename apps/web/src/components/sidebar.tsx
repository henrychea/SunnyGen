import { useQuery } from '@tanstack/react-query'
import { Link, useRouterState } from '@tanstack/react-router'
import { APP_NAME, APP_VERSION } from '@sunnygen/core'
import { cn, motionFade, motionSpring, motionTransition } from '@sunnygen/ui'
import {
  Camera,
  Clapperboard,
  FolderOpen,
  Image as ImageIcon,
  Images,
  LayoutGrid,
  Menu,
  MessageSquare,
  Settings,
  Shirt,
  Sparkles,
  X,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState, type ComponentType } from 'react'
import { loadSettings } from '~/server/settings.functions'

interface NavItem {
  to: string
  label: string
  icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>
  exact?: boolean
}

const NAV: NavItem[] = [
  { to: '/', label: 'Today', icon: Sparkles, exact: true },
  { to: '/images', label: 'Images', icon: ImageIcon },
  { to: '/video', label: 'Video', icon: Clapperboard },
  { to: '/canvas', label: 'Canvas', icon: LayoutGrid },
  { to: '/gallery', label: 'Gallery', icon: Images },
  { to: '/studio', label: 'Studio', icon: Shirt },
  { to: '/shoots', label: 'Shoots', icon: Camera },
  { to: '/assets', label: 'Assets', icon: FolderOpen },
  { to: '/chat', label: 'Assistant', icon: MessageSquare },
]

function isActive(pathname: string, item: NavItem): boolean {
  return item.exact ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`)
}

function SidebarBody({
  onNavigate,
  onClose,
  scope,
}: {
  onNavigate?: () => void
  onClose?: () => void
  scope: string
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => loadSettings() })
  const configured = settings.data?.providers.filter((provider) => provider.configured).length ?? 0

  return (
    <div className="flex min-h-0 flex-1 flex-col px-3 py-4">
      <div className="flex items-center justify-between gap-2">
        <Link
          to="/"
          onClick={onNavigate}
          className="hover:bg-ink/[0.04] flex min-w-0 items-center gap-2.5 rounded-xl px-2 py-1.5 transition-[background-color,transform] duration-150 ease-out active:scale-[0.985]"
        >
          <img src="/favicon.svg" alt="" width={30} height={30} className="rounded-[9px]" />
          <span className="font-display text-ink truncate text-[14.5px] font-semibold tracking-tight">
            {APP_NAME}
          </span>
        </Link>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="text-ink/45 hover:bg-ink/5 hover:text-ink grid size-8 shrink-0 place-items-center rounded-lg transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.92]"
          >
            <X size={17} />
          </button>
        ) : null}
      </div>

      <p className="text-ink/35 mt-6 px-2.5 text-[9.5px] font-semibold tracking-[0.14em] uppercase">
        Workspace
      </p>
      <nav className="mt-2 flex flex-col gap-0.5" aria-label="Primary">
        {NAV.map((item) => {
          const active = isActive(pathname, item)
          const Icon = item.icon
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[12.5px] font-medium',
                'transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.985]',
                active ? 'text-ink' : 'text-ink/55 hover:bg-ink/[0.04] hover:text-ink/85',
              )}
            >
              {active ? (
                <motion.span
                  layoutId={`${scope}-nav-active`}
                  transition={motionSpring}
                  className="bg-ink/[0.07] absolute inset-0 rounded-xl"
                />
              ) : null}
              <span className="relative flex items-center gap-2.5">
                <Icon
                  size={15}
                  strokeWidth={1.9}
                  className={cn(
                    'transition-colors duration-150 ease-out',
                    active ? 'text-accent' : 'text-ink/40',
                  )}
                />
                {item.label}
              </span>
            </Link>
          )
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-3">
        <div className="border-line/80 bg-canvas/60 rounded-xl border px-3 py-2.5">
          <div className="text-ink/40 flex items-center gap-2 text-[10.5px] font-semibold tracking-[0.09em] uppercase">
            <AnimatePresence initial={false} mode="wait">
              <motion.span
                key={`providers-${configured}`}
                variants={motionFade}
                initial="hidden"
                animate="visible"
                exit="hidden"
                className="flex items-center gap-2"
              >
                <span className={cn('size-1.5 rounded-full', configured > 0 ? 'bg-success' : 'bg-warning')} />
                {configured > 0
                  ? `${configured} provider${configured === 1 ? '' : 's'} ready`
                  : 'No provider key'}
              </motion.span>
            </AnimatePresence>
          </div>
          <p className="text-ink/45 mt-1 text-[11px] leading-snug">Local data. Bring your own keys.</p>
        </div>

        <Link
          to="/settings"
          onClick={onNavigate}
          className={cn(
            'relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[12.5px] font-medium',
            'transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.985]',
            pathname.startsWith('/settings')
              ? 'text-ink'
              : 'text-ink/55 hover:bg-ink/[0.04] hover:text-ink/85',
          )}
        >
          {pathname.startsWith('/settings') ? (
            <motion.span
              layoutId={`${scope}-settings-active`}
              transition={motionSpring}
              className="bg-ink/[0.07] absolute inset-0 rounded-xl"
            />
          ) : null}
          <span className="relative flex items-center gap-2.5">
            <Settings size={15} strokeWidth={1.9} className="text-ink/40" />
            Settings
          </span>
        </Link>
        <p className="text-ink/30 px-2.5 text-[10px]">v{APP_VERSION}</p>
      </div>
    </div>
  )
}

export function Sidebar() {
  return (
    <aside className="border-line/80 bg-surface/95 relative z-[55] hidden w-[228px] shrink-0 flex-col border-r md:flex">
      <SidebarBody scope="sidebar" />
    </aside>
  )
}

export function MobileNav() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <header className="pwa-safe-top border-line bg-surface/70 flex items-center justify-between px-4 pb-2.5 md:hidden">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            aria-expanded={open}
            className="text-ink/55 hover:bg-ink/5 hover:text-ink grid size-9 place-items-center rounded-lg transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.92]"
          >
            <Menu size={18} />
          </button>
          <Link
            to="/"
            className="flex items-center gap-2 transition-transform duration-150 ease-out active:scale-[0.97]"
          >
            <img src="/favicon.svg" alt="" width={26} height={26} className="rounded-lg" />
            <span className="font-display text-[13.5px] font-semibold">{APP_NAME}</span>
          </Link>
        </div>
        <Link
          to="/settings"
          aria-label="Settings"
          className="text-ink/50 hover:text-ink rounded-lg p-1.5 transition-[color,transform] duration-150 ease-out active:scale-[0.92]"
        >
          <Settings size={17} />
        </Link>
      </header>

      <AnimatePresence>
        {open ? (
          <motion.div
            key="mobile-backdrop"
            onClick={() => setOpen(false)}
            variants={motionFade}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="bg-ink/35 fixed inset-0 z-[60] backdrop-blur-[1px] md:hidden"
          />
        ) : null}
        {open ? (
          <motion.aside
            key="mobile-drawer"
            aria-label="Menu"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={motionTransition}
            className="pwa-safe-top pwa-safe-bottom border-line bg-surface fixed inset-y-0 left-0 z-[65] flex w-[82vw] max-w-[290px] flex-col border-r shadow-2xl md:hidden"
          >
            <SidebarBody scope="mobile" onNavigate={() => setOpen(false)} onClose={() => setOpen(false)} />
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </>
  )
}
