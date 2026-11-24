import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DEFAULT_ASSISTANT_MODE, DEFAULT_ASSISTANT_MODEL, type AssistantModeId } from '@sunnygen/core'
import {
  deleteChatSession,
  loadChatSession,
  loadChatSessions,
  saveChatSession,
} from '~/server/chat.functions'
import { toast } from '@sunnygen/ui'
import type { ChatTurn } from './transcript'

interface StreamEvent {
  choices?: Array<{ delta?: { content?: string | null } }>
  type?: string
  delta?: { text?: string }
}

export type ActiveSessionChange = (id: string | null, options?: { replace?: boolean }) => void

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
    return ''
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

export function useAssistantChat({
  activeId,
  onActiveIdChange,
  onStreamingChange,
}: {
  activeId: string | null
  onActiveIdChange: ActiveSessionChange
  onStreamingChange?: (streaming: boolean) => void
}) {
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
  const changeRef = useRef(onActiveIdChange)
  const streamingCallback = useRef(onStreamingChange)

  useEffect(() => {
    changeRef.current = onActiveIdChange
  }, [onActiveIdChange])

  useEffect(() => {
    streamingCallback.current = onStreamingChange
  }, [onStreamingChange])

  useEffect(() => {
    streamingCallback.current?.(streaming)
  }, [streaming])

  const sessions = sessionsQuery.data?.sessions ?? []
  const keyConfigured = sessionsQuery.data ? sessionsQuery.data.keyConfigured : null
  const missingKey = keyConfigured === false || keyRejected
  const title =
    sessionQuery.data?.title ?? sessions.find((entry) => entry.id === activeId)?.title ?? 'Assistant'
  const threadLoading =
    Boolean(activeId) &&
    (sessionQuery.isLoading || (turns.length === 0 && (sessionQuery.data?.messages.length ?? 0) > 0))

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
        data: { id: activeId ?? undefined, model: chosenModel, messages: history },
      })
      sessionId = saved.id
      queryClient.setQueryData(['chat-session', saved.id], saved)
      void queryClient.invalidateQueries({ queryKey: ['chat-sessions'] })
      if (saved.id !== activeId) {
        hydratedId.current = saved.id
        changeRef.current(saved.id, { replace: !activeId })
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
    changeRef.current(null)
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
    changeRef.current(id)
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
        changeRef.current(null, { replace: true })
      }
      await queryClient.invalidateQueries({ queryKey: ['chat-sessions'] })
      toast('Chat deleted', { tone: 'info' })
    } catch (cause) {
      const message = messageOf(cause, 'Could not delete that chat.')
      setError(message)
      toast(message, { tone: 'error' })
    }
  }

  return {
    sessions,
    sessionsLoading: sessionsQuery.isLoading,
    keyConfigured,
    missingKey,
    title,
    threadLoading,
    turns,
    draft,
    setDraft,
    mode,
    setMode,
    model,
    setModel,
    streaming,
    error,
    setError,
    send,
    stop: () => abortRef.current?.abort(),
    newChat,
    selectSession,
    removeSession,
  }
}

export type AssistantChat = ReturnType<typeof useAssistantChat>
