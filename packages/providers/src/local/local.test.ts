import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getModel, type ImageModelDefinition } from '@sunnygen/core'
import { getAdapter } from '../registry'
import { ProviderError, type AdapterContext, type ProviderRequest } from '../types'
import { localStatus } from './client'
import { pollLocal } from './image'

function localModel(): ImageModelDefinition {
  const model = getModel('local-sd-server')
  assert.ok(model && model.kind === 'image', 'local-sd-server is not an image model')
  return model
}

function localContext(respond: (url: string) => Response | null): {
  context: AdapterContext
  urls: string[]
} {
  const urls: string[] = []
  return {
    urls,
    context: {
      apiKey: null,
      baseUrl: null,
      deployment: null,
      fetch: async (input) => {
        const url = String(input)
        urls.push(url)
        return respond(url) ?? new Response('unmocked', { status: 500 })
      },
    },
  }
}

test('local generation submits an sd-server job on the loopback default', async () => {
  const { context, urls } = localContext(() =>
    Response.json({ id: 'job_1', status: 'queued' }, { status: 202 }),
  )
  const result = await getAdapter('local').submit(context, {
    kind: 'image',
    model: localModel(),
    prompt: 'a quiet lake at dawn',
    params: { aspectRatio: '1:1', quality: '1k' },
    assets: [],
  } satisfies ProviderRequest)

  assert.equal(urls[0], 'http://127.0.0.1:1234/sdcpp/v1/img_gen')
  assert.equal(result.status, 'running')
  assert.equal(result.providerJobId, 'job_1')
})

test('local generation reports a server without a model', async () => {
  const { context } = localContext(() =>
    Response.json({ error: 'No current model is configured', code: 'model_not_loaded' }, { status: 503 }),
  )
  await assert.rejects(
    getAdapter('local').submit(context, {
      kind: 'image',
      model: localModel(),
      prompt: 'a quiet lake at dawn',
      params: {},
      assets: [],
    } satisfies ProviderRequest),
    (error: unknown) => {
      assert.ok(error instanceof ProviderError)
      assert.match(error.message, /sd-server has no model loaded/)
      return true
    },
  )
})

test('local polling returns the encoded image of a finished job', async () => {
  const png = Buffer.from([137, 80, 78, 71]).toString('base64')
  const { context, urls } = localContext(() =>
    Response.json({
      id: 'job_1',
      status: 'completed',
      result: { output_format: 'png', images: [{ index: 0, b64_json: png }] },
    }),
  )
  const poll = await pollLocal(context, { providerJobId: 'job_1', model: localModel(), kind: 'image' })

  assert.equal(urls[0], 'http://127.0.0.1:1234/sdcpp/v1/jobs/job_1')
  assert.equal(poll.status, 'succeeded')
  assert.equal(poll.outputs?.[0]?.mime, 'image/png')
  assert.deepEqual([...(poll.outputs?.[0]?.buffer ?? [])], [137, 80, 78, 71])
})

test('local polling surfaces a failed job’s own message', async () => {
  const { context } = localContext(() =>
    Response.json({
      id: 'job_1',
      status: 'failed',
      error: { code: 'generation_failed', message: 'generate_image returned empty results' },
    }),
  )
  const poll = await pollLocal(context, { providerJobId: 'job_1', model: localModel(), kind: 'image' })
  assert.equal(poll.status, 'failed')
  assert.match(poll.error ?? '', /empty results/)
})

test('local status separates a dead server from a running one without a model', async () => {
  const dead = await localStatus('http://127.0.0.1:1234', (async () => {
    throw new Error('connect ECONNREFUSED')
  }) as typeof fetch)
  assert.deepEqual(dead, { reachable: false, modelLoaded: false })

  const empty = await localStatus('http://127.0.0.1:1234', (async () =>
    Response.json({ error: 'No current model is configured' }, { status: 503 })) as typeof fetch)
  assert.deepEqual(empty, { reachable: true, modelLoaded: false })

  const ready = await localStatus('http://127.0.0.1:1234', (async () =>
    Response.json({ data: [{ id: 'sd-cpp-local' }] })) as typeof fetch)
  assert.deepEqual(ready, { reachable: true, modelLoaded: true })
})
