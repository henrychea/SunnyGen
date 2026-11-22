import assert from 'node:assert/strict'
import test from 'node:test'
import { getModel, type VideoModelDefinition } from '@sunnygen/core'
import type { ModelOption } from '~/components/model-combobox'
import {
  availableVideoModes,
  defaultVideoParams,
  reconcileVideoParams,
  videoDefinitions,
  videoModeSlots,
  videoModesFor,
  type VideoParams,
} from './video-flow'

function model(id: string): VideoModelDefinition {
  return getModel(id) as VideoModelDefinition
}

function option(definition: VideoModelDefinition, disabled = false): ModelOption {
  return {
    key: `model:${definition.id}`,
    label: definition.label,
    company: definition.providerLabel,
    provider: definition.providers[0] ?? 'sunra',
    providerLabel: 'Sunra.ai',
    kind: 'video',
    price: definition.price ?? null,
    sourceId: definition.sourceId ?? definition.id,
    modelId: definition.id,
    supported: true,
    definition,
    disabled,
  }
}

function params(overrides: Partial<VideoParams> = {}): VideoParams {
  return {
    videoMode: 'text',
    aspectRatio: '16:9',
    quality: '',
    duration: 8,
    resolution: '720p',
    count: 1,
    sound: true,
    ...overrides,
  }
}

test('step availability follows the modes the available models document', () => {
  const textOnly = videoModesFor([model('veo3_lite')], 'text')
  assert.deepEqual(
    textOnly.map((entry) => entry.id),
    ['veo3_lite'],
  )
  assert.deepEqual(videoModesFor([model('veo3_lite')], 'references'), [])
  assert.deepEqual(availableVideoModes([model('kling-3.0')]), ['text', 'image', 'frames'])
  assert.deepEqual(availableVideoModes([model('veo3')]), ['text', 'image', 'frames', 'references'])
})

test('disabled catalog models never make a mode available', () => {
  const catalog: VideoModelDefinition = {
    ...model('veo3'),
    id: 'sunra:someone/style',
    videoModes: { references: { ...model('veo3').videoModes.references!, maxImages: 12 } },
  }
  assert.deepEqual(availableVideoModes([catalog]), ['references'])
  assert.deepEqual(videoDefinitions([option(catalog, true)]), [])
})

test('reference slots take the largest documented capacity for the chosen mode', () => {
  assert.equal(videoModeSlots([model('grok-imagine')], 'references'), 7)
  assert.equal(videoModeSlots([model('veo3'), model('grok-imagine')], 'references'), 7)
  assert.equal(videoModeSlots([model('veo3')], 'image'), 1)
  assert.equal(videoModeSlots([model('veo3')], 'frames'), 2)
  assert.equal(videoModeSlots([model('veo3')], 'text'), 0)
})

test('defaults come from the selected mode, not the model union', () => {
  const text = defaultVideoParams(model('veo3_lite'), 'text')
  assert.equal(text.aspectRatio, '16:9')
  assert.equal(text.duration, 8)
  assert.equal(text.sound, true)
  const frames = defaultVideoParams(model('kling-3.0'), 'frames')
  assert.equal(frames.aspectRatio, '9:16')
  assert.deepEqual(
    reconcileVideoParams(params({ duration: 5 }), model('kling-3.0'), 'frames').params.videoMode,
    'frames',
  )
})

test('switching models keeps compatible settings', () => {
  const current = params({ duration: 8, resolution: '720p', aspectRatio: '16:9', videoMode: 'image' })
  const result = reconcileVideoParams(current, model('veo3_fast'), 'image')
  assert.equal(result.mode, 'image')
  assert.deepEqual(result.changes, [])
  assert.equal(result.params.duration, 8)
  assert.equal(result.params.resolution, '720p')
  assert.equal(result.params.aspectRatio, '16:9')
})

test('switching models falls back to the nearest documented setting with a toast', () => {
  const current = params({
    videoMode: 'image',
    duration: 15,
    resolution: '4k',
    aspectRatio: '1:1',
    sound: true,
  })
  const result = reconcileVideoParams(current, model('veo3_lite'), 'image')
  assert.deepEqual(
    result.changes.map((change) => change.field),
    ['aspectRatio', 'duration', 'resolution'],
  )
  assert.equal(result.params.aspectRatio, '16:9')
  assert.equal(result.params.duration, 8)
  assert.equal(result.params.resolution, '1080p')
  for (const change of result.changes) {
    assert.match(change.message, /Veo 3\.1 Lite/)
  }
})

test('switching to a model without the mode falls back to a supported mode', () => {
  const result = reconcileVideoParams(params({ videoMode: 'references' }), model('kling-3.0'), 'references')
  assert.equal(result.mode, 'text')
  assert.equal(result.params.videoMode, 'text')
  assert.equal(result.changes[0]?.field, 'videoMode')
  assert.match(result.changes[0]?.message ?? '', /Reference images is not available on Kling 3\.0/)
})

test('a mode without audio mutes the request', () => {
  const result = reconcileVideoParams(
    params({ videoMode: 'image', sound: true }),
    model('grok-imagine'),
    'image',
  )
  assert.equal(result.params.sound, false)
  assert.deepEqual(result.changes, [])
})

test('a silent model keeps sound off when the user picks a new mode on it', () => {
  const result = reconcileVideoParams(params({ videoMode: 'text', sound: false }), model('veo3_lite'), 'text')
  assert.equal(result.params.sound, false)
})
