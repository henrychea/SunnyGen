import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getModel, type ImageModelDefinition } from '@sunnygen/core'
import { getAdapter } from '../registry'
import { ProviderError, type AdapterContext, type ProviderRequest } from '../types'
import { pollWiro, WIRO_API } from './client'
import { wiroImageBody } from './image'

interface WiroCall {
  url: string
  method: string
  headers: Record<string, string>
  body: unknown
}

function wiroContext(respond: (url: string) => Response | null): {
  context: AdapterContext
  calls: WiroCall[]
} {
  const calls: WiroCall[] = []
  return {
    calls,
    context: {
      apiKey: 'test-key',
      baseUrl: null,
      deployment: null,
      fetch: async (input, init) => {
        const url = String(input)
        calls.push({
          url,
          method: String(init?.method ?? 'GET'),
          headers: (init?.headers ?? {}) as Record<string, string>,
          body: init?.body,
        })
        return respond(url) ?? new Response('unmocked', { status: 500 })
      },
    },
  }
}

function wiroModel(id: string): ImageModelDefinition {
  const model = getModel(id)
  assert.ok(model && model.kind === 'image', `${id} is not an image model`)
  return model
}

test('Z Image Uncensored runs on Wiro with the documented ratio', async () => {
  const { context, calls } = wiroContext(() => Response.json({ result: true, taskid: '2221' }))
  const result = await getAdapter('wiro').submit(context, {
    kind: 'image',
    model: wiroModel('z-image-uncensored'),
    prompt: 'a sunlit hotel balcony',
    params: { aspectRatio: '16:9' },
    assets: [],
  } satisfies ProviderRequest)

  assert.equal(result.status, 'running')
  assert.equal(result.providerJobId, '2221')
  assert.equal(calls[0]?.url, `${WIRO_API}/Run/wiro-partners/z-image-uncensored`)
  assert.equal(calls[0]?.headers['x-api-key'], 'test-key')
  assert.deepEqual(JSON.parse(String(calls[0]?.body)), { prompt: 'a sunlit hotel balcony', ratio: '16:9' })
})

test('Z Image Pro Uncensored sends its documented resolution and prompt extent', () => {
  const body = wiroImageBody(
    {
      kind: 'image',
      model: wiroModel('z-image-pro-uncensored'),
      prompt: 'a dim hotel suite',
      params: { aspectRatio: '9:16', quality: '2k' },
      assets: [],
    } satisfies ProviderRequest,
    wiroModel('z-image-pro-uncensored'),
  )
  assert.deepEqual(body, {
    prompt: 'a dim hotel suite',
    ratio: '9:16',
    resolution: '2k',
    promptExtend: 'false',
  })
})

test('Qwen Image Edit Uncensored uploads its inputs as Wiro multipart fields', async () => {
  const { context, calls } = wiroContext(() => Response.json({ result: true, taskid: '33' }))
  await getAdapter('wiro').submit(context, {
    kind: 'image',
    model: wiroModel('qwen-image-edit-uncensored'),
    prompt: 'change the outfit',
    params: {},
    assets: [
      { buffer: Buffer.from('one'), mime: 'image/png', fileName: 'one.png' },
      { buffer: Buffer.from('two'), mime: 'image/png', fileName: 'two.png' },
    ],
  } satisfies ProviderRequest)

  const body = calls[0]?.body
  assert.ok(body instanceof FormData, 'the edit model needs a multipart body')
  assert.equal(body.get('prompt'), 'change the outfit')
  assert.equal(body.get('inputImageUrl'), '')
  assert.equal(body.getAll('inputImage').length, 2)
  assert.equal(calls[0]?.headers['content-type'], undefined)
})

test('Wiro over-limit answers are retryable, not failures', async () => {
  const { context } = wiroContext(() =>
    Response.json({ result: false, errors: [{ code: 96, message: 'Too many parallel tasks' }] }),
  )
  await assert.rejects(
    getAdapter('wiro').submit(context, {
      kind: 'image',
      model: wiroModel('z-image-uncensored'),
      prompt: 'a sunlit hotel balcony',
      params: {},
      assets: [],
    } satisfies ProviderRequest),
    (error: unknown) => {
      assert.ok(error instanceof ProviderError)
      assert.equal(error.failure?.retryable, true)
      assert.match(error.message, /as many tasks/i)
      return true
    },
  )
})

test('Wiro polling keeps a running task running', async () => {
  const { context, calls } = wiroContext(() =>
    Response.json({ result: true, tasklist: [{ id: '2221', status: 'task_start' }] }),
  )
  const poll = await pollWiro(context, {
    providerJobId: '2221',
    model: wiroModel('z-image-uncensored'),
    kind: 'image',
  })
  assert.equal(poll.status, 'running')
  assert.equal(calls[0]?.url, `${WIRO_API}/Task/Detail`)
  assert.deepEqual(JSON.parse(String(calls[0]?.body)), { taskid: '2221' })
})

test('Wiro polling copies a finished task’s outputs', async () => {
  const { context } = wiroContext(() =>
    Response.json({
      result: true,
      tasklist: [
        {
          id: '2221',
          status: 'task_postprocess_end',
          pexit: '0',
          outputs: [{ url: 'https://cdn1.wiro.ai/task/0.png', contenttype: 'image/png' }],
        },
      ],
    }),
  )
  const original = globalThis.fetch
  globalThis.fetch = (async () => {
    const response = new Response(new Uint8Array([137, 80, 78, 71]), {
      status: 200,
      headers: { 'content-type': 'image/png' },
    })
    Object.defineProperty(response, 'url', { value: 'https://cdn1.wiro.ai/task/0.png' })
    return response
  }) as typeof fetch
  try {
    const poll = await pollWiro(context, {
      providerJobId: '2221',
      model: wiroModel('z-image-uncensored'),
      kind: 'image',
    })
    assert.equal(poll.status, 'succeeded')
    assert.equal(poll.outputs?.[0]?.mime, 'image/png')
    assert.deepEqual([...(poll.outputs?.[0]?.buffer ?? [])], [137, 80, 78, 71])
  } finally {
    globalThis.fetch = original
  }
})

test('Wiro polling reports a failed task with the model’s own message', async () => {
  const { context } = wiroContext(() =>
    Response.json({
      result: true,
      tasklist: [
        {
          id: '2221',
          status: 'task_postprocess_end',
          pexit: '1',
          debugerror: 'prompt rejected by the model',
          outputs: [],
        },
      ],
    }),
  )
  const poll = await pollWiro(context, {
    providerJobId: '2221',
    model: wiroModel('z-image-uncensored'),
    kind: 'image',
  })
  assert.equal(poll.status, 'failed')
  assert.match(poll.error ?? '', /prompt rejected/)
})
