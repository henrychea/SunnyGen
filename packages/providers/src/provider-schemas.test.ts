import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import {
  LORA_TRAINER_MODEL,
  getModel,
  type ImageModelDefinition,
  type VideoModelDefinition,
} from '@sunnygen/core'
import { azureImageEndpoint, azureImagePayload } from './azure'
import { codexCommand } from './codex'
import { resetFalSchemaCache } from './fal/image'
import {
  documentedOperation,
  documentedOperations,
  fixtureNames,
  imageAsset,
  loadFixture,
  mockFal,
  mockSunra,
  openApiFixture,
  uploadedUrls,
  validateAzureFields,
  validateBody,
  validateCodexCommand,
  type AzureFixture,
  type CodexFixture,
  type JsonSchema,
  type OpenApiFixture,
} from './fixtures'
import { SUNRA_IMAGE_SPECS, SUNRA_VIDEO_SPECS } from './models'
import { getAdapter } from './registry'
import { resetSunraSchemaCache } from './sunra/schema'
import type { ProviderRequest } from './types'

const EDIT_ORDER = ['image-editing', 'image-to-image', 'reference-images-to-image']

function aliasOf(fixture: OpenApiFixture): string {
  const path = Object.keys(fixture.paths)[0] ?? ''
  return path.split('/').filter(Boolean).slice(0, -1).join('/')
}

function sunraFixtures(): Array<{ name: string; fixture: OpenApiFixture }> {
  return fixtureNames('sunra').map((name) => ({ name, fixture: openApiFixture('sunra', name) }))
}

function falFixtures(): Array<{ name: string; fixture: OpenApiFixture }> {
  return fixtureNames('fal').map((name) => ({ name, fixture: openApiFixture('fal', name) }))
}

function schemaEnum(schema: JsonSchema, key: string): string[] {
  const property = schema.properties as Record<string, JsonSchema> | undefined
  const value = property?.[key]
  const list = value?.enum
  return Array.isArray(list) ? list.filter((entry): entry is string => typeof entry === 'string') : []
}

function aspectFor(schema: JsonSchema): string {
  const allowed = schemaEnum(schema, 'aspect_ratio')
  if (allowed.includes('16:9')) return '16:9'
  const first = allowed.find((value) => value !== 'auto')
  return first ?? '1:1'
}

function maxImageItems(schema: JsonSchema, field: string): number | null {
  const property = schema.properties as Record<string, JsonSchema> | undefined
  const value = property?.[field]
  return typeof value?.maxItems === 'number' ? value.maxItems : null
}

function imageFieldOf(schema: JsonSchema): string | null {
  const properties = (schema.properties ?? {}) as Record<string, JsonSchema>
  return (
    ['image_urls', 'images', 'image_url', 'image', 'reference_images', 'reference_image_urls' as const].find(
      (name) => name in properties,
    ) ?? null
  )
}

function isArrayField(schema: JsonSchema, field: string): boolean {
  const properties = (schema.properties ?? {}) as Record<string, JsonSchema>
  return properties[field]?.type === 'array'
}

function dynamicImage(
  provider: 'sunra' | 'fal',
  id: string,
  sourceId: string,
  maxImages: number,
): ImageModelDefinition {
  return {
    id,
    kind: 'image',
    label: id,
    providerLabel: 'Test',
    providers: [provider],
    ratios: ['1:1', '16:9', '4:3'],
    supportsImages: maxImages > 0,
    maxImages: Math.max(1, maxImages),
    supportsQuality: true,
    qualityOptions: ['1k', '2k', '4k'],
    defaultQuality: '1k',
    sourceId,
    dynamic: true,
  }
}

function staticSpecFor(alias: string): { id: string; spec: (typeof SUNRA_IMAGE_SPECS)[string] } | null {
  for (const [id, spec] of Object.entries(SUNRA_IMAGE_SPECS)) {
    if (spec.apiId === alias) return { id, spec }
  }
  return null
}

