import { randomUUID } from 'node:crypto'
import type { StudioKind } from '@sunnygen/core'
import { getDb } from '../database'
import { asRows } from '../rows'

interface StudioRow {
  id: string
  kind: string
  name: string
  asset_id: string | null
  clean_asset_id: string | null
  data: string
  builtin: number
  created_at: number
  updated_at: number
}

export interface StudioItemRecord {
  id: string
  kind: StudioKind
  name: string
  assetId: string | null
  cleanAssetId: string | null
  data: Record<string, unknown>
  builtin: boolean
  createdAt: number
  updatedAt: number
}

function parseData(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function toRecord(row: StudioRow): StudioItemRecord {
  return {
    id: row.id,
    kind: row.kind as StudioKind,
    name: row.name,
    assetId: row.asset_id,
    cleanAssetId: row.clean_asset_id,
    data: parseData(row.data),
    builtin: row.builtin === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function countStudioItems(kind: StudioKind): number {
  const row = getDb().prepare('SELECT COUNT(*) AS count FROM studio_items WHERE kind = ?').get(kind) as {
    count: number
  }
  return Number(row.count)
}

export function listStudioItems(kind?: StudioKind): StudioItemRecord[] {
  const rows = kind
    ? asRows<StudioRow>(
        getDb().prepare('SELECT * FROM studio_items WHERE kind = ? ORDER BY created_at DESC').all(kind),
      )
    : asRows<StudioRow>(getDb().prepare('SELECT * FROM studio_items ORDER BY kind, created_at DESC').all())
  return rows.map(toRecord)
}

export function getStudioItem(id: string): StudioItemRecord | null {
  const row = getDb().prepare('SELECT * FROM studio_items WHERE id = ?').get(id) as StudioRow | undefined
  return row ? toRecord(row) : null
}

export interface SaveStudioItemInput {
  id?: string
  kind: StudioKind
  name: string
  assetId?: string | null
  cleanAssetId?: string | null
  data?: Record<string, unknown>
  builtin?: boolean
}

export function saveStudioItem(input: SaveStudioItemInput): StudioItemRecord {
  const timestamp = Date.now()
  const id = input.id ?? randomUUID()
  getDb()
    .prepare(
      `INSERT INTO studio_items (id, kind, name, asset_id, clean_asset_id, data, builtin, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         asset_id = excluded.asset_id,
         clean_asset_id = excluded.clean_asset_id,
         data = excluded.data,
         updated_at = excluded.updated_at`,
    )
    .run(
      id,
      input.kind,
      input.name.trim(),
      input.assetId ?? null,
      input.cleanAssetId ?? null,
      JSON.stringify(input.data ?? {}),
      input.builtin ? 1 : 0,
      timestamp,
      timestamp,
    )
  return getStudioItem(id) as StudioItemRecord
}

export function deleteStudioItem(id: string): boolean {
  const result = getDb().prepare('DELETE FROM studio_items WHERE id = ?').run(id)
  return result.changes > 0
}
