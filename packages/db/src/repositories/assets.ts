import { randomUUID } from 'node:crypto'
import type { AssetKind, AssetRecord, AssetSource } from '@sunnygen/core'
import { getDb } from '../database'
import { asRows } from '../rows'

interface AssetRow {
  id: string
  kind: string
  mime: string
  byte_size: number
  width: number | null
  height: number | null
  duration: number | null
  sha256: string
  source: string
  path: string
  folder_id: string | null
  created_at: number
}

function toRecord(row: AssetRow): AssetRecord {
  return {
    id: row.id,
    kind: row.kind as AssetKind,
    mime: row.mime,
    byteSize: row.byte_size,
    width: row.width,
    height: row.height,
    duration: row.duration,
    sha256: row.sha256,
    source: row.source as AssetSource,
    path: row.path,
    folderId: row.folder_id,
    createdAt: row.created_at,
  }
}

export interface CreateAssetInput {
  kind: AssetKind
  mime: string
  byteSize: number
  width?: number | null
  height?: number | null
  duration?: number | null
  sha256: string
  source: AssetSource
  path: string
  folderId?: string | null
}

export function createAsset(input: CreateAssetInput): AssetRecord {
  const existing = findAssetBySha256(input.sha256)
  if (existing) return existing

  const id = randomUUID()
  getDb()
    .prepare(
      `INSERT INTO assets
        (id, kind, mime, byte_size, width, height, duration, sha256, source, path, folder_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.kind,
      input.mime,
      input.byteSize,
      input.width ?? null,
      input.height ?? null,
      input.duration ?? null,
      input.sha256,
      input.source,
      input.path,
      input.folderId ?? null,
      Date.now(),
    )
  return getAsset(id) as AssetRecord
}

export function getAsset(id: string): AssetRecord | null {
  const row = getDb().prepare('SELECT * FROM assets WHERE id = ?').get(id) as AssetRow | undefined
  return row ? toRecord(row) : null
}

export function getAssetsByIds(ids: string[]): AssetRecord[] {
  if (ids.length === 0) return []
  const placeholders = ids.map(() => '?').join(', ')
  const rows = asRows<AssetRow>(
    getDb()
      .prepare(`SELECT * FROM assets WHERE id IN (${placeholders})`)
      .all(...ids),
  )
  const byId = new Map(rows.map((row) => [row.id, toRecord(row)]))
  return ids.map((id) => byId.get(id)).filter((asset): asset is AssetRecord => Boolean(asset))
}

export function findAssetBySha256(sha256: string): AssetRecord | null {
  const row = getDb().prepare('SELECT * FROM assets WHERE sha256 = ?').get(sha256) as AssetRow | undefined
  return row ? toRecord(row) : null
}

export interface ListAssetsFilter {
  kind?: AssetKind
  source?: AssetSource
  sources?: AssetSource[]
  excludeSource?: AssetSource
  folderId?: string | null
  limit?: number
  offset?: number
}

export function countAssets(filter: { kind?: AssetKind; source?: AssetSource } = {}): number {
  const conditions: string[] = []
  const values: string[] = []
  if (filter.kind) {
    conditions.push('kind = ?')
    values.push(filter.kind)
  }
  if (filter.source) {
    conditions.push('source = ?')
    values.push(filter.source)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const row = getDb()
    .prepare(`SELECT COUNT(*) AS count FROM assets ${where}`)
    .get(...values) as {
    count: number
  }
  return Number(row.count)
}

export function listAssets(filter: ListAssetsFilter = {}): AssetRecord[] {
  const conditions: string[] = []
  const values: Array<string | number | null> = []

  if (filter.kind) {
    conditions.push('kind = ?')
    values.push(filter.kind)
  }
  if (filter.source) {
    conditions.push('source = ?')
    values.push(filter.source)
  }
  if (filter.sources && filter.sources.length > 0) {
    conditions.push(`source IN (${filter.sources.map(() => '?').join(', ')})`)
    values.push(...filter.sources)
  }
  if (filter.excludeSource) {
    conditions.push('source != ?')
    values.push(filter.excludeSource)
  }
  if (filter.folderId !== undefined) {
    if (filter.folderId === null) {
      conditions.push('folder_id IS NULL')
    } else {
      conditions.push('folder_id = ?')
      values.push(filter.folderId)
    }
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const limit = Math.min(Math.max(filter.limit ?? 100, 1), 1000)
  const offset = Math.max(filter.offset ?? 0, 0)
  values.push(limit, offset)

  const rows = asRows<AssetRow>(
    getDb()
      .prepare(`SELECT * FROM assets ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .all(...values),
  )
  return rows.map(toRecord)
}

export function deleteAsset(id: string): boolean {
  const result = getDb().prepare('DELETE FROM assets WHERE id = ?').run(id)
  return result.changes > 0
}

export function moveAssetToFolder(id: string, folderId: string | null): boolean {
  const result = getDb().prepare('UPDATE assets SET folder_id = ? WHERE id = ?').run(folderId, id)
  return result.changes > 0
}
