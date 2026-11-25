import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AVATAR_CROP_CELLS,
  avatarImageLimit,
  avatarImagePlan,
  defaultAvatarCropCells,
  panelCellSize,
  panelSizeError,
  parseAvatarCropCells,
  parseAvatarCrops,
} from './avatar-references'

const CROPS = [
  { role: 'face-front' as const, assetId: 'face-front', width: 1200, height: 1200 },
  { role: 'face-three-quarter' as const, assetId: 'face-3q', width: 1200, height: 1200 },
  { role: 'body-front' as const, assetId: 'body', width: 1200, height: 1600 },
  { role: 'body-side' as const, assetId: 'body-side', width: 1200, height: 1600 },
]

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

test('the default cells read from the layout the panel prompt draws', () => {
  assert.deepEqual(defaultAvatarCropCells(), {
    'face-front': { row: 1, column: 0 },
    'face-three-quarter': { row: 1, column: 1 },
    'body-front': { row: 0, column: 0 },
    'body-side': { row: 0, column: 1 },
  })
  // Row 0 is the full-body row of the panel prompt, row 1 the faces.
  assert.equal(AVATAR_CROP_CELLS['body-side'].row, 0)
  assert.equal(AVATAR_CROP_CELLS['body-side'].column, 1)
})

test('a stored cell selection needs one in-grid cell per role', () => {
  const saved = defaultAvatarCropCells()
  assert.deepEqual(parseAvatarCropCells(saved), saved)
  assert.deepEqual(parseAvatarCropCells({ ...saved, 'body-side': { row: 3, column: 3 } }), {
    ...saved,
    'body-side': { row: 3, column: 3 },
  })
  const { 'body-side': _dropped, ...missing } = saved
  assert.equal(parseAvatarCropCells(missing), null)
  assert.equal(parseAvatarCropCells({ ...saved, 'body-side': { row: 4, column: 0 } }), null)
  assert.equal(parseAvatarCropCells({ ...saved, 'body-side': { row: 0, column: -1 } }), null)
  assert.equal(parseAvatarCropCells({ ...saved, 'body-side': { row: 0.5, column: 1 } }), null)
  assert.equal(parseAvatarCropCells({ ...saved, 'body-side': 'row 0, column 1' }), null)
  assert.equal(parseAvatarCropCells(null), null)
  assert.equal(parseAvatarCropCells([]), null)
})

test('stored crops parse defensively', () => {
  assert.equal(parseAvatarCrops(undefined), undefined)
  assert.deepEqual(parseAvatarCrops(CROPS), CROPS)
  assert.deepEqual(parseAvatarCrops([{ role: 'unknown', assetId: 'x' }, { role: 'face-front' }]), [])
})

test('a panel must be 4K before it can be cut into cells', () => {
  assert.equal(panelSizeError(4096, 4096), null)
  assert.equal(panelSizeError(5000, 6000), null)
  assert.equal(
    panelSizeError(1254, 1254),
    'The 4x4 panel must be at least 4096 x 4096 px (this one is 1254 x 1254).',
  )
  assert.match(String(panelSizeError(4096, 3000)), /4096 x 4096 px \(this one is 4096 x 3000\)/)
  assert.match(String(panelSizeError(null, null)), /must be at least 4096 x 4096 px/)
  assert.match(String(panelSizeError(0, 4096)), /must be at least 4096 x 4096 px/)
})

test('cell size decides whether the app can crop', () => {
  assert.deepEqual(panelCellSize(4096, 4096), { cellWidth: 1024, cellHeight: 1024, usable: true })
  assert.deepEqual(panelCellSize(5000, 4097), { cellWidth: 1250, cellHeight: 1024, usable: true })
  assert.deepEqual(panelCellSize(1254, 1254), { cellWidth: 313, cellHeight: 313, usable: false })
  assert.equal(panelCellSize(4095, 4096).usable, false)
  assert.deepEqual(panelCellSize(null, null), { cellWidth: 0, cellHeight: 0, usable: false })
})
