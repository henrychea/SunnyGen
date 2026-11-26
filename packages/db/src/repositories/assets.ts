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
  nsfw: number | null
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
    nsfw: row.nsfw === 1,
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
  nsfw?: boolean
}

export function createAsset(input: CreateAssetInput): AssetRecord {
  if (!input.unique) {
    const existing = findAssetBySha256(input.sha256, input.nsfw === true)
    if (existing) return existing
  }

  const baseName = input.name ? sanitizeAssetName(input.name) : null
  const name = baseName && assetNameTaken(baseName) ? uniqueAssetName(baseName) : baseName
  const id = randomUUID()
  getDb()
    .prepare(
      `INSERT INTO assets
        (id, kind, name, mime, byte_size, width, height, duration, sha256, source, path, folder_id, nsfw, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      input.nsfw === true ? 1 : 0,
      Date.now(),
    )
  return getAsset(id, { includeNsfw: true }) as AssetRecord
}

export interface ReadAssetOptions {
  includeNsfw?: boolean
}

export function getAsset(id: string, options: ReadAssetOptions = {}): AssetRecord | null {
  const row = getDb()
    .prepare('SELECT * FROM assets WHERE id = ? AND (? = 1 OR nsfw = 0)')
    .get(id, options.includeNsfw ? 1 : 0) as AssetRow | undefined
  return row ? toRecord(row) : null
}

export function getAssetsByIds(ids: string[], options: ReadAssetOptions = {}): AssetRecord[] {
  if (ids.length === 0) return []
  const rows = asRows<AssetRow>(
    getDb()
      .prepare('SELECT * FROM assets WHERE (? = 1 OR nsfw = 0) AND id IN (SELECT value FROM json_each(?))')
      .all(options.includeNsfw ? 1 : 0, JSON.stringify(ids)),
  )
  const byId = new Map(rows.map((row) => [row.id, toRecord(row)]))
  return ids.map((id) => byId.get(id)).filter((asset): asset is AssetRecord => Boolean(asset))
}

/** Write-path dedupe: an upload only reuses a row of its own visibility class. */
export function findAssetBySha256(sha256: string, nsfw = false): AssetRecord | null {
  const row = getDb()
    .prepare('SELECT * FROM assets WHERE sha256 = ? AND nsfw = ?')
    .get(sha256, nsfw ? 1 : 0) as AssetRow | undefined
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
  includeNsfw?: boolean
  limit?: number
  offset?: number
}

// Hidden studio files are filtered in SQL, so the page size, the offset and the total count
// describe the same visible list. The ids travel as one JSON parameter, never as SQL text.
function studioExclusion(excludeStudioAssets: boolean | undefined): string {
  return JSON.stringify(excludeStudioAssets ? studioAssetIds() : [])
}

export function countAssets(
  filter: {
    kind?: AssetKind
    source?: AssetSource
    excludeStudioAssets?: boolean
    includeNsfw?: boolean
  } = {},
): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS count FROM assets
       WHERE (? = 1 OR nsfw = 0)
         AND kind = COALESCE(?, kind)
         AND source = COALESCE(?, source)
         AND (? = 0 OR id NOT IN (SELECT value FROM json_each(?)))`,
    )
    .get(
      filter.includeNsfw ? 1 : 0,
      filter.kind ?? null,
      filter.source ?? null,
      filter.excludeStudioAssets ? 1 : 0,
      studioExclusion(filter.excludeStudioAssets),
    ) as {
    count: number
  }
  return Number(row.count)
}

export function listAssets(filter: ListAssetsFilter = {}): AssetRecord[] {
  const limit = Math.min(Math.max(filter.limit ?? 100, 1), 1000)
  const offset = Math.max(filter.offset ?? 0, 0)
  const sources = JSON.stringify(filter.sources && filter.sources.length > 0 ? filter.sources : [])
  const folderScoped = filter.folderId !== undefined
  const folderValue = folderScoped ? (filter.folderId ?? null) : null

  const rows = asRows<AssetRow>(
    getDb()
      .prepare(
        `SELECT * FROM assets
         WHERE (? = 1 OR nsfw = 0)
           AND kind = COALESCE(?, kind)
           AND source = COALESCE(?, source)
           AND (? = '[]' OR source IN (SELECT value FROM json_each(?)))
           AND (? IS NULL OR source != ?)
           AND (? IS NULL OR kind != ?)
           AND (? = 0 OR folder_id IS ?)
           AND (? = 0 OR id NOT IN (SELECT value FROM json_each(?)))
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .all(
        filter.includeNsfw ? 1 : 0,
        filter.kind ?? null,
        filter.source ?? null,
        sources,
        sources,
        filter.excludeSource ?? null,
        filter.excludeSource ?? null,
        filter.excludeKind ?? null,
        filter.excludeKind ?? null,
        folderScoped ? 1 : 0,
        folderValue,
        filter.excludeStudioAssets ? 1 : 0,
        studioExclusion(filter.excludeStudioAssets),
        limit,
        offset,
      ),
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
