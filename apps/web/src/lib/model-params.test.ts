import assert from 'node:assert/strict'
import test from 'node:test'
import { getModel, type ModelDefinition } from '@sunnygen/core'
import {
  MAX_IMAGE_RESULTS,
  defaultAspectRatio,
  defaultQuality,
  describeEditReferenceTrim,
  describeReferenceTrim,
  reconcileParams,
  type ComposerParams,
} from './model-params'

function model(id: string): ModelDefinition {
  const definition = getModel(id)
  assert.ok(definition, `missing model ${id}`)
  return definition
}

function params(overrides: Partial<ComposerParams> = {}): ComposerParams {
  return {
    aspectRatio: '1:1',
    quality: '1k',
    duration: 8,
    resolution: '720p',
    count: 1,
    ...overrides,
  }
}

test('keeps aspect ratio, quality and count when the next model supports them', () => {
  const result = reconcileParams(
    params({ aspectRatio: '21:9', quality: '2k', count: 3 }),
    model('nano-banana-pro'),
  )
  assert.deepEqual(result.changes, [])
  assert.deepEqual(result.params, params({ aspectRatio: '21:9', quality: '2k', count: 3 }))
})

test('makes no changes when switching between compatible models', () => {
  for (const [from, to] of [
    ['nano-banana-2', 'nano-banana-pro'],
    ['seedream-5-lite', 'seedream-5-pro'],
    ['gpt-image-2', 'nano-banana-2'],
  ] as const) {
    const current = params({ aspectRatio: '16:9', quality: '2k', count: 2 })
    const next = model(to)
    assert.equal(from.length > 0, true)
    assert.deepEqual(reconcileParams(current, next).changes, [], `${from} → ${to}`)
  }
})

test('falls back to a landscape ratio when the next model lacks 21:9', () => {
  const result = reconcileParams(params({ aspectRatio: '21:9' }), model('grok-imagine-image'))
  assert.equal(result.params.aspectRatio, '2:1')
  assert.deepEqual(
    result.changes.map((change) => change.field),
    ['aspectRatio'],
  )
  assert.equal(result.changes[0]?.message, '21:9 is not available on Grok Imagine Image. Switched to 2:1.')
})

test('falls back inside the same orientation for portrait ratios', () => {
  const result = reconcileParams(params({ aspectRatio: '9:21' }), model('grok-imagine-image'))
  assert.equal(result.params.aspectRatio, '1:2')
  assert.equal(result.changes[0]?.message, '9:21 is not available on Grok Imagine Image. Switched to 1:2.')
})

test('falls back to the model default for auto when auto is not offered', () => {
  const result = reconcileParams(params({ aspectRatio: 'auto' }), model('seedream-5-lite'))
  assert.equal(result.params.aspectRatio, defaultAspectRatio(model('seedream-5-lite')))
  assert.equal(result.params.aspectRatio, '1:1')
  assert.equal(result.changes[0]?.message, 'Auto is not available on Seedream 5.0 Lite. Switched to 1:1.')
})

test('drops to the nearest quality tier the next model offers', () => {
  const result = reconcileParams(params({ quality: '4k' }), model('seedream-5-lite'))
  assert.equal(result.params.quality, '2k')
  assert.equal(
    result.changes[0]?.message,
    'Quality 4K is not available on Seedream 5.0 Lite. Switched to 2K.',
  )

  const upscale = reconcileParams(params({ quality: '2k' }), model('grok-imagine-image'))
  assert.equal(upscale.params.quality, '1k')

  const kept = reconcileParams(params({ quality: '1k' }), model('grok-imagine-image'))
  assert.deepEqual(kept.changes, [])
})

test('keeps a duration the next video model lists and snaps otherwise', () => {
  const kept = reconcileParams(params({ aspectRatio: '16:9', duration: 8 }), model('kling-3.0'))
  assert.deepEqual(kept.changes, [])
  assert.equal(kept.params.duration, 8)

  const below = reconcileParams(params({ aspectRatio: '16:9', duration: 2 }), model('kling-3.0'))
  assert.equal(below.params.duration, 3)
  assert.equal(below.changes[0]?.message, '2s is not available on Kling 3.0. Switched to 3s.')

  const between = reconcileParams(params({ aspectRatio: '16:9', duration: 12 }), model('kling-3.0'))
  assert.equal(between.params.duration, 10)

  const tie = reconcileParams(params({ aspectRatio: '16:9', duration: 5 }), model('veo3_lite'))
  assert.equal(tie.params.duration, 4)
})

test('keeps a video resolution the model lists and snaps otherwise', () => {
  const kept = reconcileParams(
    params({ aspectRatio: '16:9', duration: 8, resolution: '1080p' }),
    model('veo3_lite'),
  )
  assert.deepEqual(kept.changes, [])
  assert.equal(kept.params.resolution, '1080p')

  const down = reconcileParams(
    params({ aspectRatio: '16:9', duration: 8, resolution: '4k' }),
    model('veo3_lite'),
  )
  assert.equal(down.params.resolution, '1080p')
  assert.equal(down.changes[0]?.message, '4K is not available on Veo 3.1 Lite. Switched to 1080P.')

  const unset = reconcileParams(
    params({ aspectRatio: '16:9', duration: 8, resolution: '' }),
    model('veo3_lite'),
  )
  assert.equal(unset.params.resolution, '720p')
  assert.deepEqual(unset.changes, [])
})

test('clamps the result count to the maximum', () => {
  const result = reconcileParams(params({ count: MAX_IMAGE_RESULTS + 2 }), model('nano-banana-2'))
  assert.equal(result.params.count, MAX_IMAGE_RESULTS)
  assert.equal(result.changes[0]?.field, 'count')
  assert.equal(result.params.count, 4)
})

test('does not touch video state when switching image models', () => {
  const result = reconcileParams(params({ duration: 6, resolution: '480p' }), model('gpt-image-2'))
  assert.equal(result.params.duration, 6)
  assert.equal(result.params.resolution, '480p')
  assert.deepEqual(result.changes, [])
})

test('reports every replaced value in one pass', () => {
  const result = reconcileParams(
    params({ aspectRatio: '21:9', quality: '2k', count: 9 }),
    model('grok-imagine-image'),
  )
  assert.deepEqual(
    result.changes.map((change) => change.field),
    ['aspectRatio', 'quality', 'count'],
  )
  assert.equal(result.params.aspectRatio, '2:1')
  assert.equal(result.params.quality, '1k')
  assert.equal(result.params.count, 4)
})

test('defaultQuality prefers 1k, then the declared default', () => {
  assert.equal(defaultQuality(model('nano-banana-2')), '1k')
  assert.equal(defaultQuality(model('seedream-5-lite')), '1k')
  assert.equal(defaultQuality(model('flux-lora')), '')
})

test('describes trimmed references', () => {
  assert.equal(describeReferenceTrim('Seedream 5.0', 8, 2), 'Seedream 5.0 accepts 8 references; removed 2.')
  assert.equal(
    describeReferenceTrim('Grok Imagine Image', 1, 1),
    'Grok Imagine Image accepts 1 reference; removed 1.',
  )
  assert.equal(
    describeReferenceTrim('Grok Imagine Image', 0, 3),
    'Grok Imagine Image does not take reference images; removed 3.',
  )
  assert.equal(describeReferenceTrim('Seedream 5.0', 8, 0), '')
  assert.equal(
    describeEditReferenceTrim('Seedream 5.0', 2, 1),
    'Seedream 5.0 accepts 2 edit references; removed 1.',
  )
})
