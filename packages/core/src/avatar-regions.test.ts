import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BOARD_TILES,
  CROP_REGION_DEFAULTS,
  CROP_REGION_ROLES,
  SHEET_REGION_BOXES,
  boardAssetIds,
  boardLayout,
  defaultCropRegions,
  parseAvatarBoards,
  parseCropRegions,
  plannedBoardAssets,
  regionsForSource,
  resetRegionsForSource,
  type AvatarBoard,
  type BoardTile,
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

test('a board is one row of tiles at a common height, inside 4096 and never enlarged', () => {
  const sizes = {
    'face-front': { width: 2048, height: 2048 },
    'face-three-quarter': { width: 2048, height: 2048 },
    'face-side': { width: 2048, height: 2048 },
    expressions: { width: 1024, height: 1024 },
  }
  const layout = boardLayout(BOARD_TILES.face, sizes)
  assert.deepEqual(
    layout.tiles.map((tile) => tile.role),
    ['face-front', 'face-three-quarter', 'face-side', 'expressions'],
  )
  // Three square 2048 tiles plus one 1024 tile at the same height would overflow, so the common
  // height shrinks until the row fits 4096.
  assert.ok(layout.width <= 4096)
  assert.ok(layout.height <= 4096)
  const heights = new Set(layout.tiles.map((tile) => tile.h))
  assert.equal(heights.size, 1)
  for (const tile of layout.tiles) {
    assert.ok(tile.x >= 24 && tile.x + tile.w <= 4096)
    assert.ok(tile.h <= 2048)
  }
  // Tiles sit side by side in order, with a gutter between them.
  for (let index = 1; index < layout.tiles.length; index += 1) {
    const previous = layout.tiles[index - 1] as BoardTile
    const current = layout.tiles[index] as BoardTile
    assert.equal(current.x, previous.x + previous.w + 24)
  }
})

test('a narrow board keeps the tiles at their source height and widens by their aspect', () => {
  const layout = boardLayout(
    ['body-front', 'body-side'],
    { 'body-front': { width: 2048, height: 2048 }, 'body-side': { width: 1024, height: 2048 } },
    { gutter: 0 },
  )
  assert.deepEqual(layout.tiles, [
    { role: 'body-front', x: 0, y: 0, w: 2048, h: 2048 },
    { role: 'body-side', x: 2048, y: 0, w: 1024, h: 2048 },
  ])
  assert.deepEqual(boardLayout(BOARD_TILES.details, {}), { width: 0, height: 0, tiles: [] })
})
