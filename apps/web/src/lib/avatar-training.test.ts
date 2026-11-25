import assert from 'node:assert/strict'
import test from 'node:test'
import { avatarTrainingPanels } from './avatar-training'

const cells = (panels: ReturnType<typeof avatarTrainingPanels>) =>
  panels.reduce((total, panel) => total + panel.grid * panel.grid, 0)

test('an avatar with a face panel trains on the four cells of each 2x2 panel', () => {
  const panels = avatarTrainingPanels({ bodyPanelAssetId: 'body-panel', facePanelAssetId: 'face-panel' })

  assert.deepEqual(panels, [
    { assetId: 'face-panel', label: 'Face panel', grid: 2 },
    { assetId: 'body-panel', label: 'Body panel', grid: 2 },
  ])
  assert.equal(cells(panels), 8)
})

test('an avatar without a face panel keeps the whole 4x4 sheet', () => {
  const panels = avatarTrainingPanels({ bodyPanelAssetId: 'panel', facePanelAssetId: null })

  assert.deepEqual(panels, [{ assetId: 'panel', label: 'Panel', grid: 4 }])
  assert.equal(cells(panels), 16)
})

test('an avatar with no panel image has nothing to cut', () => {
  assert.deepEqual(avatarTrainingPanels({ bodyPanelAssetId: null, facePanelAssetId: null }), [])
})
