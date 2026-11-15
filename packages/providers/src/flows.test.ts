import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ImageModelDefinition, VideoModelDefinition } from '@sunnygen/core'
import { getAdapter, getWebhook, providerFlows } from './registry'
import type { AdapterContext } from './types'

function dynamicImage(provider: 'sunra' | 'fal'): ImageModelDefinition {
  return {
    id: `${provider}:test/image`,
    kind: 'image',
    label: 'Test Image',
    providerLabel: 'Test',
    providers: [provider],
    ratios: ['1:1'],
    supportsImages: true,
    maxImages: 4,
    supportsQuality: true,
    qualityOptions: ['1k'],
    defaultQuality: '1k',
    sourceId: 'test/image',
    dynamic: true,
  }
}

function dynamicVideo(provider: 'sunra' | 'fal'): VideoModelDefinition {
  return {
    id: `${provider}:test/video`,
    kind: 'video',
    label: 'Test Video',
    providerLabel: 'Test',
    providers: [provider],
    ratios: ['16:9'],
    supportsImages: true,
    maxImages: 2,
    supportsQuality: false,
    qualityOptions: [],
    defaultQuality: '',
    durations: [4],
    defaultDuration: 4,
    defaultRatio: '16:9',
    resolutions: ['720p'],
    defaultResolution: '720p',
    sound: false,
    modes: [],
    defaultMode: '',
    sourceId: 'test/video',
    dynamic: true,
  }
}

