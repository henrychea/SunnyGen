import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import {
  ASSISTANT_MODELS,
  DEFAULT_ASSISTANT_MODE,
  DEFAULT_ASSISTANT_MODEL,
  type AssistantModeId,
} from '@sunnygen/core'
import { Button, Select } from '@sunnygen/ui'
import { AlertCircle, MessageSquarePlus, Sparkles, Trash2, X } from 'lucide-react'
import { Composer } from '~/components/chat/composer'
import { SessionRail } from '~/components/chat/session-rail'
import { Transcript, type ChatTurn } from '~/components/chat/transcript'
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
        await router.navigate({ to: '/chat', search: { id: saved.id }, replace: true })
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
    void router.navigate({ to: '/chat', search: {} })
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
    void router.navigate({ to: '/chat', search: { id } })
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
        await router.navigate({ to: '/chat', search: {}, replace: true })
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

          <p className="font-display hidden truncate text-[14.5px] font-semibold tracking-tight md:block md:flex-1">
            {activeId ? title : 'Assistant'}
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
                {ASSISTANT_MODELS.find((entry) => entry.id === model)?.label ?? model}
              </span>
            ) : null}
          </div>
        </header>

        {missingKey ? (
          <div className="border-accent/25 bg-accent/[0.06] text-accent mx-3 mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-[12px] leading-relaxed md:mx-6">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <p>
              The assistant needs an OpenRouter API key.{' '}
              <Link to="/settings" className="font-semibold underline underline-offset-2">
                Open Settings
              </Link>
            </p>
          </div>
        ) : null}

        {error ? (
          <div
            role="alert"
            className="border-error/25 bg-error/[0.05] text-error mx-3 mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-[12px] leading-relaxed md:mx-6"
          >
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <p className="min-w-0 flex-1">{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              className="hover:bg-error/10 shrink-0 rounded p-0.5 transition-colors"
              aria-label="Dismiss error"
            >
              <X size={12} />
            </button>
          </div>
        ) : null}

        {turns.length === 0 ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center gap-5 px-5 py-10 text-center">
              <div className="bg-accent/10 text-accent grid size-12 place-items-center rounded-2xl">
                <Sparkles size={20} />
              </div>
              <div>
                <h2 className="font-display text-[22px] font-semibold tracking-tight">What are we making?</h2>
                <p className="text-ink/45 mt-1.5 text-[12.5px] leading-relaxed">
                  Prompt drafts, rewrites, translations, or anything else you want to think through.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setDraft(suggestion)}
                    className="border-line bg-surface text-ink/60 hover:border-ink/20 hover:text-ink rounded-full border px-3 py-1.5 text-[11.5px] transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <Transcript turns={turns} />
        )}

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
