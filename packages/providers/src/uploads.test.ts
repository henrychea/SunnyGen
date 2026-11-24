import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { test } from 'node:test'
import { getModel, type ImageModelDefinition } from '@sunnygen/core'
import sharp from 'sharp'
import { resetFalUploadCache, uploadFalAsset } from './fal/client'
import { normalizeAsset } from './normalize'
import { getAdapter } from './registry'
import { resetSunraUploadCache, uploadSunraAsset } from './sunra/client'
import { SUNRA_IMAGE_LIMITS } from './sunra/limits'
import type { AdapterContext, ProviderAsset, ProviderUpload, ProviderUploadCache } from './types'
import { assetSha256 } from './uploads'

const asset: ProviderAsset = {
  buffer: Buffer.from('character-sheet'),
  mime: 'image/png',
  fileName: 'sheet.png',
}

function memoryUploads(): ProviderUploadCache & { entries: Map<string, ProviderUpload> } {
  const entries = new Map<string, ProviderUpload>()
  const id = (provider: string, sha256: string) => `${provider}:${sha256}`
  return {
    entries,
    get: (provider, sha256) => entries.get(id(provider, sha256)) ?? null,
    save: (provider, sha256, url, expiresAt) => {
      entries.set(id(provider, sha256), { url, expiresAt })
    },
    remove: (provider, sha256) => {
      entries.delete(id(provider, sha256))
    },
  }
}

function mockFal(uploads: ProviderUploadCache): {
  context: AdapterContext
  calls: string[]
  initiated: Array<{ content_type: string; file_name: string }>
} {
  const calls: string[] = []
  const initiated: Array<{ content_type: string; file_name: string }> = []
  const context: AdapterContext = {
    apiKey: 'test',
    baseUrl: null,
    deployment: null,
    uploads,
    fetch: async (input, init) => {
      const url = String(input)
      calls.push(`${init?.method ?? 'GET'} ${url}`)
      if (url.includes('/storage/upload/initiate')) {
        initiated.push(JSON.parse(String(init?.body)))
        return Response.json({
          upload_url: 'https://upload.test/put',
          file_url: 'https://cdn.test/sheet.png',
        })
      }
      if (init?.method === 'PUT') return new Response('ok')
      return new Response('unexpected', { status: 500 })
    },
  }
  return { context, calls, initiated }
}

function uploadsIn(calls: string[]): number {
  return calls.filter((call) => call.includes('/storage/upload/initiate')).length
}

test('a persisted fal upload URL is reused after a restart without uploading again', async () => {
  const uploads = memoryUploads()
  const first = mockFal(uploads)
  const url = await uploadFalAsset(first.context, asset)
  assert.equal(url, 'https://cdn.test/sheet.png')
  assert.equal(uploadsIn(first.calls), 1)

  resetFalUploadCache()
  const restarted = mockFal(uploads)
  assert.equal(await uploadFalAsset(restarted.context, asset), url)
  assert.deepEqual(restarted.calls, [])
})

test('fal upload URLs are stored with an expiry under the documented CDN lifetime', async () => {
  const uploads = memoryUploads()
  await uploadFalAsset(mockFal(uploads).context, asset)
  const stored = uploads.get('fal', assetSha256(asset))
  assert.equal(stored?.url, 'https://cdn.test/sheet.png')
  assert.ok((stored?.expiresAt ?? 0) > Date.now())
  assert.ok((stored?.expiresAt ?? 0) <= Date.now() + 7 * 24 * 60 * 60_000)
})

test('an expired stored URL uploads the bytes again', async () => {
  const uploads = memoryUploads()
  uploads.save('fal', assetSha256(asset), 'https://cdn.test/expired.png', Date.now() - 1)
  resetFalUploadCache()
  const mock = mockFal(uploads)
  assert.equal(await uploadFalAsset(mock.context, asset), 'https://cdn.test/sheet.png')
  assert.equal(uploadsIn(mock.calls), 1)
  assert.equal(uploads.get('fal', assetSha256(asset))?.url, 'https://cdn.test/sheet.png')
})

test('concurrent identical uploads share one request', async () => {
  const uploads = memoryUploads()
  resetFalUploadCache()
  const mock = mockFal(uploads)
  const [left, right] = await Promise.all([
    uploadFalAsset(mock.context, asset),
    uploadFalAsset(mock.context, { ...asset }),
  ])
  assert.equal(left, right)
  assert.equal(uploadsIn(mock.calls), 1)
})