function assertNoProblems(problems: string[], label: string): void {
  assert.deepEqual(problems, [], `${label}:\n${problems.join('\n')}`)
}

beforeEach(() => {
  resetSunraSchemaCache()
  resetFalSchemaCache()
})

test('Sunra image requests follow each model OpenAPI document', async (t) => {
  const fixtures = sunraFixtures()
  for (const { name, fixture } of fixtures) {
    const alias = aliasOf(fixture)
    const text = documentedOperation(fixture, 'text-to-image')
    const editName = EDIT_ORDER.find((operation) => documentedOperation(fixture, operation))
    const edit = editName ? documentedOperation(fixture, editName) : undefined
    if (!text && !edit) continue

    await t.test(`${alias} (${name})`, async () => {
      const spec = staticSpecFor(alias)
      const model = spec
        ? (getModel(spec.id) as ImageModelDefinition)
        : dynamicImage(
            'sunra',
            `sunra:${alias}`,
            alias,
            edit ? (maxImageItems(edit.schema, imageFieldOf(edit.schema) ?? '') ?? 4) : 1,
          )

      if (text) {
        const mock = mockSunra(fixtures.map((entry) => entry.fixture))
        await getAdapter('sunra').submit(mock.context, {
          kind: 'image',
          model,
          prompt: 'a quiet lake at dawn',
          params: {
            aspectRatio: aspectFor(text.schema),
            quality: model.qualityOptions.includes('2k') ? '2k' : '1k',
          },
          assets: [],
        } satisfies ProviderRequest)
        const queue = mock.queueCalls()[0]
        assert.ok(queue, 'no queue call was made')
        assert.equal(new URL(queue.url).pathname, `/v1/queue${text.path}`)
        assertNoProblems(validateBody(queue.body, text.schema), `${alias} text-to-image`)
      } else {
        const mock = mockSunra(fixtures.map((entry) => entry.fixture))
        await assert.rejects(
          getAdapter('sunra').submit(mock.context, {
            kind: 'image',
            model,
            prompt: 'a quiet lake at dawn',
            params: {},
            assets: [],
          }),
          /reference image|edit endpoint/i,
        )
        assert.equal(mock.queueCalls().length, 0)
      }

      if (!edit) {
        const mock = mockSunra(fixtures.map((entry) => entry.fixture))
        await assert.rejects(
          getAdapter('sunra').submit(mock.context, {
            kind: 'image',
            model,
            prompt: 'add a boat',
            params: {},
            assets: [imageAsset(1)],
          }),
          /edit endpoint|does not accept reference images|can't edit images/i,
        )
        assert.equal(mock.queueCalls().length, 0)
        return
      }

      const field = imageFieldOf(edit.schema)
      assert.ok(field, `${alias} edit schema has no image field`)
      const limit = maxImageItems(edit.schema, field) ?? 4
      const count = Math.min(limit + 2, 6)
      const mock = mockSunra(fixtures.map((entry) => entry.fixture))
      await getAdapter('sunra').submit(mock.context, {
        kind: 'image',
        model,
        prompt: 'add a small wooden boat',
        params: { aspectRatio: aspectFor(edit.schema), quality: '2k' },
        assets: Array.from({ length: count }, (_value, index) => imageAsset(index + 1)),
      } satisfies ProviderRequest)
      const queue = mock.queueCalls()[0]
      assert.ok(queue, 'no queue call was made for the edit request')
      const path = new URL(queue.url).pathname
      assert.equal(path, `/v1/queue${edit.path}`, `${alias} should use the documented ${edit.name} endpoint`)
      assertNoProblems(validateBody(queue.body, edit.schema), `${alias} ${edit.name}`)

      const body = queue.body as Record<string, unknown>
      assert.ok(field in body, `${alias} ${edit.name} is missing ${field}`)
      const value = body[field]
      if (isArrayField(edit.schema, field)) {
        assert.ok(Array.isArray(value), `${field} must be an array`)
        const items = value as string[]
        assert.ok(items.length <= limit, `${field} sent ${items.length} items, documented max is ${limit}`)
        assert.ok(items.length <= model.maxImages)
        assert.deepEqual(items, uploadedUrls(queue))
      } else {
        assert.equal(typeof value, 'string')
      }
      const editProperties = (edit.schema.properties ?? {}) as Record<string, unknown>
      if (!('aspect_ratio' in editProperties)) {
        assert.equal('aspect_ratio' in body, false, `${alias} must not send aspect_ratio on ${edit.name}`)
      }
    })
  }
})

