import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { DERIVED_AVATAR_KEYS } from '~/lib/avatar-derived'
import sharp from 'sharp'

const dataDir = mkdtempSync(join(tmpdir(), 'sunnygen-derived-'))
process.env.SUNNYGEN_DATA_DIR = dataDir
process.env.SUNNYGEN_MEDIA_DIR = join(dataDir, 'media')

const { closeDb, createGeneration, getAsset, saveStudioItem } = await import('@sunnygen/db')
const { storeBuffer } = await import('./media.server')
const { assertSheetSize, dataForPanelChange, deleteDerivedAssets, derivedAssetIds } =
  await import('./avatar-derived.server')

after(() => {
  closeDb()
  rmSync(dataDir, { recursive: true, force: true })
})

async function image(source: 'studio' | 'upload'): Promise<string> {
  const buffer = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 40, g: 80, b: 120 } },
  })
    .png()
    .toBuffer()
  const asset = await storeBuffer({ buffer, mime: 'image/png', kind: 'image', source, unique: true })
  return asset.id
}

test('a panel change drops every legacy derived key and keeps the rest', () => {
  const derived = Object.fromEntries(DERIVED_AVATAR_KEYS.map((key) => [key, [{ assetId: key }]]))
  const data = { ...derived, style: 'photoreal', characterSheetAssetId: 'sheet' }

  const next = dataForPanelChange(data, true)

  for (const key of DERIVED_AVATAR_KEYS) assert.equal(next[key], undefined, key)
  assert.deepEqual(next, { style: 'photoreal', characterSheetAssetId: 'sheet' })
  // Saving without a panel change keeps the data it was given.
  assert.deepEqual(dataForPanelChange(data, false), data)
})

test('derived ids cover the crops, the tiles and the boards of older avatars', () => {
  assert.deepEqual(
    derivedAssetIds({
      crops: [{ assetId: 'legacy-crop' }],
      cropTiles: [{ assetId: 'tile' }],
      boards: [{ assetId: 'board' }],
      cropCells: { 'face-front': { row: 1, column: 0 } },
    }).sort(),
    ['board', 'legacy-crop', 'tile'],
  )
  assert.deepEqual(derivedAssetIds({ style: 'photoreal' }), [])
})

test('only unreferenced studio derived files are deleted', async () => {
  const item = saveStudioItem({ kind: 'avatar', name: 'Orphans', assetId: await image('upload'), data: {} })
  const wanted = await image('studio')
  const referenced = await image('studio')
  const upload = await image('upload')
  createGeneration({
    kind: 'image',
    provider: 'fal',
    model: 'fal-ai/nano-banana-pro',
    prompt: 'kept',
    params: {},
    inputAssetIds: [referenced],
  })

  const deleted = await deleteDerivedAssets(item.id, {
    cropTiles: [{ assetId: wanted }, { assetId: referenced }, { assetId: upload }],
    boards: [{ assetId: wanted }],
  })

  assert.deepEqual(deleted, [wanted])
  assert.equal(getAsset(wanted), null)
  assert.notEqual(getAsset(referenced), null)
  assert.notEqual(getAsset(upload), null)
})

test('the sheet only has to reach 4096 px on its long side', () => {
  assert.doesNotThrow(() => assertSheetSize(4096, 3072))
  assert.doesNotThrow(() => assertSheetSize(3072, 4096))
  assert.throws(() => assertSheetSize(3000, 3072), /at least 4096 px on its long side/)
  assert.throws(() => assertSheetSize(null, null), /this one is \? x \?/)
})