test('a large reference is uploaded normalized and reused by its normalized hash', async () => {
  const uploads = memoryUploads()
  resetFalUploadCache()
  const buffer = await sharp(randomBytes(5000 * 800 * 3), {
    raw: { width: 5000, height: 800, channels: 3 },
  })
    .png()
    .toBuffer()
  const source: ProviderAsset = { buffer, mime: 'image/png', fileName: 'sheet.png' }

  const mock = mockFal(uploads)
  const url = await uploadFalAsset(mock.context, source)
  assert.equal(uploadsIn(mock.calls), 1)
  assert.deepEqual(mock.initiated[0], { content_type: 'image/jpeg', file_name: 'sheet.jpg' })
  assert.ok(uploads.get('fal', assetSha256(await normalizeAsset(source))))
  assert.equal(uploads.get('fal', assetSha256(source)), null)

  resetFalUploadCache()
  const restarted = mockFal(uploads)
  assert.equal(await uploadFalAsset(restarted.context, source), url)
  assert.deepEqual(restarted.calls, [])
})

test('Sunra uploads are reused forever because asset URLs do not expire', async () => {
  const uploads = memoryUploads()
  const context = (): AdapterContext => ({
    apiKey: 'test',
    baseUrl: null,
    deployment: null,
    uploads,
    fetch: async (input, init) => {
      if (String(input).includes('/storage/upload/initiate')) {
        return Response.json({ upload_url: 'https://upload.test/put', file_url: 'https://assets.test/1.png' })
      }
      if (init?.method === 'PUT') return new Response('ok')
      return new Response('unexpected', { status: 500 })
    },
  })
  await uploadSunraAsset(context(), asset)
  assert.deepEqual(uploads.get('sunra', assetSha256(asset)), {
    url: 'https://assets.test/1.png',
    expiresAt: null,
  })

  resetSunraUploadCache()
  let requests = 0
  const restarted: AdapterContext = {
    ...context(),
    fetch: async () => {
      requests += 1
      return new Response('unexpected', { status: 500 })
    },
  }
  assert.equal(await uploadSunraAsset(restarted, asset), 'https://assets.test/1.png')
  assert.equal(requests, 0)
})

test('a rejected submission drops the stored upload URL', async () => {
  const uploads = memoryUploads()
  const model = getModel('seedream-5-pro') as ImageModelDefinition
  const context: AdapterContext = {
    apiKey: 'test',
    baseUrl: null,
    deployment: null,
    uploads,
    fetch: async (input, init) => {
      const url = String(input)
      if (url.includes('/storage/upload/initiate')) {
        return Response.json({ upload_url: 'https://upload.test/put', file_url: 'https://assets.test/1.png' })
      }
      if (init?.method === 'PUT') return new Response('ok')
      if (url.endsWith('/models?limit=300')) return new Response('unavailable', { status: 503 })
      return Response.json({ error: { message: 'image_url is not reachable' } }, { status: 422 })
    },
  }

  await assert.rejects(
    getAdapter('sunra').submit(context, {
      kind: 'image',
      model,
      prompt: 'swap the face',
      params: { aspectRatio: '1:1', quality: '1k' },
      assets: [asset],
    }),
    /image_url is not reachable/,
  )
  assert.equal(uploads.get('sunra', assetSha256(asset)), null)
})

test('a stored 4096 board over the limit reaches Sunra as a smaller copy, stored bytes untouched', async () => {
  // A 4096 x 4096 photo board is around 18 MB in production; noise of the same size is far over
  // the limit and makes the point harder.
  const board: ProviderAsset = {
    buffer: await sharp(randomBytes(4096 * 4096 * 3), { raw: { width: 4096, height: 4096, channels: 3 } })
      .png()
      .toBuffer(),
    mime: 'image/png',
    fileName: 'face-board.png',
  }
  const original = Buffer.from(board.buffer)
  assert.ok(board.buffer.byteLength > SUNRA_IMAGE_LIMITS.bytes)

  let putBody: Uint8Array | null = null
  let putType: string | null = null
  const context: AdapterContext = {
    apiKey: 'test',
    baseUrl: null,
    deployment: null,
    uploads: null,
    fetch: async (input, init) => {
      const url = String(input)
      if (url.includes('/storage/upload/initiate')) {
        return Response.json({
          upload_url: 'https://upload.test/put',
          file_url: 'https://assets.test/board.jpg',
        })
      }
      if (init?.method === 'PUT') {
        putBody = init.body as Uint8Array
        putType = (init.headers as Record<string, string>)['Content-Type'] ?? null
        return new Response('ok')
      }
      return new Response('unexpected', { status: 500 })
    },
  }

  const fileUrl = await uploadSunraAsset(context, board)

  assert.equal(fileUrl, 'https://assets.test/board.jpg')
  assert.ok(putBody)
  const uploaded = putBody as Uint8Array
  assert.ok(uploaded.byteLength <= SUNRA_IMAGE_LIMITS.bytes)
  assert.equal(putType, 'image/jpeg')
  // The stored asset itself is untouched: same bytes, same length.
  assert.equal(board.buffer.byteLength, original.byteLength)
  assert.ok(board.buffer.equals(original))
})