test('flux-3-image edits send image_urls to image-editing', async () => {
  const fixtures = sunraFixtures()
  const fixture = openApiFixture('sunra', 'black-forest-labs__flux-3-image')
  const model = dynamicImage(
    'sunra',
    'sunra:black-forest-labs/flux-3-image',
    'black-forest-labs/flux-3-image',
    10,
  )
  const mock = mockSunra(fixtures.map((entry) => entry.fixture))
  await getAdapter('sunra').submit(mock.context, {
    kind: 'image',
    model,
    prompt: 'put the kettle on the table',
    params: { aspectRatio: '16:9', quality: '2k' },
    assets: [imageAsset(1), imageAsset(2)],
  })
  const queue = mock.queueCalls()[0]
  assert.equal(
    new URL(queue?.url as string).pathname,
    '/v1/queue/black-forest-labs/flux-3-image/image-editing',
  )
  const body = queue?.body as Record<string, unknown>
  assert.deepEqual(body.image_urls, ['https://cdn.test/sunra-1.png', 'https://cdn.test/sunra-2.png'])
  assert.equal('images' in body, false)
  assertNoProblems(
    validateBody(body, documentedOperation(fixture, 'image-editing')?.schema ?? {}),
    'flux-3-image image-editing',
  )
})

test('grok-imagine-image-2.0 edits send at most three images and no aspect_ratio', async () => {
  const fixtures = sunraFixtures()
  const fixture = openApiFixture('sunra', 'xai__grok-imagine-image-2.0')
  const editSchema = documentedOperation(fixture, 'image-editing')?.schema ?? {}
  const model = dynamicImage('sunra', 'sunra:xai/grok-imagine-image-2.0', 'xai/grok-imagine-image-2.0', 3)
  const mock = mockSunra(fixtures.map((entry) => entry.fixture))
  await getAdapter('sunra').submit(mock.context, {
    kind: 'image',
    model,
    prompt: 'make it snow',
    params: { aspectRatio: '16:9', quality: '2k' },
    assets: Array.from({ length: 5 }, (_value, index) => imageAsset(index + 1)),
  })
  const queue = mock.queueCalls()[0]
  const body = queue?.body as Record<string, unknown>
  const images = body.images as string[]
  assert.equal(new URL(queue?.url as string).pathname, '/v1/queue/xai/grok-imagine-image-2.0/image-editing')
  assert.equal(images.length, 3)
  assert.equal('aspect_ratio' in body, false)
  assert.ok(schemaEnum(editSchema, 'resolution').includes(String(body.resolution)))
  assert.ok(schemaEnum(editSchema, 'quality').includes(String(body.quality)))
  assertNoProblems(validateBody(body, editSchema), 'grok-imagine-image-2.0 image-editing')
})

test('flux-2-pro edits use image-to-image', async () => {
  const fixtures = sunraFixtures()
  const fixture = openApiFixture('sunra', 'black-forest-labs__flux-2-pro')
  const model = dynamicImage('sunra', 'sunra:black-forest-labs/flux-2-pro', 'black-forest-labs/flux-2-pro', 8)
  const mock = mockSunra(fixtures.map((entry) => entry.fixture))
  await getAdapter('sunra').submit(mock.context, {
    kind: 'image',
    model,
    prompt: 'warmer light',
    params: { aspectRatio: '4:3', quality: '1k' },
    assets: [imageAsset(1)],
  })
  const queue = mock.queueCalls()[0]
  assert.equal(
    new URL(queue?.url as string).pathname,
    '/v1/queue/black-forest-labs/flux-2-pro/image-to-image',
  )
  assertNoProblems(
    validateBody(queue?.body, documentedOperation(fixture, 'image-to-image')?.schema ?? {}),
    'flux-2-pro image-to-image',
  )
})

