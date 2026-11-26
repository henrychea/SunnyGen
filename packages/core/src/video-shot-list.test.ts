import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MAX_COPY_SHOTS } from './video-frames'
import { parseShotList, type VideoShot } from './video-shot-list'

function shot(overrides: Partial<VideoShot> = {}): VideoShot {
  return {
    start: 0,
    end: 3,
    subject: 'a room',
    action: 'pans',
    motion: 'slow',
    camera: 'push in',
    lighting: 'window light',
    prompt: 'a slow push in',
    ...overrides,
  }
}

function list(shots: VideoShot[]): string {
  return JSON.stringify({ shots })
}

test('a fenced JSON shot list parses', () => {
  const text =
    '```json\n{"shots":[{"start":0,"end":3.2,"subject":"a room","action":"pans",' +
    '"motion":"slow","camera":"push in","lighting":"window light","prompt":"a slow push in"}]}\n```'
  const result = parseShotList(text, 6)
  assert.ok('shots' in result)
  assert.equal(result.shots.length, 1)
  assert.equal(result.shots[0]?.end, 3.2)
})

test('shots out of order are rejected with the shot index', () => {
  const result = parseShotList(list([shot({ start: 0, end: 3 }), shot({ start: 2, end: 1 })]), 6)
  assert.ok('error' in result)
  assert.match(result.error, /shot 2/)
  assert.match(result.error, /must be after start/)
})

test('a shot past the clip end is rejected', () => {
  const result = parseShotList(list([shot({ start: 0, end: 9 })]), 6)
  assert.ok('error' in result)
  assert.match(result.error, /shot 1/)
  assert.match(result.error, /past the 6s clip/)
})

test('prose instead of JSON is rejected without throwing', () => {
  const result = parseShotList('Here is the shot list: two shots, both slow.', 6)
  assert.ok('error' in result)
  assert.match(result.error, /JSON/)
})

test('an empty prompt is rejected', () => {
  const result = parseShotList(list([shot({ prompt: '   ' })]), 6)
  assert.ok('error' in result)
  assert.match(result.error, /shot 1: prompt is empty/)
})

test('more than the cap is rejected', () => {
  const shots = Array.from({ length: MAX_COPY_SHOTS + 1 }, (_value, index) =>
    shot({ start: index, end: index + 0.5 }),
  )
  const result = parseShotList(list(shots), 60)
  assert.ok('error' in result)
  assert.ok(result.error.includes(`1 to ${MAX_COPY_SHOTS} shots`))
})
