import { getModel, type GenerationKind, type GenerationRecord } from '@sunnygen/core'
import {
  bumpJobAttempt,
  deleteJob,
  getGeneration,
  listDueJobs,
  listGenerations,
  listPendingGenerations,
  saveJob,
  updateGeneration,
} from '@sunnygen/db'
import { adapterFor, providerContext, storeProviderOutputs } from './generation.server'

const POLL_INTERVAL_MS = 3_000
const MAX_AGE_MS: Record<GenerationKind, number> = {
  image: 20 * 60 * 1000,
  video: 60 * 60 * 1000,
}

interface PollerState {
  timer: NodeJS.Timeout
  busy: boolean
  resumed: boolean
  recovering: boolean
  recoveredAt: number
}

const GLOBAL_KEY = '__sunnygenGenerationPoller'
const RECOVERY_INTERVAL_MS = 120_000

function getState(): PollerState {
  const registry = globalThis as typeof globalThis & { [GLOBAL_KEY]?: PollerState }
  if (registry[GLOBAL_KEY]) return registry[GLOBAL_KEY]
  const state: PollerState = {
    busy: false,
    resumed: false,
    recovering: false,
    recoveredAt: 0,
    timer: setInterval(tick, POLL_INTERVAL_MS),
  }
  state.timer.unref?.()
  registry[GLOBAL_KEY] = state
  return state
}

function resumePending(): void {
  const state = getState()
  if (state.resumed) return
  state.resumed = true
  for (const generation of listPendingGenerations()) {
    if (!generation.providerJobId) continue
    saveJob({
      taskId: generation.id,
      generationId: generation.id,
      provider: generation.provider,
      providerJobId: generation.providerJobId,
      status: generation.status,
      pollAfter: Date.now() + POLL_INTERVAL_MS,
    })
  }
}

async function recoverFailedJobs(): Promise<void> {
  const state = getState()
  if (state.recovering) return
  state.recovering = true
  try {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000
    const failed = listGenerations({ status: 'failed', limit: 25 }).filter(
      (generation) => generation.providerJobId && generation.createdAt >= cutoff,
    )
    for (const generation of failed) {
      const adapter = adapterFor(generation.provider)
      if (!adapter.poll) continue
      try {
        const result = await adapter.poll(providerContext(generation.provider), {
          providerJobId: generation.providerJobId as string,
          model: getModel(generation.model) ?? ({ id: generation.model } as never),
          kind: generation.kind,
        })
        if (result.status === 'succeeded') {
          const outputIds = await storeProviderOutputs(result.outputs ?? [], generation.folderId)
          updateGeneration(generation.id, {
            status: 'succeeded',
            outputAssetIds: outputIds,
            error: null,
          })
          console.info(`[generation-poller] recovered ${generation.id}`)
        } else if (result.status === 'failed') {
          updateGeneration(generation.id, {
            status: 'failed',
            error: result.error ?? generation.error ?? 'Generation failed',
            errorCode: result.failure?.code ?? generation.errorCode,
            errorReason: result.failure?.reason ?? generation.errorReason,
            errorRetryable: result.failure?.retryable ?? generation.errorRetryable,
          })
        }
      } catch {
        // Keep the original failure when the provider is no longer reachable.
      }
    }
  } finally {
    state.recovering = false
  }
}

export function ensurePoller(): void {
  const state = getState()
  resumePending()
  maybeRecover()
  state.timer.ref?.()
}

function maybeRecover(): void {
  const state = getState()
  if (state.recovering || Date.now() - state.recoveredAt < RECOVERY_INTERVAL_MS) return
  state.recoveredAt = Date.now()
  void recoverFailedJobs()
}

export async function processGenerationJobs(): Promise<void> {
  const state = getState()
  if (state.busy) return
  state.busy = true
  try {
    const jobs = listDueJobs(Date.now(), 10)
    for (const job of jobs) {
      const generation = getGeneration(job.generationId)
      if (
        !generation ||
        generation.status === 'succeeded' ||
        generation.status === 'failed' ||
        generation.status === 'cancelled'
      ) {
        deleteJob(job.taskId)
        continue
      }
      if (!generation.providerJobId) {
        updateGeneration(generation.id, {
          status: 'failed',
          error: 'Generation job is missing its provider id',
        })
        deleteJob(job.taskId)
        continue
      }

      const age = Date.now() - generation.createdAt
      if (age > MAX_AGE_MS[generation.kind]) {
        updateGeneration(generation.id, { status: 'failed', error: 'Generation timed out' })
        deleteJob(job.taskId)
        continue
      }

      const adapter = adapterFor(generation.provider)
      if (!adapter.poll) {
        updateGeneration(generation.id, { status: 'failed', error: 'Provider did not expose a job status' })
        deleteJob(job.taskId)
        continue
      }

      try {
        const result = await adapter.poll(providerContext(generation.provider), {
          providerJobId: generation.providerJobId,
          model: getModel(generation.model) ?? ({ id: generation.model } as never),
          kind: generation.kind,
        })
        if (result.status === 'succeeded') {
          const outputIds = await storeProviderOutputs(result.outputs ?? [], generation.folderId)
          updateGeneration(generation.id, {
            status: 'succeeded',
            outputAssetIds: outputIds,
            error: null,
          })
          deleteJob(job.taskId)
        } else if (result.status === 'failed') {
          const message = result.error ?? 'Generation failed'
          const transientAuth = /401|invalid .*api key|rejected the request \(401\)/i.test(message)
          if (transientAuth && job.attempts < 10) {
            bumpJobAttempt(job.taskId, Date.now() + 15_000)
          } else {
            updateGeneration(generation.id, {
              status: 'failed',
              error: message,
              errorCode: result.failure?.code ?? null,
              errorReason: result.failure?.reason ?? null,
              errorRetryable: result.failure?.retryable ?? null,
            })
            deleteJob(job.taskId)
          }
        } else {
          const delay = job.attempts > 40 ? 15_000 : POLL_INTERVAL_MS
          bumpJobAttempt(job.taskId, Date.now() + delay)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Generation poll failed'
        if (job.attempts > 100) {
          updateGeneration(generation.id, { status: 'failed', error: message })
          deleteJob(job.taskId)
        } else {
          bumpJobAttempt(job.taskId, Date.now() + 10_000)
        }
      }
    }
  } finally {
    state.busy = false
  }
}

async function tick(): Promise<void> {
  try {
    await processGenerationJobs()
    maybeRecover()
  } catch (error) {
    console.error('[generation-poller]', error)
  }
}

export type { GenerationRecord }
