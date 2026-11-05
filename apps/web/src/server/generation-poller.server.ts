import { getModel, type GenerationKind, type GenerationRecord } from '@sunnygen/core'
import {
  bumpJobAttempt,
  deleteJob,
  getGeneration,
  listDueJobs,
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
  timer: ReturnType<typeof setInterval>
  busy: boolean
  resumed: boolean
}

const GLOBAL_KEY = '__sunnygenGenerationPoller'

function getState(): PollerState {
  const registry = globalThis as typeof globalThis & { [GLOBAL_KEY]?: PollerState }
  if (registry[GLOBAL_KEY]) return registry[GLOBAL_KEY]
  const state: PollerState = { busy: false, resumed: false, timer: setInterval(tick, POLL_INTERVAL_MS) }
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

export function ensurePoller(): void {
  const state = getState()
  resumePending()
  state.timer.ref?.()
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
          updateGeneration(generation.id, { status: 'succeeded', outputAssetIds: outputIds })
          deleteJob(job.taskId)
        } else if (result.status === 'failed') {
          updateGeneration(generation.id, { status: 'failed', error: result.error ?? 'Generation failed' })
          deleteJob(job.taskId)
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
  } catch (error) {
    console.error('[generation-poller]', error)
  }
}

export type { GenerationRecord }
