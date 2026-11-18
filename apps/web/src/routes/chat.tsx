import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import {
  ASSISTANT_MODELS,
  DEFAULT_ASSISTANT_MODE,
  DEFAULT_ASSISTANT_MODEL,
  type AssistantModeId,
} from '@sunnygen/core'
import { Button, Select, motionFade, motionList, motionListItem, motionTransition } from '@sunnygen/ui'
import { AlertCircle, MessageSquarePlus, Sparkles, Trash2, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Composer } from '~/components/chat/composer'
import { SessionRail } from '~/components/chat/session-rail'
import { Transcript, TranscriptSkeleton, type ChatTurn } from '~/components/chat/transcript'
import {
  deleteChatSession,
  loadChatSession,
  loadChatSessions,
  saveChatSession,
} from '~/server/chat.functions'

type ChatSearch = {
  id?: string
}

const SUGGESTIONS = [
  'Turn this idea into a cinematic image prompt',
  'Rewrite my prompt with richer lighting',
  'Draft a JSON prompt for a portrait shoot',
  'Plan a fantasy character look',
]

interface StreamEvent {
  choices?: Array<{ delta?: { content?: string | null } }>
  type?: string
  delta?: { text?: string }
}

function streamDelta(line: string): string {
  const trimmed = line.trim()
  if (!trimmed.startsWith('data:')) return ''
  const payload = trimmed.slice('data:'.length).trim()
  if (!payload || payload === '[DONE]') return ''
  try {
    const event = JSON.parse(payload) as StreamEvent
    const openAi = event.choices?.[0]?.delta?.content
    if (typeof openAi === 'string') return openAi
    if (event.type === 'content_block_delta' && typeof event.delta?.text === 'string') {
      return event.delta.text
    }
  } catch {
    // Malformed or partial event: ignore it and keep streaming.
  }
  return ''
}

function updateReply(turns: ChatTurn[], content: string): ChatTurn[] {
  const last = turns[turns.length - 1]
  if (!last || last.role !== 'assistant' || !last.streaming) return turns
  return [...turns.slice(0, -1), { ...last, content }]
}

function messageOf(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback
}

export const Route = createFileRoute('/chat')({
  validateSearch: (search: Record<string, unknown>): ChatSearch => ({
    id: typeof search.id === 'string' && search.id.trim() ? search.id : undefined,
  }),
  component: ChatPage,
})

