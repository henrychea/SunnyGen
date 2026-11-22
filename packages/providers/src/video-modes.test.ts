import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import {
  VIDEO_MODELS,
  classifyVideoModes,
  videoModeKeys,
  videoModelFromModes,
  type VideoModeKey,
  type VideoModelDefinition,
} from '@sunnygen/core'
import { resetFalUploadCache } from './fal/client'
import { resetFalSchemaCache } from './fal/image'
import {
  documentedOperation,
  imageAsset,
  mockFal,
  mockSunra,
  openApiFixture,
  validateBody,
  type OpenApiFixture,
} from './fixtures'
import { SUNRA_VIDEO_SPECS } from './models'
import { falOpenApiUrl, parseFalOpenApi } from './fal/image'
import { getAdapter } from './registry'
import { parseOpenApi } from './schema'
import { resetSunraUploadCache } from './sunra/client'
import { resetSunraSchemaCache } from './sunra/schema'
import { falVideoOperations, videoOperationsFromOpenApi } from './video-modes'
import type { ProviderRequest } from './types'

function sunraAlias(fixture: OpenApiFixture): string {
  const path = Object.keys(fixture.paths)[0] ?? ''
  return path.split('/').filter(Boolean).slice(0, -1).join('/')
}

function sunraFixture(alias: string): OpenApiFixture {
  return openApiFixture('sunra', alias.replace('/', '__'))
}

