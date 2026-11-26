import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import {
  classifyVideoModes,
  videoModeKeys,
  videoModelFromModes,
  type ImageModelDefinition,
  type VideoModelDefinition,
} from '@sunnygen/core'
import { resetFalUploadCache } from './fal/client'
import { parseFalOpenApi, resetFalSchemaCache } from './fal/image'
import { imageAsset, mockFal, mockSunra, openApiFixture, validateBody } from './fixtures'
import { getAdapter } from './registry'
import { applySafetyFields } from './safety'
import { resetSunraUploadCache } from './sunra/client'
import { resetSunraSchemaCache } from './sunra/schema'
import type { ProviderRequest } from './types'
import { falVideoOperations } from './video-modes'

beforeEach(() => {
  resetFalSchemaCache()
  resetFalUploadCache()
  resetSunraSchemaCache()
  resetSunraUploadCache()
})

test('applySafetyFields writes the least restrictive value only in NSFW mode', () => {
  const properties = {
    prompt: { type: 'string' },
    enable_safety_checker: { type: 'boolean', default: true },
    safety_tolerance: { type: 'string', enum: ['1', '2', '3', '4', '5', '6'], default: '4' },
    resolution: { type: 'string', enum: ['720p', '1080p'] },
  }
  const safe: Record<string, unknown> = {}
  applySafetyFields(safe, properties, {}, false)
  assert.deepEqual(safe, {})

  const nsfw: Record<string, unknown> = {}
  applySafetyFields(nsfw, properties, {}, true)
  assert.deepEqual(nsfw, { enable_safety_checker: false, safety_tolerance: '6' })
})

