import assert from 'node:assert/strict'
import { test } from 'node:test'
import { capFrameTimes, frameTimes, framesWithinBudget } from './video-frames'

test('every-seconds sampling covers the clip and stops at the end', () => {
  assert.deepEqual(frameTimes({ mode: 'every', durationSeconds: 30, everySeconds: 10 }), [0, 10, 20])
})

test('timestamps are clamped, sorted and de-duplicated', () => {
  assert.deepEqual(
    frameTimes({ mode: 'timestamps', durationSeconds: 10, timestamps: [8, -1, 8, 12, 2] }),
    [2, 8],
  )
})

test('the cap keeps the first and last frame', () => {
  const times = Array.from({ length: 100 }, (_, index) => index)
  const capped = capFrameTimes(times, 24)
  assert.equal(capped.length, 24)
  assert.equal(capped[0], 0)
  assert.equal(capped.at(-1), 99)
  assert.deepEqual(
    [...capped].sort((a, b) => a - b),
    capped,
  )
})

test('scene times are trimmed to the clip and the budget names its limit', () => {
  assert.deepEqual(frameTimes({ mode: 'scene', durationSeconds: 5, sceneTimes: [4.5, 6, 1] }), [1, 4.5])
  assert.equal(framesWithinBudget(48), true)
  assert.equal(framesWithinBudget(49), false)
  assert.equal(framesWithinBudget(0), false)
})