function falFixture(endpoint: string): OpenApiFixture {
  return openApiFixture('fal-video', endpoint.replace(/\//g, '__'))
}

function allSunraFixtures(): OpenApiFixture[] {
  return EVENT_ALIASES.map((alias) => sunraFixture(alias))
}

const EVENT_ALIASES = [...new Set(Object.values(SUNRA_VIDEO_SPECS).map((spec) => spec.apiId))]

function modeAssets(capability: {
  fields: string[]
  fieldsMode: 'single' | 'array'
  maxImages: number
}): ReturnType<typeof imageAsset>[] {
  const count =
    capability.fieldsMode === 'array'
      ? Math.min(capability.maxImages, 3)
      : Math.min(capability.fields.length, 2)
  return Array.from({ length: count }, (_value, index) => imageAsset(index + 1))
}

function assertImages(
  body: Record<string, unknown>,
  capability: { fields: string[]; fieldsMode: 'single' | 'array'; maxImages: number },
  provider: 'sunra' | 'fal',
  count: number,
): void {
  const pattern = new RegExp(`^https://cdn\\.test/${provider}-\\d+\\.png$`)
  const urls = (values: unknown[]): string[] => {
    const list = values.map((value) => {
      assert.equal(typeof value, 'string')
      assert.match(value as string, pattern)
      return value as string
    })
    assert.equal(new Set(list).size, list.length, 'each slot needs its own upload')
    return list
  }
  if (capability.fieldsMode === 'array') {
    const field = capability.fields[0] as string
    const value = body[field]
    if (field === 'elements') {
      const elements = value as Array<{ frontal_image_url?: string }>
      const list = urls(elements.map((entry) => entry.frontal_image_url))
      assert.equal(list.length, count)
    } else {
      assert.ok(Array.isArray(value))
      const list = urls(value as unknown[])
      assert.equal(list.length, count)
    }
    return
  }
  assert.equal(capability.fields.length, count)
  urls(capability.fields.map((field) => body[field]))
}

function modeParams(
  model: VideoModelDefinition,
  mode: VideoModeKey,
): {
  videoMode: VideoModeKey
  durationSeconds: number
  aspectRatio: string
  resolution: string
  sound: boolean
} {
  const capability = model.videoModes[mode]
  return {
    videoMode: mode,
    durationSeconds: capability?.durations[0] ?? model.defaultDuration,
    aspectRatio: capability?.ratios[0] ?? model.defaultRatio,
    resolution: capability?.resolutions[0] ?? model.defaultResolution,
    sound: capability?.audio ?? model.sound,
  }
}

beforeEach(() => {
  resetSunraSchemaCache()
  resetFalSchemaCache()
  resetSunraUploadCache()
  resetFalUploadCache()
})

test('Sunra video modes match the endpoint documentation', async (t) => {
  for (const model of VIDEO_MODELS) {
    const spec = SUNRA_VIDEO_SPECS[model.id]
    if (!spec) continue
    const fixture = sunraFixture(spec.apiId)
    const parsed = parseOpenApi(fixture)
    assert.ok(parsed, `${model.id} fixture is not an OpenAPI document`)
    const modes = classifyVideoModes(videoOperationsFromOpenApi(parsed), {
      maxImages: spec.maxResources,
      durations: model.durations,
    })

    await t.test(model.id, () => {
      assert.deepEqual(modes, model.videoModes)
      assert.equal(sunraAlias(fixture), spec.apiId)
    })
  }
})

test('Sunra routes every video mode to its documented endpoint and fields', async (t) => {
  const fixtures = allSunraFixtures()

  for (const model of VIDEO_MODELS) {
    const spec = SUNRA_VIDEO_SPECS[model.id]
    if (!spec) continue
    for (const mode of videoModeKeys(model.videoModes)) {
      const capability = model.videoModes[mode]
      if (!capability) continue
      await t.test(`${model.id} ${mode}`, async () => {
        const mock = mockSunra(fixtures)
        const assets = modeAssets(capability)
        await getAdapter('sunra').submit(mock.context, {
          kind: 'video',
          model,
          prompt: 'a paper boat drifting downstream',
          params: modeParams(model, mode),
          assets,
        } satisfies ProviderRequest)

        const queue = mock.queueCalls()[0]
        assert.ok(queue, 'no Sunra queue call was made')
        assert.equal(new URL(queue.url).pathname, `/v1/queue/${capability.endpoint}`)
        const operation = documentedOperation(
          sunraFixture(spec.apiId),
          capability.endpoint.split('/').pop() ?? '',
        )
        assert.ok(operation, `${model.id} ${mode} has no documented operation`)
        assert.deepEqual(validateBody(queue.body, operation.schema), [], `${model.id} ${mode}`)
        assertImages(queue.body as Record<string, unknown>, capability, 'sunra', assets.length)
        if (mode === 'text') {
          assert.equal(
            queue.body && Object.keys(queue.body as object).some((key) => capability.fields.includes(key)),
            false,
          )
        }
      })
    }
  }
})

test('fal video modes match the endpoint documentation', async (t) => {
  const endpoints = [
    'fal-ai/veo3.1/fast',
    'fal-ai/veo3.1/fast/image-to-video',
    'fal-ai/veo3.1/fast/first-last-frame-to-video',
    'fal-ai/veo3.1/reference-to-video',
    'fal-ai/kling-video/v3/pro/text-to-video',
    'fal-ai/kling-video/v3/pro/image-to-video',
    'fal-ai/wan/v2.7/text-to-video',
    'minimax/h3-max/reference-to-video',
    'fal-ai/minimax/hailuo-2.3/standard/text-to-video',
    'fal-ai/minimax/hailuo-2.3/standard/image-to-video',
  ]

  for (const endpoint of endpoints) {
    const fixture = falFixture(endpoint)
    const schema = parseFalOpenApi(fixture)
    assert.ok(schema, `${endpoint} fixture is not an OpenAPI document`)
    const modes = classifyVideoModes(falVideoOperations(schema), { maxImages: 3, durations: [4, 6, 8] })
    assert.ok(videoModeKeys(modes).length > 0, `${endpoint} has no video mode`)

    for (const mode of videoModeKeys(modes)) {
      const capability = modes[mode]
      assert.ok(capability)
      await t.test(`${endpoint} ${mode}`, async () => {
        const model = videoModelFromModes({
          id: `fal:${endpoint}`,
          label: endpoint,
          providerLabel: 'fal.ai',
          providers: ['fal'],
          videoModes: modes,
          maxImages: 3,
          sourceId: endpoint,
          dynamic: true,
        })
        const mock = mockFal([fixture])
        const assets = modeAssets(capability)
        await getAdapter('fal').submit(mock.context, {
          kind: 'video',
          model,
          prompt: 'a paper boat drifting downstream',
          params: modeParams(model, mode),
          assets,
        } satisfies ProviderRequest)

        const queue = mock.queueCalls()[0]
        assert.ok(queue, 'no fal queue call was made')
        assert.equal(new URL(queue.url).pathname, `/${capability.endpoint}`)
        assert.equal(
          falOpenApiUrl(capability.endpoint).includes(encodeURIComponent(capability.endpoint)),
          true,
        )
        const operation = Object.values(fixture.paths).find((entry) => entry.post)
        const bodySchema = operation?.post?.requestBody?.content?.['application/json']?.schema
        assert.ok(bodySchema)
        assert.deepEqual(validateBody(queue.body, bodySchema), [], `${endpoint} ${mode}`)
        assertImages(queue.body as Record<string, unknown>, capability, 'fal', assets.length)
      })
    }
  }
})
