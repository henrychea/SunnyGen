import assert from 'node:assert/strict'
import { test } from 'node:test'
import { submitFalQueue } from './fal/client'
import { responseFailure } from './http'
import { DECLINED_ERROR, DECLINED_FAILURE, ProviderError, type AdapterContext } from './types'

const DECLINE_BODY = {
  detail: [
    {
      type: 'invalid_request',
      loc: ['body', 'image_urls'],
      msg: 'Could not generate images with the given prompts and images',
    },
  ],
}

function context(response: Response): AdapterContext {
  return { apiKey: 'key', baseUrl: null, deployment: null, fetch: async () => response, uploads: null }
}

test('a refusal is read from the body instead of being flattened into its message', async () => {
  const refusal = await responseFailure(Response.json(DECLINE_BODY, { status: 422 }), 'fal error 422')
  assert.equal(refusal.declined, true)
  assert.equal(refusal.message, 'Could not generate images with the given prompts and images')
})

test('an ordinary provider fault is not a refusal', async () => {
  assert.deepEqual(await responseFailure(Response.json({ detail: 'Internal error' }, { status: 500 }), 'x'), {
    message: 'Internal error',
    declined: false,
  })
  assert.equal(
    (await responseFailure(new Response('upstream timeout', { status: 504 }), 'x')).declined,
    false,
  )
})

test('a declined fal request fails as a non-retryable decision', async () => {
  await assert.rejects(
    submitFalQueue(context(Response.json(DECLINE_BODY, { status: 422 })), 'fal-ai/nano-banana/edit', {}),
    (error: unknown) => {
      assert.ok(error instanceof ProviderError)
      assert.equal(error.status, 422)
      assert.equal(error.message, DECLINED_ERROR)
      assert.deepEqual(error.failure, DECLINED_FAILURE)
      assert.deepEqual(error.failure, { code: 'invalid_request', reason: 'declined', retryable: false })
      return true
    },
  )
})

test('a fal fault keeps its own message and offers no failure override', async () => {
  await assert.rejects(
    submitFalQueue(
      context(Response.json({ detail: 'Internal error' }, { status: 500 })),
      'fal-ai/nano-banana/edit',
      {},
    ),
    (error: unknown) =>
      error instanceof ProviderError && error.message === 'Internal error' && !error.failure,
  )
})
