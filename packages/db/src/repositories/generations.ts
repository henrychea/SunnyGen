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
  error_code: string | null
  error_reason: string | null
  error_retryable: number | null
  folder_id: string | null
  created_at: number
  updated_at: number
  nsfw: number | null
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
    errorCode: row.error_code,
    errorReason: row.error_reason,
    errorRetryable: row.error_retryable === null ? null : row.error_retryable === 1,
    folderId: row.folder_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    nsfw: row.nsfw === 1,
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
  nsfw?: boolean
}

export function createGeneration(input: CreateGenerationInput): GenerationRecord {
  const id = randomUUID()
  const timestamp = Date.now()
  getDb()
    .prepare(
      `INSERT INTO generations
        (id, kind, provider, model, status, prompt, params, input_asset_ids,
         output_asset_ids, folder_id, nsfw, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, '[]', ?, ?, ?, ?)`,
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
      input.nsfw === true ? 1 : 0,
      timestamp,
      timestamp,
    )
  return getGeneration(id, { includeNsfw: true }) as GenerationRecord
}

export interface UpdateGenerationPatch {
  status?: GenerationStatus
  outputAssetIds?: string[]
  providerJobId?: string | null
  error?: string | null
  errorCode?: string | null
  errorReason?: string | null
  errorRetryable?: boolean | null
  folderId?: string | null
  model?: string
  prompt?: string
  params?: GenerationParams
  nsfw?: boolean
}

export function updateGeneration(id: string, patch: UpdateGenerationPatch): GenerationRecord | null {
  if (Object.keys(patch).length === 0) return getGeneration(id, { includeNsfw: true })
  const current = getGeneration(id, { includeNsfw: true })
  if (!current) return null

  // Cleared errors take their code, reason and retryability with them.
  const clearsError = patch.error === null
  const keep = <T>(patchValue: T | undefined, currentValue: T): T =>
    patchValue === undefined ? currentValue : patchValue
  const errorCode = clearsError ? null : keep(patch.errorCode, current.errorCode)
  const errorReason = clearsError ? null : keep(patch.errorReason, current.errorReason)
  const errorRetryable = clearsError ? null : keep(patch.errorRetryable, current.errorRetryable)

  getDb()
    .prepare(
      `UPDATE generations SET
         status = ?, output_asset_ids = ?, provider_job_id = ?, error = ?, error_code = ?,
         error_reason = ?, error_retryable = ?, folder_id = ?, model = ?, prompt = ?, params = ?,
         nsfw = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      keep(patch.status, current.status),
      JSON.stringify(keep(patch.outputAssetIds, current.outputAssetIds)),
      keep(patch.providerJobId, current.providerJobId),
      keep(patch.error, current.error),
      errorCode,
      errorReason,
      errorRetryable === null ? null : Number(errorRetryable),
      keep(patch.folderId, current.folderId),
      keep(patch.model, current.model),
      keep(patch.prompt, current.prompt),
      JSON.stringify(keep(patch.params, current.params)),
      keep(patch.nsfw, current.nsfw) ? 1 : 0,
      Date.now(),
      id,
    )
  return getGeneration(id, { includeNsfw: true })
}

export interface ReadGenerationOptions {
  includeNsfw?: boolean
}

export function getGeneration(id: string, options: ReadGenerationOptions = {}): GenerationRecord | null {
  const row = getDb()
    .prepare('SELECT * FROM generations WHERE id = ? AND (? = 1 OR nsfw = 0)')
    .get(id, options.includeNsfw ? 1 : 0) as GenerationRow | undefined
  return row ? toRecord(row) : null
}

export function findGenerationByProviderJob(providerJobId: string): GenerationRecord | null {
  const row = getDb()
    .prepare('SELECT * FROM generations WHERE provider_job_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(providerJobId) as GenerationRow | undefined
  return row ? toRecord(row) : null
}

/**
 * Webhooks carry only the provider request id. fal stores `endpoint|requestId`
 * in `provider_job_id`, so match either an exact id or a `<endpoint>|<id>` suffix.
 */
export function findGenerationByProviderRequest(
  provider: ProviderId,
  requestId: string,
): GenerationRecord | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM generations
       WHERE provider = ? AND (provider_job_id = ? OR provider_job_id LIKE ?)
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(provider, requestId, `%|${requestId}`) as GenerationRow | undefined
  return row ? toRecord(row) : null
}

export interface ListGenerationsFilter {
  kind?: GenerationKind
  status?: GenerationStatus
  folderId?: string | null
  includeNsfw?: boolean
  limit?: number
  offset?: number
}

export function listGenerations(filter: ListGenerationsFilter = {}): GenerationRecord[] {
  const limit = Math.min(Math.max(filter.limit ?? 100, 1), 1000)
  const offset = Math.max(filter.offset ?? 0, 0)
  const folderScoped = filter.folderId !== undefined
  const folderValue = folderScoped ? (filter.folderId ?? null) : null

  const rows = asRows<GenerationRow>(
    getDb()
      .prepare(
        `SELECT * FROM generations
         WHERE (? = 1 OR nsfw = 0)
           AND kind = COALESCE(?, kind)
           AND status = COALESCE(?, status)
           AND (? = 0 OR folder_id IS ?)
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .all(
        filter.includeNsfw ? 1 : 0,
        filter.kind ?? null,
        filter.status ?? null,
        folderScoped ? 1 : 0,
        folderValue,
        limit,
        offset,
      ),
  )
  return rows.map(toRecord)
}

export function countGenerations(
  filter: { status?: GenerationStatus; kind?: GenerationKind; includeNsfw?: boolean } = {},
): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS count FROM generations
       WHERE (? = 1 OR nsfw = 0)
         AND status = COALESCE(?, status)
         AND kind = COALESCE(?, kind)`,
    )
    .get(filter.includeNsfw ? 1 : 0, filter.status ?? null, filter.kind ?? null) as {
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

export function deleteFailedGenerations(): number {
  const result = getDb().prepare("DELETE FROM generations WHERE status = 'failed'").run()
  return Number(result.changes)
}

export function moveGenerationToFolder(id: string, folderId: string | null): boolean {
  const result = getDb()
    .prepare('UPDATE generations SET folder_id = ?, updated_at = ? WHERE id = ?')
    .run(folderId, Date.now(), id)
  return result.changes > 0
}
