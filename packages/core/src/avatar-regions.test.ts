import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BOARD_TILES,
  CROP_REGION_DEFAULTS,
  CROP_REGION_ROLES,
  SHEET_REGION_BOXES,
  BOARD_GRID,
  boardAssetIds,
  boardLayout,
  clampCropRegion,
  defaultCropRegions,
  isDefaultCropRegion,
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

test('the face board is a 2x2 grid: 4096 square, ~2012 px tiles, four cells', () => {
  const sizes = {
    'face-front': { width: 2048, height: 2048 },
    'face-three-quarter': { width: 2048, height: 2048 },
    'face-side': { width: 2048, height: 2048 },
    expressions: { width: 1024, height: 1024 },
  }
  const layout = boardLayout(BOARD_TILES.face, sizes, BOARD_GRID.face)

  assert.deepEqual(
    layout.tiles.map((tile) => tile.role),
    ['face-front', 'face-three-quarter', 'face-side', 'expressions'],
  )
  assert.equal(layout.width, 4096)
  assert.equal(layout.height, 4096)
  // Top-left, top-right, bottom-left and bottom-right cells at the 24 px gutter. The smaller
  // expressions tile is centred in its cell, so its origin is inset by (2012 - 1024) / 2.
  assert.deepEqual(
    layout.tiles.map((tile) => [tile.x, tile.y]),
    [
      [24, 24],
      [2060, 24],
      [24, 2060],
      [2554, 2554],
    ],
  )
  // A 2048 crop fills its 2012 cell; a 1024 sheet tile is never enlarged and sits centred.
  assert.deepEqual([layout.tiles[0]?.w, layout.tiles[0]?.h], [2012, 2012])
  assert.deepEqual([layout.tiles[3]?.w, layout.tiles[3]?.h], [1024, 1024])
  assert.deepEqual([layout.tiles[3]?.x, layout.tiles[3]?.y], [2554, 2554])
})

test('the body board uses the same 2x2 grid and keeps front, side, back, three-quarter', () => {
  const sizes = Object.fromEntries(BOARD_TILES.body.map((role) => [role, { width: 2048, height: 1536 }]))
  const layout = boardLayout(BOARD_TILES.body, sizes, BOARD_GRID.body)

  assert.equal(layout.width, 4096)
  assert.equal(layout.height, 4096)
  assert.deepEqual(
    layout.tiles.map((tile) => tile.role),
    ['body-front', 'body-side', 'body-back', 'body-three-quarter'],
  )
  // 4:3 tiles keep their aspect inside the square cell and are centred by height.
  assert.deepEqual([layout.tiles[0]?.w, layout.tiles[0]?.h], [2012, 1509])
  assert.deepEqual([layout.tiles[0]?.x, layout.tiles[0]?.y], [24, 275])
})

test('the details board is a 3 by 2 grid inside 4096 on the long side', () => {
  const sizes = Object.fromEntries(BOARD_TILES.details.map((role) => [role, { width: 1024, height: 1024 }]))
  const layout = boardLayout(BOARD_TILES.details, sizes, BOARD_GRID.details)

  assert.equal(layout.tiles.length, 5)
  assert.deepEqual(
    layout.tiles.map((tile) => tile.role),
    ['hands', 'skin-texture', 'hair-details', 'facial-features', 'body-details'],
  )
  assert.equal(layout.width, 4095)
  assert.equal(layout.height, 2738)
  assert.ok(layout.width <= 4096 && layout.height <= 4096)
  // Row-major: three tiles on the top row, two on the bottom. A 1024 tile sits centred in its
  // 1333 px cell, so its origin is inset by (1333 - 1024) / 2.
  assert.deepEqual(
    layout.tiles.map((tile) => [tile.x, tile.y]),
    [
      [178, 178],
      [1535, 178],
      [2892, 178],
      [178, 1535],
      [1535, 1535],
    ],
  )
})

test('an empty board has no tiles and nothing is ever enlarged', () => {
  assert.deepEqual(boardLayout(BOARD_TILES.details, {}, BOARD_GRID.details), {
    width: 0,
    height: 0,
    tiles: [],
  })
  const small = boardLayout(['hands'], { hands: { width: 300, height: 200 } }, BOARD_GRID.face)
  assert.deepEqual([small.tiles[0]?.w, small.tiles[0]?.h], [300, 200])
})

test('a freeform box may leave its quadrant, clamped to the image and the 256 px minimum', () => {
  const size = { width: 4096, height: 4096 }
  const across = clampCropRegion({ source: 'face-panel', x: 1500, y: 60, w: 2200, h: 1900 }, size)
  // Spans the quadrant line: this is allowed, only the edges clamp.
  assert.deepEqual(across, { source: 'face-panel', x: 1500, y: 60, w: 2200, h: 1900 })

  assert.deepEqual(clampCropRegion({ source: 'face-panel', x: -80, y: -80, w: 2048, h: 2048 }, size), {
    source: 'face-panel',
    x: 0,
    y: 0,
    w: 2048,
    h: 2048,
  })
  assert.deepEqual(clampCropRegion({ source: 'face-panel', x: 4000, y: 4000, w: 2048, h: 2048 }, size), {
    source: 'face-panel',
    x: 2048,
    y: 2048,
    w: 2048,
    h: 2048,
  })
  assert.deepEqual(clampCropRegion({ source: 'face-panel', x: 10, y: 10, w: 40, h: 40 }, size), {
    source: 'face-panel',
    x: 10,
    y: 10,
    w: 256,
    h: 256,
  })
})

test('a role knows when it is back on the default box', () => {
  assert.equal(isDefaultCropRegion('body-side', CROP_REGION_DEFAULTS['body-side']), true)
  assert.equal(isDefaultCropRegion('body-side', { ...CROP_REGION_DEFAULTS['body-side'], y: 64 }), false)
})
