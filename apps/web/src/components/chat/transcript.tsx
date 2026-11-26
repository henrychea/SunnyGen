import { useEffect, useRef, useState } from 'react'
import { Check, Copy, CornerDownLeft } from 'lucide-react'
import { cn, motionFadeRise } from '@sunnygen/ui'
import { AnimatePresence, motion } from 'motion/react'
import { Markdown } from './markdown'

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

export function TranscriptSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading conversation"
      className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 md:px-6"
    >
      <div className="skeleton-shimmer ml-auto h-12 w-2/5 rounded-2xl" />
      <div className="skeleton-shimmer h-24 w-3/4 rounded-2xl" />
      <div className="skeleton-shimmer ml-auto h-10 w-1/3 rounded-2xl" />
      <div className="skeleton-shimmer h-16 w-2/3 rounded-2xl" />
    </div>
  )
}

function StreamingLabel({ empty }: { empty: boolean }) {
  return (
    <span
      role="status"
      aria-label={empty ? 'Waiting for the assistant' : 'Assistant is replying'}
      className="text-ink/65 mt-1 inline-flex items-center gap-1.5 text-[11px]"
    >
      {empty ? null : 'Replying'}
      <span className="inline-flex items-center gap-1" aria-hidden="true">
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            className="bg-ink/35 size-1 animate-pulse rounded-full"
            style={{ animationDelay: `${dot * 160}ms` }}
          />
        ))}
      </span>
    </span>
  )
}

function MessageAction({
  label,
  onClick,
  active = false,
  children,
}: {
  label: string
  onClick: () => void
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px]',
        'transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.94]',
        active ? 'text-accent' : 'text-ink/65 hover:bg-ink/[0.05] hover:text-ink/65',
      )}
    >
      {children}
    </button>
  )
}

export function Transcript({
  turns,
  onInsertPrompt,
  insertLabel,
}: {
  turns: ChatTurn[]
  onInsertPrompt?: (text: string) => void
  insertLabel?: string
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  const [copied, setCopied] = useState<string | null>(null)
  const copyTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    const element = scroller.current
    if (!element) return
    const last = turns[turns.length - 1]
    if (last?.role === 'user' || (last?.streaming && last.content === '')) pinned.current = true
    if (pinned.current) element.scrollTop = element.scrollHeight
  }, [turns])

  useEffect(
    () => () => {
      window.clearTimeout(copyTimer.current)
    },
    [],
  )

  function trackScroll() {
    const element = scroller.current
    if (!element) return
    pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 96
  }

  function copy(key: string, text: string) {
    if (!navigator.clipboard) return
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(key)
        window.clearTimeout(copyTimer.current)
        copyTimer.current = window.setTimeout(() => setCopied(null), 1500)
      })
      .catch(() => undefined)
  }

  return (
    <div
      ref={scroller}
      onScroll={trackScroll}
      className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6 md:px-6">
        <AnimatePresence initial={false}>
          {turns.map((turn, index) => {
            const assistant = turn.role === 'assistant'
            const key = `${turn.role}-${index}`
            const copiedHere = copied === key
            return (
              <motion.article
                key={key}
                variants={motionFadeRise}
                initial="hidden"
                animate="visible"
                exit="hidden"
                className={cn('group flex min-w-0 flex-col', assistant ? 'items-start' : 'items-end')}
              >
                <p className="text-ink/65 mb-1 px-1 text-[11px] font-semibold">
                  {assistant ? 'SunnyGen' : 'You'}
                </p>
                <div
                  className={cn(
                    'min-w-0 max-w-[94%] rounded-2xl border px-3.5 py-2.5 text-[13.5px] leading-relaxed sm:max-w-[88%]',
                    assistant
                      ? 'border-line-strong bg-surface text-ink/85 rounded-tl-sm'
                      : 'border-accent/15 bg-accent/[0.07] text-ink rounded-tr-sm',
                  )}
                >
                  {assistant ? (
                    turn.content ? (
                      <Markdown text={turn.content} />
                    ) : null
                  ) : (
                    <p className="break-words whitespace-pre-wrap">{turn.content}</p>
                  )}
                  {turn.streaming ? <StreamingLabel empty={!turn.content} /> : null}
                </div>

                {!turn.streaming && turn.content ? (
                  <div
                    className={cn(
                      'mt-0.5 flex items-center gap-0.5 px-0.5 transition-opacity duration-150 ease-out',
                      'focus-within:opacity-100 md:opacity-0 md:group-hover:opacity-100',
                    )}
                  >
                    <MessageAction
                      label={copiedHere ? 'Copied' : 'Copy message'}
                      onClick={() => copy(key, turn.content)}
                      active={copiedHere}
                    >
                      {copiedHere ? <Check size={11} /> : <Copy size={11} />}
                      {copiedHere ? 'Copied' : 'Copy'}
                    </MessageAction>
                    {assistant && onInsertPrompt ? (
                      <MessageAction
                        label={insertLabel ? `Insert into ${insertLabel}` : 'Insert into prompt'}
                        onClick={() => onInsertPrompt(turn.content)}
                      >
                        <CornerDownLeft size={11} />
                        Insert into prompt
                      </MessageAction>
                    ) : null}
                  </div>
                ) : null}
              </motion.article>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}
