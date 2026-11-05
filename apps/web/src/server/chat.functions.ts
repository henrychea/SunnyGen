import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { deleteChat, getChat, listChats, readSetting, saveChat, type ChatRecord } from '@sunnygen/db'

const OPENROUTER_KEY_SETTING = 'assistant.openrouter.key'

const storedMessage = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
})

export type ChatMessage = z.infer<typeof storedMessage>

export interface ChatSessionSummary {
  id: string
  title: string
  model: string | null
  updatedAt: number
}

export interface ChatSessionDetail extends ChatSessionSummary {
  messages: ChatMessage[]
  createdAt: number
}

export interface ChatSessionsSnapshot {
  sessions: ChatSessionSummary[]
  keyConfigured: boolean
}

function openRouterKeyConfigured(): boolean {
  const stored = readSetting(OPENROUTER_KEY_SETTING)?.trim()
  if (stored) return true
  return Boolean(process.env.OPENROUTER_API_KEY?.trim())
}

function toMessages(messages: unknown[]): ChatMessage[] {
  const parsed: ChatMessage[] = []
  for (const entry of messages) {
    const result = storedMessage.safeParse(entry)
    if (result.success) parsed.push(result.data)
  }
  return parsed
}

function toSummary(record: ChatRecord): ChatSessionSummary {
  return {
    id: record.id,
    title: record.title,
    model: record.model,
    updatedAt: record.updatedAt,
  }
}

function toDetail(record: ChatRecord): ChatSessionDetail {
  return {
    ...toSummary(record),
    messages: toMessages(record.messages),
    createdAt: record.createdAt,
  }
}

function titleFrom(messages: ChatMessage[]): string {
  const first = messages.find((message) => message.role === 'user')
  const text = first?.content.replace(/\s+/g, ' ').trim() ?? ''
  return text ? text.slice(0, 50) : 'New chat'
}

export const loadChatSessions = createServerFn({ method: 'GET' }).handler((): ChatSessionsSnapshot => ({
  sessions: listChats().map(toSummary),
  keyConfigured: openRouterKeyConfigured(),
}))

export const loadChatSession = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string().trim().min(1) }))
  .handler(({ data }): ChatSessionDetail | null => {
    const record = getChat(data.id)
    return record ? toDetail(record) : null
  })

const saveInput = z.object({
  id: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1).max(160),
  messages: z.array(storedMessage).min(1).max(400),
})

export const saveChatSession = createServerFn({ method: 'POST' })
  .validator(saveInput)
  .handler(({ data }): ChatSessionDetail =>
    toDetail(
      saveChat({
        id: data.id,
        title: titleFrom(data.messages),
        model: data.model,
        messages: data.messages,
      }),
    ),
  )

export const deleteChatSession = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().trim().min(1) }))
  .handler(({ data }) => {
    deleteChat(data.id)
    return { ok: true }
  })
