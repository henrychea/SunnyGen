import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import {
  CROP_REGION_DEFAULTS,
  CROP_REGION_ROLES,
  DEFAULT_AVATAR_PROFILE,
  defaultCropRegions,
  isDefaultCropRegion,
  parseCropRegions,
} from '@sunnygen/core'
import sharp from 'sharp'

const dataDir = mkdtempSync(join(tmpdir(), 'sunnygen-crops-'))
process.env.SUNNYGEN_DATA_DIR = dataDir
process.env.SUNNYGEN_MEDIA_DIR = join(dataDir, 'media')

const { closeDb, createGeneration, getAsset, getStudioItem, saveStudioItem } = await import('@sunnygen/db')
const { storeBuffer } = await import('./media.server')
const { clampRegions, dataForPanelChange, deleteDerivedAssets, saveAvatarRegions } =
  await import('./avatar-crops.server')

after(() => {
  closeDb()
  rmSync(dataDir, { recursive: true, force: true })
})

let shade = 0

async function image(width: number, height: number, source: 'studio' | 'upload' = 'studio') {
  // Distinct bytes per image: storeBuffer dedupes by sha256, and identical test images would
  // collapse every tile onto one asset.
  shade = (shade + 17) % 255
  // A gradient, not a flat colour: same-size regions cut from one image must still differ, or
  // storeBuffer's sha256 dedupe folds them onto a single asset.
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#${(80 + shade).toString(16).padStart(2, '0')}4040"/>
      <stop offset="0.5" stop-color="#408040"/>
      <stop offset="1" stop-color="#4040${(80 + shade).toString(16).padStart(2, '0')}"/>
    </linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
  </svg>`
  const buffer = await sharp(Buffer.from(svg)).png().toBuffer()
  const asset = await storeBuffer({ buffer, mime: 'image/png', kind: 'image', source })
  return asset.id
}

async function avatar(name: string) {
  const sheet = await image(4096, 3072)
  const body = await image(4096, 4096)
  const face = await image(4096, 4096)
  const item = saveStudioItem({
    kind: 'avatar',
    name,
    assetId: body,
    data: { avatarProfile: DEFAULT_AVATAR_PROFILE, characterSheetAssetId: sheet, facePanelAssetId: face },
  })
  return { item, sheet, body, face }
}

test('Generate crops cuts every role from the default boxes and composes the boards', async () => {
  const { item } = await avatar('Auto')
  const created = getStudioItem(item.id)
  assert.ok(created)

  const dto = await saveAvatarRegions(created, defaultCropRegions())

  assert.deepEqual(
    dto.tiles.map((tile) => tile.role),
    [...CROP_REGION_ROLES],
  )
  // Panels give 2048 px quadrants; the sheet's fixed boxes give 1024 x 1024 and 2048 x 1024.
  assert.equal(dto.tiles.find((crop) => crop.role === 'body-front')?.width, 2048)
  assert.equal(dto.tiles.find((crop) => crop.role === 'expressions')?.width, 1024)
  assert.equal(dto.tiles.find((crop) => crop.role === 'body-details')?.width, 2048)
  assert.equal(dto.tiles.find((crop) => crop.role === 'body-details')?.height, 1024)
  assert.deepEqual(
    dto.boards.map((board) => [board.role, board.width, board.height]),
    [
      ['face', 4096, 4096],
      ['body', 4096, 4096],
      ['details', 4095, 2738],
    ],
  )
})

test('a freeform box may cross a quadrant line and is clamped at the edges', async () => {
  // Crossing the quadrant line is accepted exactly as drawn.
  const drawn = defaultCropRegions()
  drawn['face-front'] = { source: 'face-panel', x: 1500, y: 60, w: 2200, h: 1900 }
  const accepted = clampRegions(drawn)
  assert.deepEqual(accepted?.['face-front'], { source: 'face-panel', x: 1500, y: 60, w: 2200, h: 1900 })
  assert.ok(parseCropRegions(accepted))

  // Hanging over the edge and below the minimum is pulled back in, not rejected.
  const sloppy = defaultCropRegions()
  sloppy['face-front'] = { source: 'face-panel', x: 4000, y: -40, w: 40, h: 40 }
  // It keeps the box as close to where it was drawn as the edge allows.
  assert.deepEqual(clampRegions(sloppy)?.['face-front'], {
    source: 'face-panel',
    x: 3840,
    y: 0,
    w: 256,
    h: 256,
  })

  const { item } = await avatar('Freeform')
  const created = getStudioItem(item.id)
  const dto = await saveAvatarRegions(
    created as NonNullable<typeof created>,
    accepted as NonNullable<typeof accepted>,
  )
  const tile = dto.tiles.find((crop) => crop.role === 'face-front')
  assert.deepEqual([tile?.width, tile?.height], [2200, 1900])
})

test('Reset puts a role back on the default box', async () => {
  const { item } = await avatar('Reset')
  const created = getStudioItem(item.id)
  const moved = defaultCropRegions()
  moved['body-side'] = { source: 'body-panel', x: 1024, y: 400, w: 2600, h: 3000 }

  const overridden = await saveAvatarRegions(created as NonNullable<typeof created>, moved)
  assert.equal(isDefaultCropRegion('body-side', overridden.regions['body-side']), false)
  assert.equal(overridden.regions['body-side'].x, 1024)

  const resetRegions = { ...overridden.regions }
  resetRegions['body-side'] = CROP_REGION_DEFAULTS['body-side']
  const reset = await saveAvatarRegions(
    getStudioItem(item.id) as NonNullable<ReturnType<typeof getStudioItem>>,
    resetRegions,
  )
  assert.deepEqual(reset.regions['body-side'], CROP_REGION_DEFAULTS['body-side'])
  assert.equal(isDefaultCropRegion('body-side', reset.regions['body-side']), true)
  assert.equal(reset.tiles.find((crop) => crop.role === 'body-side')?.width, 2048)
})

test('a panel change drops the boxes and boards in the data it saves', () => {
  const data = { cropRegions: { hands: {} }, boards: [{ role: 'face' }], crops: [{ role: 'hands' }] }
  const next = dataForPanelChange(data, true)
  assert.equal(next.cropRegions, undefined)
  assert.equal(next.boards, undefined)
  assert.equal(next.crops, undefined)
})

test('derived tiles and boards are deleted only when nothing else references them', async () => {
  const { item } = await avatar('Orphans')
  const created = getStudioItem(item.id)
  const withDerived = await saveAvatarRegions(created as NonNullable<typeof created>, defaultCropRegions())
  const tiles = withDerived.tiles
  const boards = withDerived.boards

  // A generation still points at one tile, and one tile is a user upload: both must survive.
  const referencedTile = tiles[0]?.assetId as string
  createGeneration({
    kind: 'image',
    provider: 'fal',
    model: 'fal-ai/nano-banana-pro',
    prompt: 'kept',
    params: {},
    inputAssetIds: [referencedTile],
  })
  const uploadTile = await image(512, 512, 'upload')
  const uploadCropData = {
    cropTiles: [...tiles, { role: 'hands', assetId: uploadTile, width: 512, height: 512 }],
    boards,
  }

  const deleted = await deleteDerivedAssets(item.id, uploadCropData)

  assert.equal(deleted.includes(referencedTile), false)
  assert.equal(getAsset(referencedTile) !== null, true)
  assert.equal(deleted.includes(uploadTile), false)
  assert.equal(getAsset(uploadTile) !== null, true)
  // Everything else that this avatar cut is gone. Identical cuts dedupe onto one asset, so work
  // from the unique ids and never from a tile's position.
  const unreferenced = [...new Set(tiles.map((tile) => tile.assetId))].filter(
    (id) => id !== referencedTile && id !== uploadTile,
  )
  assert.ok(unreferenced.every((id) => deleted.includes(id)))
  assert.deepEqual(
    boards.map((board) => board.assetId).filter((id) => !deleted.includes(id)),
    [],
  )
})
