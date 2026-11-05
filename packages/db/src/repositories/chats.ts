import { randomUUID } from 'node:crypto'
import { getDb } from '../database'
import { asRows } from '../rows'

interface ChatRow {
  id: string
  title: string
  model: string | null
  messages: string
  created_at: number
  updated_at: number
}

export interface ChatRecord {
  id: string
  title: string
  model: string | null
  messages: unknown[]
  createdAt: number
  updatedAt: number
}

function parseMessages(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function toRecord(row: ChatRow): ChatRecord {
  return {
    id: row.id,
    title: row.title,
    model: row.model,
    messages: parseMessages(row.messages),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function listChats(): ChatRecord[] {
  const rows = asRows<ChatRow>(getDb().prepare('SELECT * FROM chats ORDER BY updated_at DESC').all())
  return rows.map(toRecord)
}

export function getChat(id: string): ChatRecord | null {
  const row = getDb().prepare('SELECT * FROM chats WHERE id = ?').get(id) as ChatRow | undefined
  return row ? toRecord(row) : null
}

export interface SaveChatInput {
  id?: string
  title: string
  model?: string | null
  messages: unknown[]
}

export function saveChat(input: SaveChatInput): ChatRecord {
  const timestamp = Date.now()
  const id = input.id ?? randomUUID()
  getDb()
    .prepare(
      `INSERT INTO chats (id, title, model, messages, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         model = excluded.model,
         messages = excluded.messages,
         updated_at = excluded.updated_at`,
    )
    .run(
      id,
      input.title.trim() || 'New chat',
      input.model ?? null,
      JSON.stringify(input.messages),
      timestamp,
      timestamp,
    )
  return getChat(id) as ChatRecord
}

export function deleteChat(id: string): boolean {
  const result = getDb().prepare('DELETE FROM chats WHERE id = ?').run(id)
  return result.changes > 0
}
