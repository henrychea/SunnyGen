import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BOARD_TILES,
  CROP_REGION_DEFAULTS,
  CROP_REGION_ROLES,
  SHEET_REGION_BOXES,
  boardAssetIds,
  defaultCropRegions,
  parseAvatarBoards,
  parseCropRegions,
  plannedBoardAssets,
  regionsForSource,
  resetRegionsForSource,
  type AvatarBoard,
} from './avatar-regions'

test('the default boxes are the quadrants and named regions the prompts draw', () => {
  assert.deepEqual(CROP_REGION_DEFAULTS['body-front'], {
    source: 'body-panel',
    x: 0,
    y: 0,
    w: 2048,
    h: 2048,
  })
  // Front, right side, back, three-quarter: clockwise from the top-left quadrant.
  assert.deepEqual(CROP_REGION_DEFAULTS['body-side'], {
    source: 'body-panel',
    x: 2048,
    y: 0,
    w: 2048,
    h: 2048,
  })
  assert.deepEqual(CROP_REGION_DEFAULTS['body-back'], {
    source: 'body-panel',
    x: 0,
    y: 2048,
    w: 2048,
    h: 2048,
  })
  assert.deepEqual(CROP_REGION_DEFAULTS['body-three-quarter'], {
    source: 'body-panel',
    x: 2048,
    y: 2048,
    w: 2048,
    h: 2048,
  })
  assert.deepEqual(CROP_REGION_DEFAULTS.hands, {
    source: 'face-panel',
    x: 2048,
    y: 2048,
    w: 2048,
    h: 2048,
  })
  assert.deepEqual(CROP_REGION_DEFAULTS.expressions, { source: 'sheet', ...SHEET_REGION_BOXES.expressions })
  assert.deepEqual(regionsForSource('face-panel'), ['face-front', 'face-three-quarter', 'face-side', 'hands'])
})

test('a saved selection must be inside its own image and at least 256 px a side', () => {
  assert.deepEqual(parseCropRegions(defaultCropRegions()), defaultCropRegions())

  const moved = defaultCropRegions()
  moved['body-side'] = { source: 'body-panel', x: 512, y: 256, w: 3072, h: 3600 }
  assert.deepEqual(parseCropRegions(moved), moved)

  assert.equal(
    parseCropRegions({
      ...defaultCropRegions(),
      'body-side': { source: 'sheet', x: 0, y: 0, w: 2048, h: 2048 },
    }),
    null,
  )
  assert.equal(
    parseCropRegions({
      ...defaultCropRegions(),
      'body-side': { source: 'body-panel', x: 3000, y: 0, w: 2048, h: 2048 },
    }),
    null,
  )
  assert.equal(
    parseCropRegions({
      ...defaultCropRegions(),
      'body-side': { source: 'body-panel', x: 0, y: 0, w: 255, h: 2048 },
    }),
    null,
  )
  assert.equal(
    parseCropRegions({
      ...defaultCropRegions(),
      'body-side': { source: 'body-panel', x: 0.5, y: 0, w: 2048, h: 2048 },
    }),
    null,
  )
  const partial: Record<string, unknown> = defaultCropRegions()
  delete partial['body-side']
  assert.equal(parseCropRegions(partial), null)
  assert.equal(parseCropRegions(null), null)
})

test('a replaced image sends its own roles back to the defaults and leaves the rest', () => {
  const regions = defaultCropRegions()
  regions['body-side'] = { source: 'body-panel', x: 512, y: 256, w: 3072, h: 3600 }
  regions.expressions = { source: 'sheet', x: 100, y: 100, w: 600, h: 600 }

  const reset = resetRegionsForSource(regions, 'body-panel')

  assert.deepEqual(reset['body-side'], CROP_REGION_DEFAULTS['body-side'])
  assert.deepEqual(reset.expressions, { source: 'sheet', x: 100, y: 100, w: 600, h: 600 })
})

test('boards keep their tile order and reach a model identity first', () => {
  assert.deepEqual(BOARD_TILES.face, ['face-front', 'face-three-quarter', 'face-side', 'expressions'])
  assert.deepEqual(BOARD_TILES.body, ['body-front', 'body-side', 'body-back', 'body-three-quarter'])
  assert.deepEqual(BOARD_TILES.details, [
    'hands',
    'skin-texture',
    'hair-details',
    'facial-features',
    'body-details',
  ])

  const boards: AvatarBoard[] = [
    { role: 'details', assetId: 'details', width: 4096, height: 1600 },
    { role: 'body', assetId: 'body', width: 4096, height: 4096 },
    { role: 'face', assetId: 'face', width: 4096, height: 4096 },
  ]
  assert.deepEqual(boardAssetIds(boards), ['face', 'body', 'details'])
  assert.deepEqual(plannedBoardAssets(boards, 4), ['face', 'body', 'details'])
  // qwen names two avatar references: face then body, never details alone.
  assert.deepEqual(plannedBoardAssets(boards, 2), ['face', 'body'])
  assert.deepEqual(plannedBoardAssets(boards, 1), ['face'])
  assert.deepEqual(parseAvatarBoards(boards), boards)
  assert.equal(parseAvatarBoards('nope'), undefined)
})

test('every role belongs to exactly one source', () => {
  const seen = new Set<string>()
  for (const role of CROP_REGION_ROLES) {
    seen.add(role)
  }
  assert.equal(seen.size, CROP_REGION_ROLES.length)
  const covered = [
    ...regionsForSource('sheet'),
    ...regionsForSource('body-panel'),
    ...regionsForSource('face-panel'),
  ]
  assert.deepEqual(covered.sort(), [...CROP_REGION_ROLES].sort())
})
