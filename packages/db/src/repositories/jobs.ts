import type { GenerationStatus, ProviderId } from '@sunnygen/core'
import { getDb } from '../database'
import { asRows } from '../rows'

interface JobRow {
  task_id: string
  generation_id: string
  provider: string
  provider_job_id: string | null
  status: string
  poll_after: number
  attempts: number
  created_at: number
  updated_at: number
}

export interface JobRecord {
  taskId: string
  generationId: string
  provider: ProviderId
  providerJobId: string | null
  status: GenerationStatus
  pollAfter: number
  attempts: number
  createdAt: number
  updatedAt: number
}

function toRecord(row: JobRow): JobRecord {
  return {
    taskId: row.task_id,
    generationId: row.generation_id,
    provider: row.provider as ProviderId,
    providerJobId: row.provider_job_id,
    status: row.status as GenerationStatus,
    pollAfter: row.poll_after,
    attempts: row.attempts,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export interface SaveJobInput {
  taskId: string
  generationId: string
  provider: ProviderId
  providerJobId?: string | null
  status: GenerationStatus
  pollAfter?: number
}

export function saveJob(input: SaveJobInput): JobRecord {
  const timestamp = Date.now()
  getDb()
    .prepare(
      `INSERT INTO jobs (task_id, generation_id, provider, provider_job_id, status, poll_after, attempts, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
       ON CONFLICT(task_id) DO UPDATE SET
         provider_job_id = excluded.provider_job_id,
         status = excluded.status,
         poll_after = excluded.poll_after,
         updated_at = excluded.updated_at`,
    )
    .run(
      input.taskId,
      input.generationId,
      input.provider,
      input.providerJobId ?? null,
      input.status,
      input.pollAfter ?? 0,
      timestamp,
      timestamp,
    )
  return getJob(input.taskId) as JobRecord
}

export function getJob(taskId: string): JobRecord | null {
  const row = getDb().prepare('SELECT * FROM jobs WHERE task_id = ?').get(taskId) as JobRow | undefined
  return row ? toRecord(row) : null
}

export function listDueJobs(now = Date.now(), limit = 20): JobRecord[] {
  const rows = asRows<JobRow>(
    getDb()
      .prepare(
        `SELECT * FROM jobs WHERE status IN ('queued', 'running') AND poll_after <= ?
         ORDER BY poll_after ASC LIMIT ?`,
      )
      .all(now, limit),
  )
  return rows.map(toRecord)
}

export function bumpJobAttempt(taskId: string, pollAfter: number): void {
  getDb()
    .prepare('UPDATE jobs SET attempts = attempts + 1, poll_after = ?, updated_at = ? WHERE task_id = ?')
    .run(pollAfter, Date.now(), taskId)
}

export function deleteJob(taskId: string): void {
  getDb().prepare('DELETE FROM jobs WHERE task_id = ?').run(taskId)
}