test('Sunra falls back to the static spec when the schema cannot be fetched', async () => {
  const model = getModel('nano-banana-2') as ImageModelDefinition
  const mock = mockSunra([])
  await getAdapter('sunra').submit(mock.context, {
    kind: 'image',
    model,
    prompt: 'hello',
    params: { aspectRatio: '1:1', quality: '1k' },
    assets: [imageAsset(1)],
  })
  const queue = mock.queueCalls()[0]
  assert.equal(
    new URL(queue?.url as string).pathname,
    '/v1/queue/google/gemini-3.1-flash-image/image-editing',
  )
  const body = queue?.body as Record<string, unknown>
  assert.deepEqual(Object.keys(body).sort(), [
    'aspect_ratio',
    'images',
    'output_format',
    'prompt',
    'resolution',
  ])
  assert.deepEqual(body.images, ['https://cdn.test/sunra-1.png'])
  assert.equal(body.resolution, '1K')
})

test('Sunra video requests follow each model OpenAPI document', async (t) => {
  const fixtures = sunraFixtures()
  const all = fixtures.map((entry) => entry.fixture)
  for (const [id, spec] of Object.entries(SUNRA_VIDEO_SPECS)) {
    const fixture = fixtures.find((entry) => aliasOf(entry.fixture) === spec.apiId)?.fixture
    if (!fixture) continue
    const model = getModel(id) as VideoModelDefinition

    await t.test(`${id} text-to-video`, async () => {
      const operation = documentedOperation(fixture, 'text-to-video')
      if (!operation) return
      const mock = mockSunra(all)
      await getAdapter('sunra').submit(mock.context, {
        kind: 'video',
        model,
        prompt: 'a kite over a field',
        params: {
          durationSeconds: model.defaultDuration,
          aspectRatio: model.defaultRatio,
          resolution: model.defaultResolution,
          sound: true,
        },
        assets: [],
      })
      const queue = mock.queueCalls()[0]
      assert.ok(queue, 'no queue call was made')
      assert.equal(new URL(queue.url).pathname, `/v1/queue${operation.path}`)
      assertNoProblems(validateBody(queue.body, operation.schema), `${id} text-to-video`)
    })

    await t.test(`${id} image-to-video`, async () => {
      const operation = documentedOperation(fixture, 'image-to-video')
      if (!operation) return
      const mock = mockSunra(all)
      await getAdapter('sunra').submit(mock.context, {
        kind: 'video',
        model,
        prompt: 'the kite lifts off',
        params: {
          durationSeconds: model.defaultDuration,
          aspectRatio: model.defaultRatio,
          resolution: model.defaultResolution,
          sound: true,
        },
        assets: [imageAsset(1)],
      })
      const queue = mock.queueCalls()[0]
      assert.ok(queue, 'no queue call was made')
      assert.equal(new URL(queue.url).pathname, `/v1/queue${operation.path}`)
      assertNoProblems(validateBody(queue.body, operation.schema), `${id} image-to-video`)
    })
  }
})

test('Veo and Grok reference images use reference-to-video', async (t) => {
  const fixtures = sunraFixtures()
  const all = fixtures.map((entry) => entry.fixture)

  for (const [id, operation] of [
    ['veo3', 'google/veo3-1'],
    ['grok-imagine', 'xai/grok-imagine-video'],
  ] as const) {
    await t.test(id, async () => {
      const fixture = openApiFixture('sunra', operation.replace('/', '__'))
      const reference = documentedOperation(fixture, 'reference-to-video')
      assert.ok(reference, `${operation} has no reference-to-video endpoint`)
      const model = getModel(id) as VideoModelDefinition
      const mock = mockSunra(all)
      await getAdapter('sunra').submit(mock.context, {
        kind: 'video',
        model,
        prompt: 'the same character walking',
        params: {
          durationSeconds: model.defaultDuration,
          aspectRatio: model.defaultRatio,
          resolution: model.defaultResolution,
          sound: true,
        },
        assets: [imageAsset(1), imageAsset(2), imageAsset(3)],
      })
      const queue = mock.queueCalls()[0]
      assert.equal(new URL(queue?.url as string).pathname, `/v1/queue${reference?.path}`)
      assertNoProblems(validateBody(queue?.body, reference?.schema ?? {}), `${id} reference-to-video`)
    })
  }
})

