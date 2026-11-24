import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertCropPanelSize, avatarUsesTwoPanels, dataForPanelChange } from './avatar-crops.server'

test('a panel under 4096 px is refused with the exact message', () => {
  assert.throws(() => assertCropPanelSize(1254, 1254), {
    message: 'The 4x4 panel must be at least 4096 x 4096 px (this one is 1254 x 1254).',
  })
  assert.throws(() => assertCropPanelSize(4096, 3000), /this one is 4096 x 3000/)
  assert.throws(() => assertCropPanelSize(null, null), /at least 4096 x 4096 px/)
  assert.doesNotThrow(() => assertCropPanelSize(4096, 4096))
})

const CROPS = [{ role: 'face-front' as const, assetId: 'crop', width: 1024, height: 1024 }]
const CELLS = {
  'face-front': { row: 1, column: 0 },
  'face-three-quarter': { row: 1, column: 1 },
  'body-front': { row: 0, column: 0 },
  'body-side': { row: 0, column: 1 },
}

test('a save onto a different panel drops the crops and the cells chosen on the old one', () => {
  const data = { crops: CROPS, cropCells: CELLS, style: 'photoreal' }
  const next = dataForPanelChange(data, true)
  assert.equal(next.crops, undefined)
  assert.equal(next.cropCells, undefined)
  assert.equal(next.style, 'photoreal')
  // Same panel keeps the selection, so saving a profile does not lose the crops.
  assert.deepEqual(dataForPanelChange(data, false), data)
  assert.deepEqual(dataForPanelChange({ ...data, crops: [] }, false), { ...data, crops: [] })
})

test('a panel change also drops the boxes and the boards cut from the old images', () => {
  const data = { cropRegions: { hands: { source: 'face-panel' } }, boards: [{ role: 'face' }] }
  const next = dataForPanelChange(data, true)
  assert.equal(next.cropRegions, undefined)
  assert.equal(next.boards, undefined)
  assert.deepEqual(dataForPanelChange(data, false), data)
})

test('an avatar is on the two-panel layout as soon as it has a face panel', () => {
  assert.equal(avatarUsesTwoPanels({ facePanelAssetId: 'face-panel-id' }), true)
  // Legacy: one 4x4 panel, whatever crops or cells it still carries.
  assert.equal(avatarUsesTwoPanels({}), false)
  assert.equal(avatarUsesTwoPanels({ crops: CROPS, cropCells: CELLS }), false)
  assert.equal(avatarUsesTwoPanels({ facePanelAssetId: null }), false)
  assert.equal(avatarUsesTwoPanels({ facePanelAssetId: '' }), false)
  assert.equal(avatarUsesTwoPanels({ facePanelAssetId: 42 }), false)
})
