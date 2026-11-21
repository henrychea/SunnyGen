import assert from 'node:assert/strict'
import test from 'node:test'
import { trimStudioReferences } from './studio-references'

test('keeps the selection when it fits the model', () => {
  assert.deepEqual(trimStudioReferences({ garmentCount: 2, hasPose: true, hasScene: true }, 5), {
    garmentCount: 2,
    hasPose: true,
    hasScene: true,
    removed: 0,
  })
})

test('drops the scene and pose before garments', () => {
  assert.deepEqual(trimStudioReferences({ garmentCount: 3, hasPose: true, hasScene: true }, 4), {
    garmentCount: 3,
    hasPose: false,
    hasScene: false,
    removed: 2,
  })
})

test('cuts garments once the optional references are gone', () => {
  assert.deepEqual(trimStudioReferences({ garmentCount: 4, hasPose: false, hasScene: false }, 3), {
    garmentCount: 2,
    hasPose: false,
    hasScene: false,
    removed: 2,
  })
})

test('stops at the avatar when the model takes no references', () => {
  assert.deepEqual(trimStudioReferences({ garmentCount: 2, hasPose: true, hasScene: true }, 0), {
    garmentCount: 0,
    hasPose: false,
    hasScene: false,
    removed: 4,
  })
})
