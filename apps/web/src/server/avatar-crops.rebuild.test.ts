import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { DEFAULT_AVATAR_PROFILE, parseAvatarCrops } from '@sunnygen/core'
import sharp from 'sharp'

const dataDir = mkdtempSync(join(tmpdir(), 'sunnygen-crops-'))
process.env.SUNNYGEN_DATA_DIR = dataDir
process.env.SUNNYGEN_MEDIA_DIR = join(dataDir, 'media')

const { closeDb, getStudioItem, saveStudioItem } = await import('@sunnygen/db')
const { storeBuffer } = await import('./media.server')
const { dataForPanelChange, ensureAvatarCrops } = await import('./avatar-crops.server')

after(() => {
  closeDb()
  rmSync(dataDir, { recursive: true, force: true })
})

const STALE = [{ role: 'face-front', assetId: 'crop-from-the-old-panel', width: 256, height: 256 }]

async function panelAsset(width: number, height: number): Promise<string> {
  const buffer = await sharp({
    create: { width, height, channels: 3, background: { r: 190, g: 140, b: 120 } },
  })
    .png()
    .toBuffer()
  const asset = await storeBuffer({ buffer, mime: 'image/png', kind: 'image', source: 'studio' })
  return asset.id
}

test('an avatar saved with an empty crop list crops its 4K panel instead', async () => {
  const panel = await panelAsset(4096, 4096)
  const created = saveStudioItem({
    kind: 'avatar',
    name: 'B1',
    assetId: panel,
    data: { avatarProfile: DEFAULT_AVATAR_PROFILE, crops: [] },
  })

  const crops = await ensureAvatarCrops(created)

  assert.equal(crops?.length, 3)
  assert.equal(parseAvatarCrops(getStudioItem(created.id)?.data.crops)?.length, 3)
})

test('a save that seals a new 4K panel rebuilds three crops from that panel', async () => {
  const oldPanel = await panelAsset(4096, 4096)
  const newPanel = await panelAsset(5000, 4096)
  const created = saveStudioItem({
    kind: 'avatar',
    name: 'B1.1',
    assetId: oldPanel,
    data: { avatarProfile: DEFAULT_AVATAR_PROFILE, crops: STALE },
  })

  // The editor posts the item's data back with the new panel; the save drops the old crops.
  const resaved = saveStudioItem({
    id: created.id,
    kind: 'avatar',
    name: created.name,
    assetId: newPanel,
    data: dataForPanelChange({ ...created.data, crops: STALE }, true),
  })
  const crops = await ensureAvatarCrops(resaved)

  assert.deepEqual(
    crops?.map((crop) => crop.role),
    ['face-front', 'face-three-quarter', 'body-front'],
  )
  // Cells come from the new 5000 px panel, not the 4096 one it replaced.
  assert.ok(crops?.every((crop) => crop.width === 1250 && crop.height === 1024))
  const stored = getStudioItem(created.id)
  assert.equal(stored?.assetId, newPanel)
  assert.equal(parseAvatarCrops(stored?.data.crops)?.length, 3)
})
