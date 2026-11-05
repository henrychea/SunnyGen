import { Plus, Trash2 } from 'lucide-react'
import { cn } from '@sunnygen/ui'

export interface SessionRailItem {
  id: string
  title: string
}

export function SessionRail({
  sessions,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: {
  sessions: SessionRailItem[]
  activeId?: string
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
}) {
  return (
    <aside className="border-line/70 bg-surface/45 hidden w-64 shrink-0 flex-col border-r md:flex">
      <div className="border-line/60 flex items-center justify-between gap-2 border-b px-4 py-3">
        <p className="text-ink/40 text-[10.5px] font-semibold uppercase tracking-[0.14em]">Chats</p>
        <button
          type="button"
          onClick={onNew}
          className="text-ink/45 hover:bg-ink/[0.05] hover:text-ink inline-flex size-7 items-center justify-center rounded-lg transition-colors"
          aria-label="New chat"
          title="New chat"
        >
          <Plus size={15} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {sessions.length === 0 ? (
          <p className="text-ink/35 px-2.5 py-6 text-[12px] leading-relaxed">
            No chats yet. Ask something to start one.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {sessions.map((session) => {
              const active = session.id === activeId
              return (
                <li key={session.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => onSelect(session.id)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'block w-full truncate rounded-lg py-2 pl-2.5 pr-9 text-left text-[12.5px] transition-colors',
                      active
                        ? 'bg-accent/10 text-accent font-medium'
                        : 'text-ink/70 hover:bg-ink/[0.045] hover:text-ink',
                    )}
                    title={session.title}
                  >
                    {session.title}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(session.id)}
                    className={cn(
                      'absolute right-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md',
                      'text-ink/30 hover:bg-ink/[0.06] hover:text-error transition-[opacity,color]',
                      'opacity-0 focus-visible:opacity-100 group-hover:opacity-100',
                    )}
                    aria-label={`Delete ${session.title}`}
                  >
                    <Trash2 size={12.5} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )
}
