import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import {
  AVATAR_CROP_ROLES,
  DEFAULT_AVATAR_PROFILE,
  defaultAvatarCropCells,
  parseAvatarCropCells,
} from '@sunnygen/core'
import sharp from 'sharp'

const dataDir = mkdtempSync(join(tmpdir(), 'sunnygen-crops-'))
process.env.SUNNYGEN_DATA_DIR = dataDir
process.env.SUNNYGEN_MEDIA_DIR = join(dataDir, 'media')

const { closeDb, getStudioItem, saveStudioItem } = await import('@sunnygen/db')
const { storeBuffer } = await import('./media.server')
const { avatarCropsDto, avatarRegionsDto, dataForPanelChange, saveAvatarCrops, saveAvatarRegions } =
  await import('./avatar-crops.server')

after(() => {
  closeDb()
  rmSync(dataDir, { recursive: true, force: true })
})

async function timelineAsset(width: number, height: number): Promise<string> {
  const buffer = await sharp({
    create: { width, height, channels: 3, background: { r: 190, g: 140, b: 120 } },
  })
    .png()
    .toBuffer()
  const asset = await storeBuffer({ buffer, mime: 'image/png', kind: 'image', source: 'studio' })
  return asset.id
}

async function avatar(name: string) {
  const panel = await timelineAsset(4096, 4096)
  return saveStudioItem({
    kind: 'avatar',
    name,
    assetId: panel,
    data: { avatarProfile: DEFAULT_AVATAR_PROFILE },
  })
}

test('saving cells cuts one crop per role from the panel', async () => {
  const created = await avatar('B1')
  assert.deepEqual(avatarCropsDto(created).crops, [])

  const dto = await saveAvatarCrops(created, defaultAvatarCropCells())

  assert.deepEqual(
    dto.crops.map((crop) => crop.role),
    [...AVATAR_CROP_ROLES],
  )
  assert.ok(dto.crops.every((crop) => crop.width === 1024 && crop.height === 1024))
  assert.deepEqual(dto.cropCells, defaultAvatarCropCells())
  assert.deepEqual(parseAvatarCropCells(getStudioItem(created.id)?.data.cropCells), defaultAvatarCropCells())
})

test('the cells the owner picked are the cells that get cut and stored', async () => {
  const created = await avatar('B1.1')
  const cells = { ...defaultAvatarCropCells(), 'body-side': { row: 3, column: 3 } }

  const dto = await saveAvatarCrops(created, cells)

  assert.deepEqual(dto.cropCells, cells)
  assert.deepEqual(parseAvatarCropCells(getStudioItem(created.id)?.data.cropCells), cells)
  assert.equal(dto.crops.length, AVATAR_CROP_ROLES.length)
})

test('a changed panel starts again with no crops until the owner picks cells', async () => {
  const created = await avatar('B2')
  await saveAvatarCrops(created, defaultAvatarCropCells())
  const cropped = getStudioItem(created.id)
  assert.equal(avatarCropsDto(cropped as NonNullable<typeof cropped>).crops.length, 4)

  // What saveStudioItemFn does when the editor posts a different panel.
  const cleared = dataForPanelChange(cropped?.data ?? {}, true)
  const resaved = saveStudioItem({
    id: created.id,
    kind: 'avatar',
    name: created.name,
    assetId: await timelineAsset(4096, 4096),
    data: cleared,
  })

  assert.deepEqual(avatarCropsDto(resaved).crops, [])
  assert.equal(resaved.data.cropCells, undefined)
})

test('swapping the two panels keeps both images and drops the stale regions and boards', async () => {
  const sheetId = await timelineAsset(4096, 3072)
  const bodyId = await timelineAsset(4096, 4096)
  const faceId = await timelineAsset(4096, 4096)
  const created = saveStudioItem({
    kind: 'avatar',
    name: 'Swapped',
    assetId: bodyId,
    data: {
      avatarProfile: DEFAULT_AVATAR_PROFILE,
      characterSheetAssetId: sheetId,
      facePanelAssetId: faceId,
    },
  })
  const withBoards = await saveAvatarRegions(created, avatarRegionsDto(created).regions)
  assert.equal(withBoards.boards.length, 3)
  assert.equal(getStudioItem(created.id)?.data.cropRegions === undefined, false)

  // The owner put the files in the wrong slots: exchange item.assetId and data.facePanelAssetId,
  // and treat it as a panel change, which is what saveStudioItemFn does.
  const swapped = saveStudioItem({
    id: created.id,
    kind: 'avatar',
    name: created.name,
    assetId: faceId,
    data: dataForPanelChange({ ...getStudioItem(created.id)?.data, facePanelAssetId: bodyId }, true),
  })

  assert.equal(swapped.assetId, faceId)
  assert.equal(swapped.data.facePanelAssetId, bodyId)
  assert.equal(swapped.data.cropRegions, undefined)
  assert.equal(swapped.data.boards, undefined)
  assert.equal(swapped.data.crops, undefined)
  assert.equal(swapped.data.cropCells, undefined)
  // It is still a two-panel avatar, not a legacy one.
  assert.equal(avatarRegionsDto(swapped).legacy, false)
})
