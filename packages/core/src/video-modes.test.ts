import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  VIDEO_MODELS,
  defaultVideoMode,
  videoModeCapability,
  videoModeDefinition,
  type VideoModelDefinition,
} from './models'
import {
  classifyVideoModes,
  operationVideoModes,
  videoModeKeys,
  type VideoFieldInfo,
  type VideoOperationInfo,
} from './video-modes'

function field(type: VideoFieldInfo['type'], options: Partial<VideoFieldInfo> = {}): VideoFieldInfo {
  return { type, maxItems: null, values: [], ...options }
}

function operation(
  name: string,
  fields: Record<string, VideoFieldInfo>,
  required: string[] = [],
): VideoOperationInfo {
  return { name, path: `/vendor/model/${name}`, fields, required }
}

const PROMPT = { prompt: field('string') }

test('text-to-video operations carry their documented controls', () => {
  const modes = classifyVideoModes([
    operation('text-to-video', {
      ...PROMPT,
      aspect_ratio: field('string', { values: ['16:9', '9:16'] }),
      duration: field('integer', { values: ['4', '6', '8'] }),
      resolution: field('string', { values: ['720p', '1080p'] }),
      generate_audio: field('boolean'),
    }),
  ])
  assert.deepEqual(videoModeKeys(modes), ['text'])
  const text = modes.text
  assert.ok(text)
  assert.equal(text.endpoint, 'vendor/model/text-to-video')
  assert.equal(text.fields.length, 0)
  assert.equal(text.maxImages, 0)
  assert.deepEqual(text.durations, [4, 6, 8])
  assert.deepEqual(text.resolutions, ['720p', '1080p'])
  assert.deepEqual(text.ratios, ['16:9', '9:16'])
  assert.equal(text.audio, true)
})

test('duration values keep only finite seconds, including the s suffix', () => {
  const modes = classifyVideoModes([
    operation('text-to-video', {
      ...PROMPT,
      duration: field('string', { values: ['auto', '4s', '6s', '8s'] }),
    }),
  ])
  assert.deepEqual(modes.text?.durations, [4, 6, 8])
})

test('image-to-video with an end frame offers start and start + end modes', () => {
  const modes = classifyVideoModes([
    operation(
      'image-to-video',
      {
        ...PROMPT,
        image: field('string'),
        end_image: field('string'),
        aspect_ratio: field('string', { values: ['auto', '16:9'] }),
      },
      ['prompt', 'image'],
    ),
  ])
  assert.deepEqual(videoModeKeys(modes), ['image', 'frames'])
  assert.deepEqual(modes.image?.fields, ['image'])
  assert.equal(modes.image?.maxImages, 1)
  assert.deepEqual(modes.frames?.fields, ['image', 'end_image'])
  assert.equal(modes.frames?.maxImages, 2)
  assert.deepEqual(modes.frames?.ratios, ['auto', '16:9'])
})

test('a start-only image operation has no frame mode', () => {
  const modes = classifyVideoModes([
    operation('image-to-video', { ...PROMPT, image_url: field('string') }, ['prompt', 'image_url']),
  ])
  assert.deepEqual(videoModeKeys(modes), ['image'])
})

test('reference operations report their array field and max items', () => {
  const modes = classifyVideoModes([
    operation('reference-to-video', {
      ...PROMPT,
      reference_images: field('array', { maxItems: 9 }),
    }),
  ])
  assert.deepEqual(videoModeKeys(modes), ['references'])
  assert.deepEqual(modes.references?.fields, ['reference_images'])
  assert.equal(modes.references?.fieldsMode, 'array')
  assert.equal(modes.references?.maxImages, 9)
})

test('element references need a separate endpoint when the start frame is required', () => {
  const required = classifyVideoModes([
    operation(
      'image-to-video',
      {
        ...PROMPT,
        start_image_url: field('string'),
        end_image_url: field('string'),
        elements: field('array'),
      },
      ['start_image_url'],
    ),
  ])
  assert.deepEqual(videoModeKeys(required), ['image', 'frames'])

  const optional = classifyVideoModes([
    operation('image-to-video', {
      ...PROMPT,
      start_image_url: field('string'),
      elements: field('array'),
    }),
  ])
  assert.deepEqual(videoModeKeys(optional), ['image', 'references'])
  assert.deepEqual(optional.references?.fields, ['elements'])
  assert.equal(optional.references?.endpoint, 'vendor/model/image-to-video')
})

test('operations that need a video or audio input are skipped', () => {
  for (const [name, fields, required] of [
    [
      'video-to-video',
      { ...PROMPT, video_url: field('string'), image_urls: field('array') },
      ['prompt', 'video_url'],
    ],
    ['extend-video', { ...PROMPT, video_url: field('string') }, ['prompt', 'video_url']],
    [
      'image-to-video',
      { ...PROMPT, image_url: field('string'), audio_url: field('string') },
      ['prompt', 'audio_url'],
    ],
    ['upscale', { video: field('string') }, ['video']],
    ['text-to-video-draft', { ...PROMPT }, ['prompt']],
  ] as const) {
    assert.deepEqual(operationVideoModes(operation(name, fields, [...required])), [], name)
  }
})

test('keyframes without a start frame are not a fillable mode', () => {
  const modes = classifyVideoModes([
    operation('keyframes-to-video', { ...PROMPT, keyframes: field('array', { maxItems: 6 }) }),
  ])
  assert.deepEqual(videoModeKeys(modes), [])
})

test('every shipped video model documents its modes', () => {
  for (const model of VIDEO_MODELS) {
    assert.ok(videoModeCapability(model, model.defaultVideoMode), `${model.id} is missing its default mode`)
    for (const mode of videoModeKeys(model.videoModes)) {
      const capability = videoModeCapability(model, mode)
      assert.ok(capability?.endpoint, `${model.id} ${mode} has no endpoint`)
      if (mode === 'text') assert.equal(capability?.fields.length, 0)
      else assert.ok((capability?.fields.length ?? 0) > 0, `${model.id} ${mode} has no image field`)
      if (mode !== 'text') assert.ok((capability?.maxImages ?? 0) > 0, `${model.id} ${mode} takes no images`)
    }
    assert.equal(defaultVideoMode(model), model.defaultVideoMode)
  }
})

test('mode definitions narrow limits to the picked mode', () => {
  const model = VIDEO_MODELS.find((entry) => entry.id === 'veo3_lite') as VideoModelDefinition
  const frames = videoModeDefinition(model, 'frames')
  assert.deepEqual(frames.ratios, ['auto', '16:9', '9:16'])
  assert.deepEqual(frames.durations, [4, 6, 8])
  assert.equal(frames.maxImages, 2)
  assert.equal(frames.id, model.id)
  assert.equal(frames.kind, 'video')

  const kling = VIDEO_MODELS.find((entry) => entry.id === 'kling-3.0') as VideoModelDefinition
  const text = videoModeDefinition(kling, 'text')
  assert.deepEqual(text.ratios, ['16:9', '9:16', '1:1'])
  assert.deepEqual(videoModeDefinition(kling, 'image').ratios, kling.ratios)
  assert.equal(text.defaultRatio, '9:16')
})
