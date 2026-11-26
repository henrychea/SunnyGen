import { randomUUID } from 'node:crypto'
import type { VideoCopyRecord, VideoCopyShot, VideoCopyStatus } from '@sunnygen/core'
import { getDb } from '../database'
import { asRows } from '../rows'

interface VideoCopyRow {
  id: string
  source_asset_id: string
  status: string
  agent: string | null
  shots: string
  frame_asset_ids: string
  output_asset_id: string | null
  error: string | null
  folder_id: string | null
  created_at: number
  updated_at: number
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function toRecord(row: VideoCopyRow): VideoCopyRecord {
  return {
    id: row.id,
    sourceAssetId: row.source_asset_id,
    status: row.status as VideoCopyStatus,
    agent: row.agent,
    shots: parseJson<VideoCopyShot[]>(row.shots, []),
    frameAssetIds: parseJson<string[]>(row.frame_asset_ids, []),
    outputAssetId: row.output_asset_id,
    error: row.error,
    folderId: row.folder_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export interface CreateVideoCopyInput {
  sourceAssetId: string
  status?: VideoCopyStatus
  agent?: string | null
  shots?: VideoCopyShot[]
  frameAssetIds?: string[]
  folderId?: string | null
}

export function createVideoCopy(input: CreateVideoCopyInput): VideoCopyRecord {
  const id = randomUUID()
  const timestamp = Date.now()
  getDb()
    .prepare(
      `INSERT INTO video_copies
        (id, source_asset_id, status, agent, shots, frame_asset_ids, output_asset_id, error, folder_id,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
    )
    .run(
      id,
      input.sourceAssetId,
      input.status ?? 'extracted',
      input.agent ?? null,
      JSON.stringify(input.shots ?? []),
      JSON.stringify(input.frameAssetIds ?? []),
      input.folderId ?? null,
      timestamp,
      timestamp,
    )
  return getVideoCopy(id, { includeNsfw: true }) as VideoCopyRecord
}

export interface UpdateVideoCopyPatch {
  status?: VideoCopyStatus
  agent?: string | null
  shots?: VideoCopyShot[]
  frameAssetIds?: string[]
  outputAssetId?: string | null
  error?: string | null
  folderId?: string | null
}

export function updateVideoCopy(id: string, patch: UpdateVideoCopyPatch): VideoCopyRecord | null {
  const current = getVideoCopy(id, { includeNsfw: true })
  if (!current) return null
  const defined = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as UpdateVideoCopyPatch
  const next: VideoCopyRecord = { ...current, ...defined }

  getDb()
    .prepare(
      `UPDATE video_copies
       SET status = ?, agent = ?, shots = ?, frame_asset_ids = ?, output_asset_id = ?, error = ?,
           folder_id = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      next.status,
      next.agent,
      JSON.stringify(next.shots),
      JSON.stringify(next.frameAssetIds),
      next.outputAssetId,
      next.error,
      next.folderId,
      Date.now(),
      id,
    )
  return getVideoCopy(id, { includeNsfw: true })
}

export interface ReadVideoCopyOptions {
  includeNsfw?: boolean
}

/** A copy is as visible as the video it came from, so the flag is read from the source row. */
export function getVideoCopy(id: string, options: ReadVideoCopyOptions = {}): VideoCopyRecord | null {
  const row = getDb()
    .prepare(
      `SELECT video_copies.* FROM video_copies
       JOIN assets ON assets.id = video_copies.source_asset_id
       WHERE video_copies.id = ? AND (? = 1 OR assets.nsfw = 0)`,
    )
    .get(id, options.includeNsfw ? 1 : 0) as VideoCopyRow | undefined
  return row ? toRecord(row) : null
}

export function listVideoCopies(limit = 50, options: ReadVideoCopyOptions = {}): VideoCopyRecord[] {
  const rows = asRows<VideoCopyRow>(
    getDb()
      .prepare(
        `SELECT video_copies.* FROM video_copies
         JOIN assets ON assets.id = video_copies.source_asset_id
         WHERE (? = 1 OR assets.nsfw = 0)
         ORDER BY video_copies.created_at DESC LIMIT ?`,
      )
      .all(options.includeNsfw ? 1 : 0, Math.min(Math.max(limit, 1), 200)),
  )
  return rows.map(toRecord)
}

// Frames and clips stay in the library: deleting a copy must not delete media the owner may
// still want.
export function deleteVideoCopy(id: string): boolean {
  const result = getDb().prepare('DELETE FROM video_copies WHERE id = ?').run(id)
  return result.changes > 0
}
