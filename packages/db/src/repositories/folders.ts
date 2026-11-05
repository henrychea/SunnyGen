import { randomUUID } from 'node:crypto'
import { getDb } from '../database'
import { asRows } from '../rows'

interface FolderRow {
  id: string
  name: string
  parent_id: string | null
  color: string | null
  sort_index: number
  created_at: number
  updated_at: number
}

export interface FolderRecord {
  id: string
  name: string
  parentId: string | null
  color: string | null
  sortIndex: number
  createdAt: number
  updatedAt: number
}

function toRecord(row: FolderRow): FolderRecord {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    color: row.color,
    sortIndex: row.sort_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function listFolders(): FolderRecord[] {
  const rows = asRows<FolderRow>(
    getDb().prepare('SELECT * FROM folders ORDER BY parent_id, sort_index, name').all(),
  )
  return rows.map(toRecord)
}

export function getFolder(id: string): FolderRecord | null {
  const row = getDb().prepare('SELECT * FROM folders WHERE id = ?').get(id) as FolderRow | undefined
  return row ? toRecord(row) : null
}

export interface CreateFolderInput {
  name: string
  parentId?: string | null
  color?: string | null
}

export function createFolder(input: CreateFolderInput): FolderRecord {
  const id = randomUUID()
  const timestamp = Date.now()
  const next = getDb()
    .prepare('SELECT COALESCE(MAX(sort_index), -1) + 1 AS next FROM folders WHERE parent_id IS ?')
    .get(input.parentId ?? null) as { next: number }
  getDb()
    .prepare(
      `INSERT INTO folders (id, name, parent_id, color, sort_index, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, input.name.trim(), input.parentId ?? null, input.color ?? null, next.next, timestamp, timestamp)
  return getFolder(id) as FolderRecord
}

export interface UpdateFolderInput {
  name?: string
  color?: string | null
  parentId?: string | null
  sortIndex?: number
}

export function updateFolder(id: string, input: UpdateFolderInput): FolderRecord | null {
  const columns: string[] = []
  const values: Array<string | number | null> = []
  if (input.name !== undefined) {
    columns.push('name = ?')
    values.push(input.name.trim())
  }
  if (input.color !== undefined) {
    columns.push('color = ?')
    values.push(input.color)
  }
  if (input.parentId !== undefined) {
    columns.push('parent_id = ?')
    values.push(input.parentId)
  }
  if (input.sortIndex !== undefined) {
    columns.push('sort_index = ?')
    values.push(input.sortIndex)
  }
  if (columns.length === 0) return getFolder(id)
  columns.push('updated_at = ?')
  values.push(Date.now(), id)
  getDb()
    .prepare(`UPDATE folders SET ${columns.join(', ')} WHERE id = ?`)
    .run(...values)
  return getFolder(id)
}

export function deleteFolder(id: string): boolean {
  const result = getDb().prepare('DELETE FROM folders WHERE id = ?').run(id)
  return result.changes > 0
}
