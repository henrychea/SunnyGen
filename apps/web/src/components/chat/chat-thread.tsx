import { AlertCircle, Sparkles, Wand2, X } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'motion/react'
import { motionFade, motionList, motionListItem, motionTransition, toast } from '@sunnygen/ui'
import { useState } from 'react'
import { Composer } from './composer'
import { Transcript, TranscriptSkeleton } from './transcript'
import type { AssistantChat } from './use-assistant-chat'
import { insertIntoPrompt, mergePrompt, usePromptContext } from '~/lib/assistant-context'

const STARTERS = [
  'Rewrite my prompt with richer lighting',
  'Describe a cinematic rain-soaked street shot',
  'Plan a four-look autumn lookbook',
  'Turn a rough idea into a video prompt',
]

export function ChatThread({
  chat,
  compact = false,
  onNavigate,
}: {
  chat: AssistantChat
  compact?: boolean
  onNavigate?: () => void
}) {
  const context = usePromptContext()
  const [inserted, setInserted] = useState(false)

  function insertCurrentPrompt() {
    if (!context) return
    chat.setDraft(mergePrompt(chat.draft, context.value))
    setInserted(true)
    toast('Prompt added to the assistant input.')
  }

  function insertReply(text: string) {
    if (insertIntoPrompt(text)) {
      toast(`Added to the ${context?.label ?? 'page'} prompt.`)
      return
    }
    toast('No page prompt is open.', { tone: 'error' })
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <AnimatePresence initial={false}>
        {chat.missingKey ? (
          <motion.div
            key="chat-key-banner"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={motionTransition}
            className="mx-3 mt-3 shrink-0 overflow-hidden md:mx-6"
          >
            <div className="border-accent/25 bg-accent/[0.06] text-accent flex items-start gap-2 rounded-xl border px-3 py-2 text-[12px] leading-relaxed">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <p>
                The assistant needs an OpenRouter API key.{' '}
                <Link
                  to="/settings"
                  onClick={onNavigate}
                  className="font-semibold underline underline-offset-2"
                >
                  Open Settings
                </Link>
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {chat.error ? (
          <motion.div
            key="chat-error"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={motionTransition}
            className="mx-3 mt-3 shrink-0 overflow-hidden md:mx-6"
          >
            <div
              role="alert"
              className="border-error/25 bg-error/[0.05] text-error flex items-start gap-2 rounded-xl border px-3 py-2 text-[12px] leading-relaxed"
            >
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <p className="min-w-0 flex-1">{chat.error}</p>
              <button
                type="button"
                onClick={() => chat.setError(null)}
                className="hover:bg-error/10 shrink-0 rounded p-0.5 transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.9]"
                aria-label="Dismiss error"
              >
                <X size={12} />
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="relative min-h-0 min-w-0 flex-1">
        <AnimatePresence initial={false}>
          {chat.threadLoading ? (
            <motion.div
              key="chat-loading"
              variants={motionFade}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className="absolute inset-0 overflow-y-auto"
            >
              <TranscriptSkeleton />
            </motion.div>
          ) : chat.turns.length === 0 ? (
            <motion.div
              key="chat-empty"
              variants={motionFade}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className="absolute inset-0 overflow-y-auto"
            >
              <div
                className={
                  compact
                    ? 'mx-auto flex h-full w-full max-w-lg flex-col items-center justify-center gap-4 px-5 py-8 text-center'
                    : 'mx-auto flex h-full w-full max-w-2xl flex-col items-center justify-center gap-5 px-5 py-10 text-center'
                }
              >
                <div className="bg-accent/10 text-accent grid size-11 place-items-center rounded-2xl">
                  <Sparkles size={19} />
                </div>
                <div className="min-w-0">
                  <h2
                    className={
                      compact
                        ? 'font-display text-[18px] font-semibold tracking-tight'
                        : 'font-display text-[22px] font-semibold tracking-tight'
                    }
                  >
                    What are we making?
                  </h2>
                  <p className="text-ink/45 mt-1.5 text-[12.5px] leading-relaxed">
                    Rewrite a prompt, describe a shot, or plan a look. The assistant works inside SunnyGen.
                  </p>
                </div>
                <motion.div
                  variants={motionList}
                  initial="hidden"
                  animate="visible"
                  className="grid w-full grid-cols-1 gap-1.5 sm:grid-cols-2"
                >
                  {STARTERS.map((suggestion) => (
                    <motion.button
                      key={suggestion}
                      variants={motionListItem}
                      type="button"
                      onClick={() => {
                        chat.setDraft(suggestion)
                        setInserted(true)
                      }}
                      className="border-line bg-surface text-ink/60 hover:border-ink/20 hover:text-ink min-w-0 rounded-xl border px-3 py-2 text-left text-[11.5px] leading-snug transition-[color,border-color,transform] duration-150 ease-out active:scale-[0.97]"
                    >
                      {suggestion}
                    </motion.button>
                  ))}
                </motion.div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={`chat-thread-${chat.title}`}
              variants={motionFade}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className="absolute inset-0 flex min-w-0 flex-col"
            >
              <Transcript
                turns={chat.turns}
                onInsertPrompt={context ? insertReply : undefined}
                insertLabel={context?.label}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {context && context.value.trim() ? (
        <div className="border-line/60 bg-surface/40 flex min-w-0 shrink-0 items-center gap-2 border-t px-3 py-2">
          <button
            type="button"
            onClick={insertCurrentPrompt}
            className="border-line bg-surface text-ink/70 hover:border-accent/35 hover:text-accent inline-flex min-w-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-[color,border-color,transform] duration-150 ease-out active:scale-[0.97]"
          >
            <Wand2 size={12} className="shrink-0" />
            Use current prompt
          </button>
          <span className="text-ink/35 min-w-0 flex-1 truncate text-[10.5px]">
            {context.label}
            {inserted ? ' · added to input' : ''}
          </span>
        </div>
      ) : null}

      <Composer
        value={chat.draft}
        onChange={(value) => {
          chat.setDraft(value)
          setInserted(false)
        }}
        onSend={() => void chat.send()}
        onStop={chat.stop}
        streaming={chat.streaming}
        sendBlocked={chat.missingKey}
        mode={chat.mode}
        onModeChange={chat.setMode}
        model={chat.model}
        onModelChange={chat.setModel}
        compact={compact}
        autoFocus={!compact}
      />
    </div>
  )
}
