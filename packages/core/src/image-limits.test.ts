import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_IMAGE_LIMITS, isOversizedImage } from './image-limits'

test('images within the byte, side and pixel limits are not oversized', () => {
  assert.equal(isOversizedImage({ bytes: 2_000_000, width: 2048, height: 2048 }), false)
  assert.equal(isOversizedImage({ bytes: DEFAULT_IMAGE_LIMITS.bytes, width: 4096, height: 4096 }), false)
})

test('a file over the byte limit is oversized regardless of dimensions', () => {
  assert.equal(isOversizedImage({ bytes: DEFAULT_IMAGE_LIMITS.bytes + 1, width: 512, height: 512 }), true)
})

test('a long side or the pixel budget can make an image oversized', () => {
  assert.equal(isOversizedImage({ bytes: 1_000_000, width: 4097, height: 512 }), true)
  assert.equal(isOversizedImage({ bytes: 1_000_000, width: 512, height: 4097 }), true)
  assert.equal(isOversizedImage({ bytes: 1_000_000, width: 4096, height: 4096 }), false)
  const tight = { bytes: 1_000_000_000, side: 5000, pixels: 4_000_000 }
  assert.equal(isOversizedImage({ bytes: 1_000_000, width: 3000, height: 2000 }, tight), true)
})

test('unknown dimensions fall back to the byte limit only', () => {
  assert.equal(isOversizedImage({ bytes: 1_000_000, width: null, height: null }), false)
  assert.equal(isOversizedImage({ bytes: DEFAULT_IMAGE_LIMITS.bytes + 1, width: null, height: null }), true)
  assert.equal(isOversizedImage({ bytes: 1_000_000, width: 0, height: 0 }), false)
})
