import { useQuery } from '@tanstack/react-query'
import { Link, useRouterState } from '@tanstack/react-router'
import { APP_NAME, APP_VERSION } from '@sunnygen/core'
import { cn } from '@sunnygen/ui'
import { FolderOpen, Images, LayoutGrid, MessageSquare, Settings, Shirt, Sparkles } from 'lucide-react'
import type { ComponentType } from 'react'
import { loadSettings } from '~/server/settings.functions'

interface NavItem {
  to: string
  label: string
  icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>
  exact?: boolean
}

const NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: Sparkles, exact: true },
  { to: '/canvas', label: 'Canvas', icon: LayoutGrid },
  { to: '/gallery', label: 'Gallery', icon: Images },
  { to: '/studio', label: 'Studio', icon: Shirt },
  { to: '/assets', label: 'Assets', icon: FolderOpen },
  { to: '/chat', label: 'Assistant', icon: MessageSquare },
]

function isActive(pathname: string, item: NavItem): boolean {
  return item.exact ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`)
}

export function Sidebar() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => loadSettings() })
  const configured = settings.data?.providers.filter((provider) => provider.configured).length ?? 0

  return (
    <aside className="border-line/80 bg-surface/55 hidden w-[228px] shrink-0 flex-col border-r px-3 py-4 md:flex">
      <Link to="/" className="flex items-center gap-2.5 rounded-xl px-2 py-1.5">
        <img src="/favicon.svg" alt="" width={30} height={30} className="rounded-[9px]" />
        <span className="font-display text-ink text-[14.5px] font-semibold tracking-tight">{APP_NAME}</span>
      </Link>

      <nav className="mt-6 flex flex-col gap-0.5" aria-label="Primary">
        {NAV.map((item) => {
          const active = isActive(pathname, item)
          const Icon = item.icon
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[12.5px] font-medium transition-colors',
                active ? 'bg-ink/[0.07] text-ink' : 'text-ink/55 hover:bg-ink/[0.04] hover:text-ink/85',
              )}
            >
              <Icon size={15} strokeWidth={1.9} className={active ? 'text-accent' : 'text-ink/40'} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-3">
        <div className="border-line/80 bg-canvas/60 rounded-xl border px-3 py-2.5">
          <div className="text-ink/40 flex items-center gap-2 text-[10.5px] font-semibold tracking-[0.09em] uppercase">
            <span className={cn('size-1.5 rounded-full', configured > 0 ? 'bg-success' : 'bg-warning')} />
            {configured > 0
              ? `${configured} provider${configured === 1 ? '' : 's'} ready`
              : 'No provider key'}
          </div>
          <p className="text-ink/45 mt-1 text-[11px] leading-snug">Local data. Bring your own keys.</p>
        </div>

        <Link
          to="/settings"
          className={cn(
            'flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[12.5px] font-medium transition-colors',
            pathname.startsWith('/settings')
              ? 'bg-ink/[0.07] text-ink'
              : 'text-ink/55 hover:bg-ink/[0.04] hover:text-ink/85',
          )}
        >
          <Settings size={15} strokeWidth={1.9} className="text-ink/40" />
          Settings
        </Link>
        <p className="text-ink/30 px-2.5 text-[10px]">v{APP_VERSION}</p>
      </div>
    </aside>
  )
}

export function MobileNav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })

  return (
    <div className="border-line bg-surface/70 border-b md:hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <img src="/favicon.svg" alt="" width={26} height={26} className="rounded-lg" />
          <span className="font-display text-[13.5px] font-semibold">{APP_NAME}</span>
        </Link>
        <Link to="/settings" aria-label="Settings" className="text-ink/50">
          <Settings size={17} />
        </Link>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-2" aria-label="Primary">
        {NAV.map((item) => {
          const Icon = item.icon
          const active = isActive(pathname, item)
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium',
                active ? 'bg-ink/[0.08] text-ink' : 'text-ink/50',
              )}
            >
              <Icon size={13} />
              {item.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
