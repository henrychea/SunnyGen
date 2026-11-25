import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hasDerived, withoutDerived } from './avatar-derived'

test('a new image in a slot clears everything cut from the old ones', () => {
  const data: Record<string, unknown> = {
    style: 'photoreal',
    characterSheetAssetId: 'sheet',
    facePanelAssetId: 'face',
    crops: [{ role: 'face-front', assetId: 'tile', width: 2048, height: 2048 }],
    cropTiles: [{ role: 'face-front', assetId: 'tile', width: 2048, height: 2048 }],
    cropCells: { 'face-front': { row: 1, column: 0 } },
    cropRegions: { 'face-front': { source: 'face-panel', x: 0, y: 0, w: 2048, h: 2048 } },
    boards: [{ role: 'face', assetId: 'board', width: 4096, height: 4096 }],
  }

  const cleared: Record<string, unknown> = withoutDerived(data)

  // The originals stay; only what was cut from them goes. Checked before deepEqual, which
  // narrows `cleared` to the compared literal.
  for (const key of ['crops', 'cropTiles', 'cropCells', 'cropRegions', 'boards']) {
    assert.equal(cleared[key], undefined, key)
  }
  assert.deepEqual(cleared, {
    style: 'photoreal',
    characterSheetAssetId: 'sheet',
    facePanelAssetId: 'face',
  })
  // The caller's object is untouched.
  assert.ok(Array.isArray(data.crops))
})

test('an avatar with no derived data is left alone', () => {
  assert.equal(hasDerived({ style: 'photoreal' }), false)
  assert.deepEqual(withoutDerived({ style: 'photoreal' }), { style: 'photoreal' })
  assert.deepEqual(withoutDerived(undefined), {})
  assert.equal(hasDerived({ cropTiles: [] }), true)
})
