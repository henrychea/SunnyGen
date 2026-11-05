import { randomUUID } from 'node:crypto'
import { getDb } from '../database'
import { asRows } from '../rows'

interface WorkflowRow {
  id: string
  name: string
  graph: string
  created_at: number
  updated_at: number
}

export interface WorkflowRecord {
  id: string
  name: string
  graph: unknown
  createdAt: number
  updatedAt: number
}

function parseGraph(value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return { nodes: [], edges: [] }
  }
}

function toRecord(row: WorkflowRow): WorkflowRecord {
  return {
    id: row.id,
    name: row.name,
    graph: parseGraph(row.graph),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function listWorkflows(): WorkflowRecord[] {
  const rows = asRows<WorkflowRow>(getDb().prepare('SELECT * FROM workflows ORDER BY updated_at DESC').all())
  return rows.map(toRecord)
}

export function getWorkflow(id: string): WorkflowRecord | null {
  const row = getDb().prepare('SELECT * FROM workflows WHERE id = ?').get(id) as WorkflowRow | undefined
  return row ? toRecord(row) : null
}

export interface SaveWorkflowInput {
  id?: string
  name: string
  graph: unknown
}

export function saveWorkflow(input: SaveWorkflowInput): WorkflowRecord {
  const timestamp = Date.now()
  const id = input.id ?? randomUUID()
  getDb()
    .prepare(
      `INSERT INTO workflows (id, name, graph, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         graph = excluded.graph,
         updated_at = excluded.updated_at`,
    )
    .run(id, input.name.trim(), JSON.stringify(input.graph), timestamp, timestamp)
  return getWorkflow(id) as WorkflowRecord
}

export function deleteWorkflow(id: string): boolean {
  const result = getDb().prepare('DELETE FROM workflows WHERE id = ?').run(id)
  return result.changes > 0
}