function mockContext(): { context: AdapterContext; calls: Array<{ url: string; body: unknown }> } {
  const calls: Array<{ url: string; body: unknown }> = []
  return {
    calls,
    context: {
      apiKey: 'test',
      baseUrl: null,
      deployment: null,
      fetch: async (input, init) => {
        calls.push({
          url: String(input),
          body: init?.body ? JSON.parse(String(init.body)) : null,
        })
        return new Response(JSON.stringify({ request_id: 'mock-1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      },
    },
  }
}

test('registers a flow module for every provider', () => {
  assert.deepEqual(
    providerFlows('sunra').map((flow) => flow.id),
    ['sunra.image', 'sunra.video'],
  )
  assert.deepEqual(
    providerFlows('fal').map((flow) => flow.id),
    ['fal.image', 'fal.video'],
  )
  assert.deepEqual(
    providerFlows('azure').map((flow) => flow.id),
    ['azure.image'],
  )
  assert.deepEqual(
    providerFlows('codex').map((flow) => flow.id),
    ['codex.image'],
  )
})

test('dispatches dynamic Sunra image requests through the image flow', async () => {
  const { context, calls } = mockContext()
  const result = await getAdapter('sunra').submit(context, {
    kind: 'image',
    model: dynamicImage('sunra'),
    prompt: 'hello',
    params: { aspectRatio: '1:1', quality: '1k' },
    assets: [],
  })

  assert.equal(result.status, 'running')
  assert.equal(result.providerJobId, 'mock-1')
  assert.equal(calls[0]?.url, 'https://api.sunra.ai/v1/queue/test/image/text-to-image')
  assert.deepEqual(calls[0]?.body, {
    prompt: 'hello',
    aspect_ratio: '1:1',
    resolution: '1K',
  })
})

test('dispatches dynamic fal video requests through the video flow', async () => {
  const { context, calls } = mockContext()
  const result = await getAdapter('fal').submit(context, {
    kind: 'video',
    model: dynamicVideo('fal'),
    prompt: 'hello',
    params: { durationSeconds: 4, resolution: '720p' },
    assets: [],
  })

  assert.equal(result.status, 'running')
  assert.equal(calls[0]?.url, 'https://queue.fal.run/test/video')
  assert.deepEqual(calls[0]?.body, {
    prompt: 'hello',
    duration: 4,
    resolution: '720p',
  })
})

function referenceContext(): { context: AdapterContext; calls: Array<{ url: string; body: unknown }> } {
  const calls: Array<{ url: string; body: unknown }> = []
  return {
    calls,
    context: {
      apiKey: 'test',
      baseUrl: null,
      deployment: null,
      fetch: async (input, init) => {
        const url = String(input)
        const raw = init?.body ? String(init.body) : ''
        let body: unknown = null
        if (
          raw &&
          (url.includes('/storage/upload/initiate') ||
            url.includes('/queue/') ||
            url.includes('queue.fal.run'))
        ) {
          try {
            body = JSON.parse(raw)
          } catch {
            body = raw
          }
        }
        calls.push({ url, body })
        if (url.includes('/storage/upload/initiate')) {
          return new Response(
            JSON.stringify({
              upload_url: 'https://upload.test/file',
              file_url: 'https://cdn.test/reference.png',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        }
        if (url === 'https://upload.test/file') return new Response('ok', { status: 200 })
        return new Response(JSON.stringify({ request_id: 'mock-1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      },
    },
  }
}

const imageAsset = { buffer: Buffer.from('image'), mime: 'image/png', fileName: 'reference.png' }

test('sends Sunra references to the image-editing operation', async () => {
  const { context, calls } = referenceContext()
  await getAdapter('sunra').submit(context, {
    kind: 'image',
    model: dynamicImage('sunra'),
    prompt: 'edit',
    params: { aspectRatio: '1:1', quality: '1k' },
    assets: [imageAsset],
  })

  const queue = calls.find((call) => call.url.includes('/queue/'))
  assert.equal(queue?.url, 'https://api.sunra.ai/v1/queue/test/image/image-editing')
  assert.ok(queue?.body && typeof queue.body === 'object' && 'images' in queue.body)
  assert.deepEqual(queue.body.images, ['https://cdn.test/reference.png'])
})

test('sends fal references to the edit endpoint', async () => {
  const { context, calls } = referenceContext()
  const model = { ...dynamicImage('fal'), editSourceId: 'test/image/edit' }
  await getAdapter('fal').submit(context, {
    kind: 'image',
    model,
    prompt: 'edit',
    params: {},
    assets: [imageAsset],
  })

  const queue = calls.find((call) => call.url.includes('queue.fal.run'))
  assert.equal(queue?.url, 'https://queue.fal.run/test/image/edit')
  assert.ok(queue?.body && typeof queue.body === 'object' && 'image_urls' in queue.body)
  assert.deepEqual(queue.body.image_urls, ['https://cdn.test/reference.png'])
})

test('exposes webhook adapters only for providers that deliver callbacks', () => {
  assert.equal(getWebhook('sunra')?.requestId({ id: 'pd_1' }), 'pd_1')
  assert.equal(getWebhook('fal')?.requestId({ request_id: 'req_1' }), 'req_1')
  assert.equal(getWebhook('sunra')?.requestId({ request_id: 'wrong' }), null)
  assert.equal(getWebhook('azure'), undefined)
  assert.equal(getWebhook('codex'), undefined)
})

test('registers webhook callbacks on submit', async () => {
  const sunra = referenceContext()
  const sunraUrl = 'https://sunny.example/api/webhooks/sunra/token'
  await getAdapter('sunra').submit(sunra.context, {
    kind: 'image',
    model: dynamicImage('sunra'),
    prompt: 'edit',
    params: {},
    assets: [],
    webhookUrl: sunraUrl,
  })
  const sunraQueue = sunra.calls.find((call) => call.url.includes('/queue/'))
  assert.equal(new URL(sunraQueue?.url as string).searchParams.get('webhook'), sunraUrl)

  const fal = referenceContext()
  const falUrl = 'https://sunny.example/api/webhooks/fal/token'
  await getAdapter('fal').submit(fal.context, {
    kind: 'image',
    model: dynamicImage('fal'),
    prompt: 'edit',
    params: {},
    assets: [],
    webhookUrl: falUrl,
  })
  const falQueue = fal.calls.find((call) => call.url.includes('queue.fal.run'))
  assert.equal(new URL(falQueue?.url as string).searchParams.get('fal_webhook'), falUrl)
})

function falQueueContext(handler: (url: string) => Response | Promise<Response>): {
  context: AdapterContext
  calls: string[]
} {
  const calls: string[] = []
  return {
    calls,
    context: {
      apiKey: 'test',
      baseUrl: null,
      deployment: null,
      fetch: async (input) => {
        const url = String(input)
        calls.push(url)
        return handler(url)
      },
    },
  }
}

test('fal stores the submit response URLs and polls them directly', async () => {
  const statusUrl = 'https://queue.fal.run/fal-ai/flux/requests/req-1/status'
  const responseUrl = 'https://queue.fal.run/fal-ai/flux/requests/req-1'
  const submit = falQueueContext(() =>
    Response.json({ request_id: 'req-1', status_url: statusUrl, response_url: responseUrl }),
  )
  const submitted = await getAdapter('fal').submit(submit.context, {
    kind: 'image',
    model: dynamicImage('fal'),
    prompt: 'hello',
    params: {},
    assets: [],
  })
  assert.equal(submitted.providerJobId, `${statusUrl}|${responseUrl}|req-1`)

  const poll = falQueueContext((url) => {
    if (url === statusUrl) return Response.json({ status: 'COMPLETED', response_url: responseUrl })
    if (url === responseUrl) return Response.json({ images: [] })
    return new Response('unexpected', { status: 500 })
  })
  const result = await getAdapter('fal').poll?.(poll.context, {
    providerJobId: submitted.providerJobId as string,
    kind: 'image',
    model: dynamicImage('fal'),
  })
  assert.equal(result?.status, 'failed')
  assert.deepEqual(poll.calls, [statusUrl, responseUrl])
})

test('fal polls legacy job ids with the owner and app scope', async () => {
  const poll = falQueueContext((url) => {
    if (url === 'https://queue.fal.run/openai/gpt-image-2.5/requests/req-2/status') {
      return Response.json({
        status: 'COMPLETED',
        response_url: 'https://queue.fal.run/openai/gpt-image-2.5/requests/req-2',
      })
    }
    if (url === 'https://queue.fal.run/openai/gpt-image-2.5/requests/req-2') {
      return Response.json({ images: [] })
    }
    return new Response('unexpected', { status: 500 })
  })
  const result = await getAdapter('fal').poll?.(poll.context, {
    providerJobId: 'openai/gpt-image-2.5/flare/text-to-image|req-2',
    kind: 'image',
    model: dynamicImage('fal'),
  })
  assert.equal(result?.status, 'failed')
  assert.deepEqual(poll.calls, [
    'https://queue.fal.run/openai/gpt-image-2.5/requests/req-2/status',
    'https://queue.fal.run/openai/gpt-image-2.5/requests/req-2',
  ])
})

test('Sunra keeps the structured failure code, reason and retryable flag', async () => {
  const context: AdapterContext = {
    apiKey: 'test',
    baseUrl: null,
    deployment: null,
    fetch: async () =>
      Response.json({
        status: 'COMPLETED',
        success: false,
        error: {
          code: 'unsafe_content',
          reason: 'moderation_blocked',
          retryable: false,
          message:
            'The prediction may contain sensitive or restricted content and has been suppressed. Please revise your input.',
        },
      }),
  }
  const result = await getAdapter('sunra').poll?.(context, {
    providerJobId: 'pd_test',
    kind: 'image',
    model: dynamicImage('sunra'),
  })
  assert.equal(result?.status, 'failed')
  assert.equal(result?.failure?.code, 'unsafe_content')
  assert.equal(result?.failure?.reason, 'moderation_blocked')
  assert.equal(result?.failure?.retryable, false)
  assert.match(result?.error ?? '', /sensitive or restricted content/)
})
