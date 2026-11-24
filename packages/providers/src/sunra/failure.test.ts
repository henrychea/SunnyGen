import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pollSunra } from './client'
import type { AdapterContext } from '../types'

function context(status: unknown): AdapterContext {
  return {
    apiKey: 'test',
    baseUrl: null,
    deployment: null,
    uploads: null,
    fetch: async () => Response.json(status),
  }
}

const job = { providerJobId: 'req-1', kind: 'image' as const, model: { id: 'x' } as never }

test('an input Sunra could not fetch for size reads as fixable and can be retried', async () => {
  const result = await pollSunra(
    context({
      status: 'FAILED',
      error: {
        code: 'invalid_input',
        reason: 'input_fetch_failed',
        message:
          'Failed to fetch an input file (https://assets.sunra.ai/uploads/550f1ea0.png): the file exceeds the download size limit.',
      },
    }),
    job,
  )

  assert.equal(result.status, 'failed')
  assert.equal(
    result.error,
    'An input image was too large for Sunra. It has been resized for next time; press Retry.',
  )
  assert.equal(result.failure?.retryable, true)
  assert.equal(result.failure?.reason, 'input_fetch_failed')
})

test('any other Sunra failure keeps its own message and retryability', async () => {
  const result = await pollSunra(
    context({
      status: 'FAILED',
      error: {
        code: 'invalid_input',
        reason: 'input_fetch_failed',
        message: 'Failed to fetch the input file at https://media.example.com/a.png: HTTP 403.',
      },
    }),
    job,
  )

  assert.match(String(result.error), /HTTP 403/)
  assert.notEqual(String(result.error), undefined)
  assert.equal(result.failure?.retryable, null)
})
