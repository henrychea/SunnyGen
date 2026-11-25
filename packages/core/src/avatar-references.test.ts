import assert from 'node:assert/strict'
import test from 'node:test'
import { avatarImageLimit, avatarImagePlan, panelSizeError } from './avatar-references'

const THREE_IMAGES = { facePanelAssetId: 'face-panel', bodyPanelAssetId: 'body-panel', sheetAssetId: 'sheet' }

test('an avatar sends its three whole images, face panel first and sheet last', () => {
  assert.deepEqual(avatarImagePlan(THREE_IMAGES, 'nano-banana'), [
    { role: 'face-panel', assetId: 'face-panel' },
    { role: 'body-panel', assetId: 'body-panel' },
    { role: 'sheet', assetId: 'sheet' },
  ])
  assert.equal(avatarImageLimit('qwen'), 2)
  assert.equal(avatarImageLimit('seedream'), 3)
})

test('qwen names two avatar images, so the sheet is the one it loses', () => {
  assert.deepEqual(avatarImagePlan(THREE_IMAGES, 'qwen'), [
    { role: 'face-panel', assetId: 'face-panel' },
    { role: 'body-panel', assetId: 'body-panel' },
  ])
})

test('a missing image shortens the plan instead of leaving a hole', () => {
  assert.deepEqual(avatarImagePlan({ ...THREE_IMAGES, sheetAssetId: null }, 'flux'), [
    { role: 'face-panel', assetId: 'face-panel' },
    { role: 'body-panel', assetId: 'body-panel' },
  ])
  assert.deepEqual(avatarImagePlan({ ...THREE_IMAGES, bodyPanelAssetId: '' }, 'flux'), [
    { role: 'face-panel', assetId: 'face-panel' },
    { role: 'sheet', assetId: 'sheet' },
  ])
})

test('an avatar without a face panel has no plan and keeps its own id list', () => {
  assert.deepEqual(avatarImagePlan({ bodyPanelAssetId: 'panel', sheetAssetId: 'sheet' }, 'flux'), [])
  assert.deepEqual(avatarImagePlan({}, 'flux'), [])
})

test('a panel must be 4K before it can be used', () => {
  assert.equal(panelSizeError(4096, 4096), null)
  assert.equal(panelSizeError(5000, 6000), null)
  assert.equal(
    panelSizeError(1254, 1254),
    'The panel must be at least 4096 x 4096 px (this one is 1254 x 1254).',
  )
  assert.match(String(panelSizeError(4096, 3000)), /4096 x 4096 px \(this one is 4096 x 3000\)/)
  assert.match(String(panelSizeError(null, null)), /must be at least 4096 x 4096 px/)
  assert.match(String(panelSizeError(0, 4096)), /must be at least 4096 x 4096 px/)
})
