import { randomUUID } from 'node:crypto'
import type { AssetKind, AssetRecord, AssetSource } from '@sunnygen/core'
import { getDb } from '../database'
import { asRows } from '../rows'
import { studioAssetIds } from './studio'

interface AssetRow {
  id: string
  kind: string
  name: string | null
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
    name: row.name,
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

const NAME_LIMIT = 120

export function sanitizeAssetName(value: string): string {
  const base = value.split(/[\\/]/).pop() ?? ''
  const cleaned = base.replace(/\p{Cc}/gu, '').trim()
  return cleaned.slice(0, NAME_LIMIT) || 'upload'
}

export function uniqueAssetName(name: string): string {
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const extension = dot > 0 ? name.slice(dot) : ''
  return `${stem.slice(0, NAME_LIMIT - extension.length)}-${randomUUID()}${extension}`
}

export function assetNameTaken(name: string): boolean {
  return Boolean(getDb().prepare('SELECT 1 FROM assets WHERE name = ?').get(name))
}

export interface CreateAssetInput {
  kind: AssetKind
  name?: string | null
  unique?: boolean
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
  if (!input.unique) {
    const existing = findAssetBySha256(input.sha256)
    if (existing) return existing
  }

  const baseName = input.name ? sanitizeAssetName(input.name) : null
  const name = baseName && assetNameTaken(baseName) ? uniqueAssetName(baseName) : baseName
  const id = randomUUID()
  getDb()
    .prepare(
      `INSERT INTO assets
        (id, kind, name, mime, byte_size, width, height, duration, sha256, source, path, folder_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.kind,
      name,
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
  excludeKind?: AssetKind
  excludeStudioAssets?: boolean
  folderId?: string | null
  limit?: number
  offset?: number
}

// Hidden studio files are filtered in SQL, so the page size, the offset and the total count
// describe the same visible list.
function excludeStudioCondition(values: Array<string | number | null>): string | null {
  const owned = studioAssetIds()
  if (owned.length === 0) return null
  values.push(...owned)
  return `id NOT IN (${owned.map(() => '?').join(', ')})`
}

export function countAssets(
  filter: { kind?: AssetKind; source?: AssetSource; excludeStudioAssets?: boolean } = {},
): number {
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
  if (filter.excludeStudioAssets) {
    const condition = excludeStudioCondition(values)
    if (condition) conditions.push(condition)
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
  if (filter.excludeKind) {
    conditions.push('kind != ?')
    values.push(filter.excludeKind)
  }
  if (filter.folderId !== undefined) {
    if (filter.folderId === null) {
      conditions.push('folder_id IS NULL')
    } else {
      conditions.push('folder_id = ?')
      values.push(filter.folderId)
    }
  }
  if (filter.excludeStudioAssets) {
    const condition = excludeStudioCondition(values)
    if (condition) conditions.push(condition)
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

// User-facing studio uploads are the studio assets that are not avatar crops. Used by the
// backfill script, which sees raw rows instead of the app connection.
export function selectStudioUploads(
  rows: ReadonlyArray<{ id: string; source: string }>,
  cropIds: ReadonlySet<string>,
): string[] {
  return rows.filter((row) => row.source === 'studio' && !cropIds.has(row.id)).map((row) => row.id)
}