function ChatPage() {
  const { id: activeId } = Route.useSearch()
  const router = useRouter()
  const queryClient = useQueryClient()

  const sessionsQuery = useQuery({
    queryKey: ['chat-sessions'],
    queryFn: () => loadChatSessions(),
    staleTime: 0,
  })

  const sessionQuery = useQuery({
    queryKey: ['chat-session', activeId],
    queryFn: () => (activeId ? loadChatSession({ data: { id: activeId } }) : Promise.resolve(null)),
    enabled: Boolean(activeId),
    staleTime: 30_000,
  })

  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [draft, setDraft] = useState('')
  const [mode, setMode] = useState<AssistantModeId>(DEFAULT_ASSISTANT_MODE)
  const [model, setModel] = useState<string>(DEFAULT_ASSISTANT_MODEL)
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [keyRejected, setKeyRejected] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const streamToken = useRef(0)
  const hydratedId = useRef<string | null>(null)

  const sessions = sessionsQuery.data?.sessions ?? []
  const keyConfigured = sessionsQuery.data ? sessionsQuery.data.keyConfigured : null
  const missingKey = keyConfigured === false || keyRejected
  const title =
    sessionQuery.data?.title ?? sessions.find((entry) => entry.id === activeId)?.title ?? 'Assistant'
  const threadLoading =
    Boolean(activeId) &&
    (sessionQuery.isLoading || (turns.length === 0 && (sessionQuery.data?.messages.length ?? 0) > 0))

  // A search-param jump (back button, pasted link) discards the visible thread
  // unless this component itself just created or opened that session.
  useEffect(() => {
    if (hydratedId.current === (activeId ?? null)) return
    streamToken.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    setStreaming(false)
    hydratedId.current = null
    setTurns([])
    setError(null)
    setModel(DEFAULT_ASSISTANT_MODEL)
  }, [activeId])

  useEffect(() => {
    const record = sessionQuery.data
    if (!record || hydratedId.current === record.id) return
    hydratedId.current = record.id
    setTurns(record.messages)
    setModel(record.model ?? DEFAULT_ASSISTANT_MODEL)
    setKeyRejected(false)
  }, [sessionQuery.data])

  useEffect(
    () => () => {
      streamToken.current += 1
      abortRef.current?.abort()
    },
    [],
  )

  async function persist(sessionId: string, sessionModel: string, messages: ChatTurn[]) {
    try {
      const saved = await saveChatSession({
        data: { id: sessionId, model: sessionModel, messages },
      })
      queryClient.setQueryData(['chat-session', saved.id], saved)
      void queryClient.invalidateQueries({ queryKey: ['chat-sessions'] })
    } catch {
      setError('The reply finished but could not be saved.')
    }
  }

  async function send() {
    const text = draft.trim()
    if (!text || streaming) return
    if (missingKey) {
      setError('Add an OpenRouter key in Settings before sending a message.')
      return
    }

    const history: ChatTurn[] = [...turns.filter((turn) => !turn.streaming), { role: 'user', content: text }]
    const chosenModel = model
    const chosenMode = mode
    const token = ++streamToken.current
    let sessionId: string

    setDraft('')
    setError(null)
    setStreaming(true)
    setTurns([...history, { role: 'assistant', content: '', streaming: true }])

    try {
      const saved = await saveChatSession({
        data: { id: activeId, model: chosenModel, messages: history },
      })
      sessionId = saved.id
      queryClient.setQueryData(['chat-session', saved.id], saved)
      void queryClient.invalidateQueries({ queryKey: ['chat-sessions'] })
      if (saved.id !== activeId) {
        hydratedId.current = saved.id
        await router.navigate({ to: '/chat', search: { id: saved.id }, replace: true, viewTransition: false })
      }
    } catch (cause) {
      if (streamToken.current === token) {
        setStreaming(false)
        setTurns(history)
        setDraft(text)
        setError(messageOf(cause, 'Could not save this chat.'))
      }
      return
    }

    if (streamToken.current !== token) return

    const controller = new AbortController()
    abortRef.current = controller
    let reply = ''

    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: chosenModel, mode: chosenMode, messages: history }),
        signal: controller.signal,
      })

      if (!response.ok) {
        if (response.status === 401) setKeyRejected(true)
        const payload: unknown = await response.json().catch(() => null)
        const message =
          payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
            ? payload.error
            : `The assistant request failed (${response.status}).`
        throw new Error(message)
      }
      setKeyRejected(false)
      if (!response.body) throw new Error('The assistant returned an empty response.')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) reply += streamDelta(line)
        if (streamToken.current !== token) {
          await reader.cancel().catch(() => undefined)
          return
        }
        setTurns((current) => updateReply(current, reply))
      }

      if (buffer) reply += streamDelta(buffer)
      if (!reply.trim()) throw new Error('The assistant sent no text. Try again.')

      const completed: ChatTurn[] = [...history, { role: 'assistant', content: reply }]
      if (streamToken.current === token) setTurns(completed)
      await persist(sessionId, chosenModel, completed)
    } catch (cause) {
      if (streamToken.current !== token) return
      const aborted =
        controller.signal.aborted || (cause instanceof DOMException && cause.name === 'AbortError')
      if (reply.trim()) {
        const partial: ChatTurn[] = [...history, { role: 'assistant', content: reply }]
        setTurns(partial)
        await persist(sessionId, chosenModel, partial)
      } else {
        setTurns(history)
        if (!aborted) setError(messageOf(cause, 'The request failed.'))
      }
    } finally {
      if (streamToken.current === token) setStreaming(false)
      if (abortRef.current === controller) abortRef.current = null
    }
  }

  function newChat() {
    streamToken.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    hydratedId.current = null
    setStreaming(false)
    setTurns([])
    setDraft('')
    setError(null)
    setModel(DEFAULT_ASSISTANT_MODEL)
    void router.navigate({ to: '/chat', search: {}, viewTransition: false })
  }

  function selectSession(id: string) {
    if (id === activeId) return
    streamToken.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    hydratedId.current = null
    setStreaming(false)
    setTurns([])
    setError(null)
    setModel(DEFAULT_ASSISTANT_MODEL)
    void router.navigate({ to: '/chat', search: { id }, viewTransition: false })
  }

  async function removeSession(id: string) {
    if (id === activeId) {
      streamToken.current += 1
      abortRef.current?.abort()
      abortRef.current = null
      setStreaming(false)
    }

    try {
      await deleteChatSession({ data: { id } })
      queryClient.removeQueries({ queryKey: ['chat-session', id] })
      if (id === activeId) {
        hydratedId.current = null
        setTurns([])
        setDraft('')
        setError(null)
        setModel(DEFAULT_ASSISTANT_MODEL)
        await router.navigate({ to: '/chat', search: {}, replace: true, viewTransition: false })
      }
      await queryClient.invalidateQueries({ queryKey: ['chat-sessions'] })
    } catch (cause) {
      setError(messageOf(cause, 'Could not delete that chat.'))
    }
  }

  return (
    <div className="flex h-full min-h-0">
      <SessionRail
        sessions={sessions}
        activeId={activeId}
        loading={sessionsQuery.isLoading}
        onSelect={selectSession}
        onNew={newChat}
        onDelete={(id) => void removeSession(id)}
      />

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="border-line/70 flex shrink-0 items-center gap-2 border-b px-3 py-2.5 md:px-6 md:py-3">
          <div className="min-w-0 flex-1 md:hidden">
            <Select
              value={activeId ?? ''}
              onChange={(event) => {
                const next = event.target.value
                if (next) selectSession(next)
                else newChat()
              }}
              aria-label="Chat sessions"
              className="h-9 text-[12px]"
            >
              <option value="">New chat</option>
              {activeId && !sessions.some((session) => session.id === activeId) ? (
                <option value={activeId}>{title}</option>
              ) : null}
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.title}
                </option>
              ))}
            </Select>
          </div>

          <p className="font-display hidden min-w-0 flex-1 truncate text-[14.5px] font-semibold tracking-tight md:block">
            <motion.span
              key={activeId ? title : 'assistant'}
              variants={motionFade}
              initial="hidden"
              animate="visible"
              className="inline-block max-w-full truncate align-bottom"
            >
              {activeId ? title : 'Assistant'}
            </motion.span>
          </p>

          <div className="flex items-center gap-1.5">
            {activeId ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void removeSession(activeId)}
                aria-label="Delete chat"
                title="Delete chat"
              >
                <Trash2 size={14} />
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={newChat} className="md:hidden">
              <MessageSquarePlus size={13} /> New
            </Button>
            {activeId ? (
              <span className="bg-ink/[0.05] text-ink/45 hidden rounded-md px-1.5 py-0.5 text-[10px] font-medium sm:inline">
                <motion.span
                  key={model}
                  variants={motionFade}
                  initial="hidden"
                  animate="visible"
                  className="inline-block"
                >
                  {ASSISTANT_MODELS.find((entry) => entry.id === model)?.label ?? model}
                </motion.span>
              </span>
            ) : null}
          </div>
        </header>

        <AnimatePresence initial={false}>
          {missingKey ? (
            <motion.div
              key="chat-key-banner"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={motionTransition}
              className="mx-3 mt-3 overflow-hidden md:mx-6"
            >
              <div className="border-accent/25 bg-accent/[0.06] text-accent flex items-start gap-2 rounded-xl border px-3 py-2 text-[12px] leading-relaxed">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <p>
                  The assistant needs an OpenRouter API key.{' '}
                  <Link to="/settings" className="font-semibold underline underline-offset-2">
                    Open Settings
                  </Link>
                </p>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {error ? (
            <motion.div
              key="chat-error"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={motionTransition}
              className="mx-3 mt-3 overflow-hidden md:mx-6"
            >
              <div
                role="alert"
                className="border-error/25 bg-error/[0.05] text-error flex items-start gap-2 rounded-xl border px-3 py-2 text-[12px] leading-relaxed"
              >
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <p className="min-w-0 flex-1">{error}</p>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="hover:bg-error/10 shrink-0 rounded p-0.5 transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.9]"
                  aria-label="Dismiss error"
                >
                  <X size={12} />
                </button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="relative min-h-0 flex-1">
          <AnimatePresence initial={false}>
            {threadLoading ? (
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
            ) : turns.length === 0 ? (
              <motion.div
                key="chat-empty"
                variants={motionFade}
                initial="hidden"
                animate="visible"
                exit="hidden"
                className="absolute inset-0 overflow-y-auto"
              >
                <div className="mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center gap-5 px-5 py-10 text-center">
                  <div className="bg-accent/10 text-accent grid size-12 place-items-center rounded-2xl">
                    <Sparkles size={20} />
                  </div>
                  <div>
                    <h2 className="font-display text-[22px] font-semibold tracking-tight">
                      What are we making?
                    </h2>
                    <p className="text-ink/45 mt-1.5 text-[12.5px] leading-relaxed">
                      Prompt drafts, rewrites, translations, or anything else you want to think through.
                    </p>
                  </div>
                  <motion.div
                    variants={motionList}
                    initial="hidden"
                    animate="visible"
                    className="flex flex-wrap justify-center gap-2"
                  >
                    {SUGGESTIONS.map((suggestion) => (
                      <motion.button
                        key={suggestion}
                        variants={motionListItem}
                        type="button"
                        onClick={() => setDraft(suggestion)}
                        className="border-line bg-surface text-ink/60 hover:border-ink/20 hover:text-ink rounded-full border px-3 py-1.5 text-[11.5px] transition-[color,border-color,transform] duration-150 ease-out active:scale-[0.96]"
                      >
                        {suggestion}
                      </motion.button>
                    ))}
                  </motion.div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key={`chat-thread-${activeId ?? 'new'}`}
                variants={motionFade}
                initial="hidden"
                animate="visible"
                exit="hidden"
                className="absolute inset-0 flex flex-col"
              >
                <Transcript turns={turns} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <Composer
          value={draft}
          onChange={setDraft}
          onSend={() => void send()}
          onStop={() => abortRef.current?.abort()}
          streaming={streaming}
          sendBlocked={missingKey}
          mode={mode}
          onModeChange={setMode}
          model={model}
          onModelChange={setModel}
        />
      </section>
    </div>
  )
}
