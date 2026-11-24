import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { StudioItemRecord } from '@sunnygen/db'
import { assertCropPanelSize, existingCrops } from './avatar-crops.server'

function item(data: Record<string, unknown>): StudioItemRecord {
  return {
    id: 'avatar-1',
    kind: 'avatar',
    name: 'Ava',
    assetId: 'panel',
    cleanAssetId: null,
    data,
    builtin: false,
    createdAt: 0,
    updatedAt: 0,
  }
}

const CROPS = [{ role: 'face-front' as const, assetId: 'crop', width: 1024, height: 1024 }]

test('a panel under 4096 px is refused with the exact message', () => {
  assert.throws(() => assertCropPanelSize(1254, 1254), {
    message: 'The 4x4 panel must be at least 4096 x 4096 px (this one is 1254 x 1254).',
  })
  assert.throws(() => assertCropPanelSize(4096, 3000), /this one is 4096 x 3000/)
  assert.throws(() => assertCropPanelSize(null, null), /at least 4096 x 4096 px/)
  assert.doesNotThrow(() => assertCropPanelSize(4096, 4096))
})

test('stored crops are kept unless the rebuild is forced', () => {
  assert.deepEqual(existingCrops(item({ crops: CROPS }), false), CROPS)
  assert.equal(existingCrops(item({ crops: CROPS }), true), undefined)
  assert.equal(existingCrops(item({}), false), undefined)
  assert.equal(existingCrops(item({ crops: [] }), false)?.length, 0)
})
