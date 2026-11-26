import { Plus, Search, Trash2, X } from 'lucide-react'
import { cn, motionFade, motionFadeRise, motionSpring } from '@sunnygen/ui'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { formatRelativeDate } from '~/lib/format'

export interface SessionRailItem {
  id: string
  title: string
  updatedAt: number
}

const SKELETON_ROWS = [0, 1, 2, 3, 4]

export function SessionRail({
  sessions,
  activeId,
  onSelect,
  onNew,
  onDelete,
  loading = false,
}: {
  sessions: SessionRailItem[]
  activeId?: string
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  loading?: boolean
}) {
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const visible = needle
    ? sessions.filter((session) => session.title.toLowerCase().includes(needle))
    : sessions

  return (
    <aside className="border-line/70 bg-surface/45 hidden w-64 shrink-0 flex-col border-r md:flex">
      <div className="border-line/60 flex items-center justify-between gap-2 border-b px-4 pt-3 pb-2">
        <p className="text-ink/65 text-[11px] font-semibold">Chats</p>
        <button
          type="button"
          onClick={onNew}
          className="text-ink/65 hover:bg-ink/[0.05] hover:text-ink inline-flex size-7 items-center justify-center rounded-lg transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.92]"
          aria-label="New chat"
          title="New chat"
        >
          <Plus size={15} />
        </button>
      </div>

      <div className="px-2 pt-2">
        <div className="border-line-strong bg-canvas/50 focus-within:border-accent/35 flex h-8 items-center gap-1.5 rounded-lg border px-2 transition-colors duration-150">
          <Search size={12} className="text-ink/65 shrink-0" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            className="text-ink placeholder:text-ink/65 min-w-0 flex-1 bg-transparent text-[11.5px] outline-none"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="text-ink/65 hover:text-ink shrink-0 rounded p-0.5 transition-colors"
            >
              <X size={11} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <AnimatePresence initial={false} mode="wait">
          {loading ? (
            <motion.div
              key="rail-loading"
              variants={motionFade}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className="flex flex-col gap-1.5 py-1"
            >
              {SKELETON_ROWS.map((row) => (
                <div key={row} className="skeleton-shimmer h-9 rounded-lg" />
              ))}
            </motion.div>
          ) : visible.length === 0 ? (
            <motion.p
              key={needle ? 'rail-no-match' : 'rail-empty'}
              variants={motionFade}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className="text-ink/65 px-2.5 py-6 text-[12px] leading-relaxed"
            >
              {needle ? 'No chats match that search.' : 'No chats yet. Ask something to start one.'}
            </motion.p>
          ) : (
            <motion.ul
              key="rail-list"
              variants={motionFade}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className="flex flex-col gap-0.5"
            >
              <AnimatePresence initial={false} mode="popLayout">
                {visible.map((session) => {
                  const active = session.id === activeId
                  return (
                    <motion.li
                      key={session.id}
                      layout
                      variants={motionFadeRise}
                      initial="hidden"
                      animate="visible"
                      exit="hidden"
                      className="group relative"
                    >
                      <button
                        type="button"
                        onClick={() => onSelect(session.id)}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'relative block w-full min-w-0 rounded-lg py-1.5 pr-9 pl-2.5 text-left',
                          'transition-[color,transform] duration-150 ease-out active:scale-[0.99]',
                          active
                            ? 'text-accent font-medium'
                            : 'text-ink/70 hover:bg-ink/[0.045] hover:text-ink',
                        )}
                        title={session.title}
                      >
                        {active ? (
                          <motion.span
                            layoutId="chat-rail-active"
                            transition={motionSpring}
                            className="bg-accent/10 absolute inset-0 rounded-lg"
                          />
                        ) : null}
                        <span className="relative block truncate text-[12.5px]">{session.title}</span>
                        <span
                          className={cn(
                            'relative mt-0.5 block text-[11px] tracking-wide',
                            active ? 'text-accent' : 'text-ink/65',
                          )}
                        >
                          {formatRelativeDate(session.updatedAt)}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(session.id)}
                        className={cn(
                          'absolute top-1/2 right-1.5 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md',
                          'text-ink/65 hover:bg-ink/[0.06] hover:text-error transition-[opacity,color,transform] duration-150 ease-out active:scale-[0.9]',
                          'opacity-0 focus-visible:opacity-100 group-hover:opacity-100',
                        )}
                        aria-label={`Delete ${session.title}`}
                      >
                        <Trash2 size={12.5} />
                      </button>
                    </motion.li>
                  )
                })}
              </AnimatePresence>
            </motion.ul>
          )}
        </AnimatePresence>
      </div>
    </aside>
  )
}