test('Kling references ride on image-to-video elements', async () => {
  const fixtures = sunraFixtures()
  const fixture = openApiFixture('sunra', 'kling__kling-v3-pro')
  const model = getModel('kling-3.0') as VideoModelDefinition
  const mock = mockSunra(fixtures.map((entry) => entry.fixture))
  await getAdapter('sunra').submit(mock.context, {
    kind: 'video',
    model,
    prompt: 'a fox walking through snow',
    params: { mode: 'pro', durationSeconds: 5, aspectRatio: '16:9', sound: true },
    assets: [imageAsset(1), imageAsset(2), imageAsset(3)],
  })
  const queue = mock.queueCalls()[0]
  assert.equal(new URL(queue?.url as string).pathname, '/v1/queue/kling/kling-v3-pro/image-to-video')
  assertNoProblems(
    validateBody(queue?.body, documentedOperation(fixture, 'image-to-video')?.schema ?? {}),
    'kling image-to-video',
  )
})

test('fal image requests follow the endpoint OpenAPI document', async (t) => {
  const fixtures = falFixtures()
  const all = fixtures.map((entry) => entry.fixture)

  for (const { fixture } of fixtures) {
    const operations = documentedOperations(fixture)
    const endpoint = (operations[0]?.path ?? '').replace(/^\//, '')
    if (!endpoint) continue
    const operation = operations[0] as (typeof operations)[number]
    const skipTraining = endpoint.includes('lora-fast-training')

    await t.test(`${endpoint} request body`, async () => {
      const field = imageFieldOf(operation.schema)
      const limit = field ? (maxImageItems(operation.schema, field) ?? 4) : 0
      const model = dynamicImage('fal', `fal:${endpoint}`, endpoint, limit > 0 ? limit : 1)
      const mock = mockFal(all)
      const hasPrompt = 'prompt' in ((operation.schema.properties ?? {}) as Record<string, unknown>)
      if (skipTraining) return
      await getAdapter('fal').submit(mock.context, {
        kind: 'image',
        model,
        prompt: 'a lighthouse in fog',
        params: { aspectRatio: aspectFor(operation.schema), quality: '2k' },
        assets: field
          ? Array.from({ length: Math.min(limit + 1, 4) }, (_v, index) => imageAsset(index + 1))
          : [],
      })
      const queue = mock.queueCalls()[0]
      assert.ok(queue, 'no fal queue call was made')
      assert.equal(new URL(queue.url).pathname, operation.path)
      assertNoProblems(validateBody(queue.body, operation.schema), `${endpoint}`)
      const body = queue.body as Record<string, unknown>
      if (!hasPrompt) assert.equal('prompt' in body, false)
      if (field) {
        assert.ok(field in body)
        if (isArrayField(operation.schema, field)) {
          assert.ok((body[field] as string[]).length <= (limit || Infinity))
        }
      }
    })
  }
})

test('fal static specs route edits to the documented edit endpoint', async () => {
  const fixtures = falFixtures()
  const all = fixtures.map((entry) => entry.fixture)
  const model = getModel('gpt-image-2') as ImageModelDefinition
  const mock = mockFal(all)
  await getAdapter('fal').submit(mock.context, {
    kind: 'image',
    model,
    prompt: 'add a hat',
    params: { aspectRatio: '1:1', quality: '1k' },
    assets: [imageAsset(1)],
  })
  const queue = mock.queueCalls()[0]
  assert.equal(new URL(queue?.url as string).pathname, '/openai/gpt-image-2/edit')
  const edit = openApiFixture('fal', 'openai__gpt-image-2__edit')
  assertNoProblems(
    validateBody(queue?.body, documentedOperation(edit, 'gpt-image-2__edit')?.schema ?? {}),
    'fal gpt-image-2 edit',
  )
})

test('fal LoRA training body matches the trainer schema', async () => {
  const fixtures = falFixtures()
  const fixture = openApiFixture('fal', 'fal-ai__flux-lora-fast-training')
  const mock = mockFal(fixtures.map((entry) => entry.fixture))
  await getAdapter('fal').submit(mock.context, {
    kind: 'lora',
    model: LORA_TRAINER_MODEL,
    prompt: 'aria',
    params: { steps: 500, triggerWord: 'aria' },
    assets: [imageAsset(1), imageAsset(2)],
  })
  const queue = mock.queueCalls()[0]
  const operations = documentedOperations(fixture)
  assert.equal(new URL(queue?.url as string).pathname, operations[0]?.path)
  assertNoProblems(validateBody(queue?.body, operations[0]?.schema ?? {}), 'fal lora trainer')
})

test('Azure image requests match the documented generate and edit schemas', () => {
  const fixture = loadFixture('azure/gpt-image-2.json') as AzureFixture
  const model = getModel('gpt-image-2') as ImageModelDefinition

  for (const aspectRatio of ['1:1', '16:9', '9:16', '3:2', '21:9']) {
    for (const quality of ['1k', '2k', '4k']) {
      const generate = azureImagePayload({
        kind: 'image',
        model,
        prompt: 'a paper boat',
        params: { aspectRatio, quality },
        assets: [],
      })
      assert.equal(
        azureImageEndpoint('https://azure.test', 'gpt-image-2', generate.mode),
        `https://azure.test${fixture.endpoints.generate.path.replace('{deployment}', 'gpt-image-2')}?api-version=${fixture.apiVersion}`,
      )
      assertNoProblems(
        validateAzureFields(generate.fields, fixture.endpoints.generate.fields),
        `azure generate ${aspectRatio} ${quality}`,
      )
    }
  }

  const edit = azureImagePayload({
    kind: 'image',
    model,
    prompt: 'add a sail',
    params: { aspectRatio: '16:9', quality: '2k' },
    assets: Array.from({ length: 20 }, (_value, index) => imageAsset(index + 1, 'image/png')),
  })
  assert.equal(edit.mode, 'edit')
  assert.equal(
    azureImageEndpoint('https://azure.test', 'gpt-image-2', edit.mode),
    `https://azure.test${fixture.endpoints.edit.path.replace('{deployment}', 'gpt-image-2')}?api-version=${fixture.apiVersion}`,
  )
  assertNoProblems(validateAzureFields(edit.fields, fixture.endpoints.edit.fields), 'azure edit fields')
  const files = (edit.form as FormData).getAll('image[]')
  assert.equal(files.length, fixture.endpoints.edit.files?.['image[]']?.maxFiles)
})

test('Codex commands match the documented CLI', () => {
  const fixture = loadFixture('codex/gpt-image-2.json') as CodexFixture
  const generate = codexCommand({
    prompt: 'a paper boat',
    size: '1536x864',
    inputPaths: [],
    outputPath: '/tmp/out.png',
  })
  assert.equal(generate.mode, 'generate')
  assertNoProblems(validateCodexCommand(generate.args, fixture), 'codex generate')

  const edit = codexCommand({
    prompt: 'add a sail',
    size: 'auto',
    inputPaths: Array.from({ length: 8 }, (_value, index) => `/tmp/in-${index}.png`),
    outputPath: '/tmp/out.png',
  })
  assert.equal(edit.mode, 'edit')
  assert.equal(edit.images, fixture.commands.edit.maxImages)
  assertNoProblems(validateCodexCommand(edit.args, fixture), 'codex edit')
})
