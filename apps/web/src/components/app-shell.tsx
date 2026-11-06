import type { ReactNode } from 'react'
import { MobileNav, Sidebar } from './sidebar'

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-canvas flex h-dvh overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <MobileNav />
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  )
}

export function PageScroll({ children }: { children: ReactNode }) {
  return <div className="h-full overflow-y-auto">{children}</div>
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
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  )
}

export function PageBody({ children }: { children: ReactNode }) {
  return <div className="px-6 py-6 md:px-9 md:py-8">{children}</div>
}