function falVideoModel(endpoint: string): VideoModelDefinition {
  const name = endpoint.replace(/\//g, '__')
  const schema = parseFalOpenApi(openApiFixture('fal-video', name))
  assert.ok(schema, `${endpoint} fixture is not an OpenAPI document`)
  const modes = classifyVideoModes(falVideoOperations(schema), { maxImages: 3 })
  assert.ok(videoModeKeys(modes).length > 0, `${endpoint} has no video mode`)
  return videoModelFromModes({
    id: `fal:${endpoint}`,
    label: endpoint,
    providerLabel: 'fal.ai',
    providers: ['fal'],
    videoModes: modes,
    maxImages: 3,
    sourceId: endpoint,
    dynamic: true,
  })
}

function textSchema(name: string): Record<string, unknown> {
  const fixture = openApiFixture('fal-video', name)
  const operation = Object.values(fixture.paths).find((entry) => entry.post)
  const schema = operation?.post?.requestBody?.content?.['application/json']?.schema
  assert.ok(schema, `${name} has no request schema`)
  return schema
}

async function submitFalVideo(endpoint: string, nsfw: boolean): Promise<Record<string, unknown>> {
  const name = endpoint.replace(/\//g, '__')
  const model = falVideoModel(endpoint)
  const mode = videoModeKeys(model.videoModes)[0]
  const capability = mode ? model.videoModes[mode] : undefined
  const mock = mockFal([openApiFixture('fal-video', name)])
  await getAdapter('fal').submit(mock.context, {
    kind: 'video',
    model,
    prompt: 'a paper boat drifting downstream',
    params: {
      nsfw,
      videoMode: mode,
      durationSeconds: capability?.durations[0] ?? model.defaultDuration,
      resolution: capability?.resolutions[0] ?? model.defaultResolution,
      aspectRatio: capability?.ratios[0] ?? model.defaultRatio,
    },
    assets: [],
  } satisfies ProviderRequest)
  const queue = mock.queueCalls()[0]
  assert.ok(queue, 'no fal queue call was made')
  assert.equal(new URL(queue.url).pathname, `/${endpoint}`)
  return queue.body as Record<string, unknown>
}

test('fal video safety fields stay untouched in safe mode and go permissive in NSFW mode', async () => {
  const safe = await submitFalVideo('fal-ai/veo3.1/fast', false)
  assert.equal('safety_tolerance' in safe, false)
  assert.deepEqual(validateBody(safe, textSchema('fal-ai__veo3.1__fast')), [])

  const nsfw = await submitFalVideo('fal-ai/veo3.1/fast', true)
  assert.equal(nsfw.safety_tolerance, '6')
  assert.deepEqual(validateBody(nsfw, textSchema('fal-ai__veo3.1__fast')), [])

  const safeKling = await submitFalVideo('fal-ai/kling-video/v3/pro/text-to-video', false)
  assert.equal('enable_safety_checker' in safeKling, false)

  const nsfwKling = await submitFalVideo('fal-ai/kling-video/v3/pro/text-to-video', true)
  assert.equal(nsfwKling.enable_safety_checker, false)
  assert.deepEqual(validateBody(nsfwKling, textSchema('fal-ai__kling-video__v3__pro__text-to-video')), [])
})

function falImageModel(): ImageModelDefinition {
  return {
    id: 'fal:test/openai-image',
    kind: 'image',
    label: 'OpenAI Image',
    providerLabel: 'OpenAI',
    providers: ['fal'],
    ratios: ['1:1', '16:9'],
    supportsImages: true,
    maxImages: 4,
    supportsQuality: true,
    qualityOptions: ['1k'],
    defaultQuality: '1k',
    sourceId: 'openai/gpt-image-2',
    dynamic: true,
  }
}

test('fal image keeps today’s safety value in both modes', async () => {
  const fixture = openApiFixture('fal', 'openai__gpt-image-2')
  for (const nsfw of [false, true]) {
    const mock = mockFal([fixture])
    await getAdapter('fal').submit(mock.context, {
      kind: 'image',
      model: falImageModel(),
      prompt: 'a quiet lake at dawn',
      params: { nsfw, aspectRatio: '16:9', quality: '1k' },
      assets: [],
    } satisfies ProviderRequest)
    const queue = mock.queueCalls()[0]
    assert.ok(queue, 'no fal queue call was made')
    assert.equal((queue.body as Record<string, unknown>).enable_safety_checker, false)
  }
})

test('Sunra image keeps today’s safety value in both modes', async () => {
  const fixture = openApiFixture('sunra', 'bytedance__seedream-5.0-pro')
  const alias = Object.keys(fixture.paths)[0]?.split('/').filter(Boolean).slice(0, -1).join('/') ?? ''
  const model: ImageModelDefinition = {
    id: `sunra:${alias}`,
    kind: 'image',
    label: 'Seedream 5.0 Pro',
    providerLabel: 'ByteDance',
    providers: ['sunra'],
    ratios: ['1:1', '16:9'],
    supportsImages: true,
    maxImages: 10,
    supportsQuality: true,
    qualityOptions: ['1k', '2k'],
    defaultQuality: '2k',
    sourceId: alias,
    dynamic: true,
  }

  for (const nsfw of [false, true]) {
    const mock = mockSunra([fixture])
    await getAdapter('sunra').submit(mock.context, {
      kind: 'image',
      model,
      prompt: 'a quiet lake at dawn',
      params: { nsfw, aspectRatio: '16:9', quality: '2k' },
      assets: [imageAsset(1)],
    } satisfies ProviderRequest)
    const queue = mock.queueCalls()[0]
    assert.ok(queue, 'no Sunra queue call was made')
    assert.equal((queue.body as Record<string, unknown>).enable_safety_checker, false)
  }
})

test('Sunra video sends no safety field its schema does not document', async () => {
  const fixture = openApiFixture('sunra', 'google__veo3-1-lite')
  const model = videoModelFromModes({
    id: 'veo3_lite',
    label: 'Veo 3.1 Lite',
    providerLabel: 'Google',
    providers: ['sunra'],
    videoModes: {
      text: {
        endpoint: 'google/veo3-1-lite/text-to-video',
        videoField: null,
        fields: [],
        fieldsMode: 'single',
        maxImages: 0,
        durations: [4, 6, 8],
        resolutions: ['720p', '1080p'],
        ratios: ['16:9', '9:16'],
        audio: true,
      },
    },
    maxImages: 2,
    sourceId: 'google/veo3-1-lite',
    dynamic: true,
  })

  const mock = mockSunra([fixture])
  await getAdapter('sunra').submit(mock.context, {
    kind: 'video',
    model,
    prompt: 'a paper boat drifting downstream',
    params: { nsfw: true, videoMode: 'text', durationSeconds: 4, resolution: '720p', aspectRatio: '16:9' },
    assets: [],
  } satisfies ProviderRequest)

  const queue = mock.queueCalls()[0]
  assert.ok(queue, 'no Sunra queue call was made')
  const text = Object.entries(queue.body as Record<string, unknown>)
  assert.deepEqual(
    text.filter(([key]) => /safety|moderat|censor/i.test(key)),
    [],
  )
})
