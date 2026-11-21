import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_IMAGE_LIMITS } from '@sunnygen/core'
import { oversizedReferences, referenceIsOversized, shouldConfirmResize } from './oversized-images'
import type { ReferenceItem } from './reference-images'

function item(overrides: Partial<ReferenceItem> = {}): ReferenceItem {
  return { id: 'sheet', name: 'sheet.png', url: '/api/media/sheet', ...overrides }
}

const large = item({ byteSize: DEFAULT_IMAGE_LIMITS.bytes + 1, width: 1024, height: 1024 })
const longSide = item({ byteSize: 2_000_000, width: 4097, height: 1024 })
const small = item({ byteSize: 2_000_000, width: 2048, height: 2048 })
const avatar = item({
  id: 'avatar',
  name: 'Aria',
  assetIds: ['sheet', 'panel'],
  avatar: true,
  byteSize: 3_000_000,
  width: 4096,
  height: 4096,
})

test('images within the limits never ask for confirmation', () => {
  assert.equal(referenceIsOversized(small), false)
  assert.equal(shouldConfirmResize([small], { suppressed: false }), false)
  assert.equal(shouldConfirmResize([], { suppressed: false }), false)
})

test('oversized images ask for confirmation when the prompt is enabled', () => {
  assert.equal(referenceIsOversized(large), true)
  assert.equal(referenceIsOversized(longSide), true)
  assert.equal(shouldConfirmResize([small, large], { suppressed: false }), true)
})

test('suppressing the prompt skips the dialog but keeps the oversized items known', () => {
  assert.equal(shouldConfirmResize([large], { suppressed: true }), false)
  assert.deepEqual(
    oversizedReferences([small, large, longSide]).map((entry) => entry.id),
    ['sheet', 'sheet'],
  )
})

test('avatars are judged by the size of their sheet and panel assets', () => {
  assert.equal(referenceIsOversized(avatar), false)
  assert.equal(
    referenceIsOversized({
      ...avatar,
      byteSize: DEFAULT_IMAGE_LIMITS.bytes + 10,
      width: null,
      height: null,
    }),
    true,
  )
})

test('items without size information are never flagged', () => {
  assert.equal(referenceIsOversized(item()), false)
  assert.equal(shouldConfirmResize([item()], { suppressed: false }), false)
})
