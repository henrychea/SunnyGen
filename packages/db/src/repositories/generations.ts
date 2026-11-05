import { randomUUID } from 'node:crypto'
import type {
  GenerationKind,
  GenerationParams,
  GenerationRecord,
  GenerationStatus,
  ProviderId,
} from '@sunnygen/core'
import { getDb } from '../database'
import { asRows } from '../rows'

interface GenerationRow {
  id: string
  kind: string
  provider: string
  model: string
  status: string
  prompt: string
  params: string
  input_asset_ids: string
  output_asset_ids: string
  provider_job_id: string | null
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

function toRecord(row: GenerationRow): GenerationRecord {
  return {
    id: row.id,
    kind: row.kind as GenerationKind,
    provider: row.provider as ProviderId,
    model: row.model,
    status: row.status as GenerationStatus,
    prompt: row.prompt,
    params: parseJson<GenerationParams>(row.params, {}),
    inputAssetIds: parseJson<string[]>(row.input_asset_ids, []),
    outputAssetIds: parseJson<string[]>(row.output_asset_ids, []),
    providerJobId: row.provider_job_id,
    error: row.error,
    folderId: row.folder_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export interface CreateGenerationInput {
  kind: GenerationKind
  provider: ProviderId
  model: string
  prompt: string
  params?: GenerationParams
  inputAssetIds?: string[]
  folderId?: string | null
}

export function createGeneration(input: CreateGenerationInput): GenerationRecord {
  const id = randomUUID()
  const timestamp = Date.now()
  getDb()
    .prepare(
      `INSERT INTO generations
        (id, kind, provider, model, status, prompt, params, input_asset_ids,
         output_asset_ids, folder_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, '[]', ?, ?, ?)`,
    )
    .run(
      id,
      input.kind,
      input.provider,
      input.model,
      input.prompt,
      JSON.stringify(input.params ?? {}),
      JSON.stringify(input.inputAssetIds ?? []),
      input.folderId ?? null,
      timestamp,
      timestamp,
    )
  return getGeneration(id) as GenerationRecord
}

export interface UpdateGenerationPatch {
  status?: GenerationStatus
  outputAssetIds?: string[]
  providerJobId?: string | null
  error?: string | null
  folderId?: string | null
  model?: string
  prompt?: string
  params?: GenerationParams
}

export function updateGeneration(id: string, patch: UpdateGenerationPatch): GenerationRecord | null {
  const columns: string[] = []
  const values: Array<string | number | null> = []
  const push = (column: string, value: string | number | null) => {
    columns.push(`${column} = ?`)
    values.push(value)
  }

  if (patch.status !== undefined) push('status', patch.status)
  if (patch.outputAssetIds !== undefined) push('output_asset_ids', JSON.stringify(patch.outputAssetIds))
  if (patch.providerJobId !== undefined) push('provider_job_id', patch.providerJobId)
  if (patch.error !== undefined) push('error', patch.error)
  if (patch.folderId !== undefined) push('folder_id', patch.folderId)
  if (patch.model !== undefined) push('model', patch.model)
  if (patch.prompt !== undefined) push('prompt', patch.prompt)
  if (patch.params !== undefined) push('params', JSON.stringify(patch.params))
  if (columns.length === 0) return getGeneration(id)

  push('updated_at', Date.now())
  values.push(id)
  getDb()
    .prepare(`UPDATE generations SET ${columns.join(', ')} WHERE id = ?`)
    .run(...values)
  return getGeneration(id)
}

export function getGeneration(id: string): GenerationRecord | null {
  const row = getDb().prepare('SELECT * FROM generations WHERE id = ?').get(id) as GenerationRow | undefined
  return row ? toRecord(row) : null
}

export function findGenerationByProviderJob(providerJobId: string): GenerationRecord | null {
  const row = getDb()
    .prepare('SELECT * FROM generations WHERE provider_job_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(providerJobId) as GenerationRow | undefined
  return row ? toRecord(row) : null
}

export interface ListGenerationsFilter {
  kind?: GenerationKind
  status?: GenerationStatus
  folderId?: string | null
  limit?: number
  offset?: number
}

export function listGenerations(filter: ListGenerationsFilter = {}): GenerationRecord[] {
  const conditions: string[] = []
  const values: Array<string | number | null> = []

  if (filter.kind) {
    conditions.push('kind = ?')
    values.push(filter.kind)
  }
  if (filter.status) {
    conditions.push('status = ?')
    values.push(filter.status)
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

  const rows = asRows<GenerationRow>(
    getDb()
      .prepare(`SELECT * FROM generations ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .all(...values),
  )
  return rows.map(toRecord)
}

export function countGenerations(filter: { status?: GenerationStatus; kind?: GenerationKind } = {}): number {
  const conditions: string[] = []
  const values: string[] = []
  if (filter.status) {
    conditions.push('status = ?')
    values.push(filter.status)
  }
  if (filter.kind) {
    conditions.push('kind = ?')
    values.push(filter.kind)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const row = getDb()
    .prepare(`SELECT COUNT(*) AS count FROM generations ${where}`)
    .get(...values) as {
    count: number
  }
  return Number(row.count)
}

export function listPendingGenerations(): GenerationRecord[] {
  const rows = asRows<GenerationRow>(
    getDb()
      .prepare(
        `SELECT * FROM generations WHERE status IN ('queued', 'running')
         ORDER BY created_at ASC LIMIT 200`,
      )
      .all(),
  )
  return rows.map(toRecord)
}

export function deleteGeneration(id: string): boolean {
  const result = getDb().prepare('DELETE FROM generations WHERE id = ?').run(id)
  return result.changes > 0
}

export function moveGenerationToFolder(id: string, folderId: string | null): boolean {
  const result = getDb()
    .prepare('UPDATE generations SET folder_id = ?, updated_at = ? WHERE id = ?')
    .run(folderId, Date.now(), id)
  return result.changes > 0
}
