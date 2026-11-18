import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn, motionFade, motionFadeRise, motionPop } from '@sunnygen/ui'
import { AnimatePresence, motion } from 'motion/react'

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

export function Transcript({ turns }: { turns: ChatTurn[] }) {
  const scroller = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  const [copied, setCopied] = useState<number | null>(null)
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

  function copy(index: number, text: string) {
    if (!navigator.clipboard) return
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(index)
        window.clearTimeout(copyTimer.current)
        copyTimer.current = window.setTimeout(() => setCopied(null), 1500)
      })
      .catch(() => undefined)
  }

  return (
    <div ref={scroller} onScroll={trackScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 md:px-6">
        <AnimatePresence initial={false}>
          {turns.map((turn, index) => {
            const assistant = turn.role === 'assistant'
            return (
              <motion.div
                key={index}
                variants={motionFadeRise}
                initial="hidden"
                animate="visible"
                exit="hidden"
                className={cn('flex', assistant ? 'justify-start' : 'justify-end')}
              >
                <div
                  className={cn(
                    'flex max-w-[88%] flex-col md:max-w-[78%]',
                    assistant ? 'items-start' : 'items-end',
                  )}
                >
                  <div
                    className={cn(
                      'whitespace-pre-wrap break-words rounded-2xl border px-3.5 py-2.5 text-[13.5px] leading-relaxed',
                      assistant
                        ? 'border-line bg-surface text-ink/85 rounded-bl-md'
                        : 'border-accent/20 bg-accent/[0.09] text-ink rounded-br-md',
                    )}
                  >
                    {turn.content}
                    {turn.streaming ? (
                      turn.content ? (
                        <span
                          aria-hidden="true"
                          className="bg-ink/60 ml-0.5 inline-block h-[13px] w-[2px] translate-y-[2px] animate-pulse rounded-full"
                        />
                      ) : (
                        <span
                          aria-label="Waiting for the assistant"
                          className="inline-flex items-center gap-1 py-1"
                        >
                          {[0, 1, 2].map((dot) => (
                            <span
                              key={dot}
                              className="bg-ink/35 size-1.5 animate-pulse rounded-full"
                              style={{ animationDelay: `${dot * 160}ms` }}
                            />
                          ))}
                        </span>
                      )
                    ) : null}
                  </div>

                  <AnimatePresence initial={false}>
                    {assistant && !turn.streaming && turn.content ? (
                      <motion.div
                        key="copy"
                        variants={motionFade}
                        initial="hidden"
                        animate="visible"
                        exit="hidden"
                      >
                        <button
                          type="button"
                          onClick={() => copy(index, turn.content)}
                          className={cn(
                            'mt-0.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10.5px]',
                            'transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.94]',
                            copied === index
                              ? 'text-accent'
                              : 'text-ink/30 hover:bg-ink/[0.05] hover:text-ink/60',
                          )}
                          aria-label="Copy reply"
                        >
                          <AnimatePresence initial={false} mode="wait">
                            <motion.span
                              key={copied === index ? 'copied' : 'copy'}
                              variants={motionPop}
                              initial="hidden"
                              animate="visible"
                              exit="hidden"
                              className="inline-flex items-center gap-1"
                            >
                              {copied === index ? <Check size={11} /> : <Copy size={11} />}
                              {copied === index ? 'Copied' : 'Copy'}
                            </motion.span>
                          </AnimatePresence>
                        </button>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}
