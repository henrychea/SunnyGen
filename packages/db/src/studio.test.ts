import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import type { AssetSource } from '@sunnygen/core'

const dataDir = mkdtempSync(join(tmpdir(), 'sunnygen-studio-'))
process.env.SUNNYGEN_DATA_DIR = dataDir

const { closeDb } = await import('./database')
const { countAssets, createAsset, listAssets } = await import('./repositories/assets')
const { createFolder } = await import('./repositories/folders')
const { saveStudioItem, studioItemAssetIds } = await import('./repositories/studio')

after(() => {
  closeDb()
  rmSync(dataDir, { recursive: true, force: true })
})

let counter = 0

function asset(source: AssetSource, folderId: string | null = null) {
  counter += 1
  return createAsset({
    kind: 'image',
    mime: 'image/png',
    byteSize: 16,
    sha256: `sha-${counter}`,
    source,
    path: `2026/11/${counter}.png`,
    folderId,
  })
}

test('one walk collects every asset id a studio item keeps, at any depth', () => {
  const body = asset('upload')
  const cleanBody = asset('upload')
  const item = saveStudioItem({
    kind: 'avatar',
    name: 'Mina',
    assetId: body.id,
    cleanAssetId: cleanBody.id,
    data: {
      characterSheetAssetId: 'sheet',
      facePanelAssetId: 'face-panel',
      views: [{ angle: 'front', assetId: 'view', cleanAssetId: 'clean-view' }],
      crops: [{ role: 'face-front', assetId: 'crop' }],
      cropTiles: [{ role: 'face-front', assetId: 'tile' }],
      boards: [{ role: 'face', assetId: 'board' }],
      lora: { assetId: 'lora', version: 1 },
      cropRegions: { face: { x: 0, y: 0, w: 10, h: 10 } },
    },
  })

  assert.deepEqual(
    new Set(studioItemAssetIds(item)),
    new Set([
      body.id,
      cleanBody.id,
      'sheet',
      'face-panel',
      'view',
      'clean-view',
      'crop',
      'tile',
      'board',
      'lora',
    ]),
  )
})

test('the asset library hides one studio asset per kind and keeps an unrelated upload', () => {
  const folder = createFolder({ name: 'Shoots' })
  const avatarSheet = asset('upload', folder.id)
  const garmentPhoto = asset('upload', folder.id)
  const posePhoto = asset('upload', folder.id)
  const scenePhoto = asset('upload', folder.id)
  const unrelated = asset('upload', folder.id)

  saveStudioItem({
    kind: 'avatar',
    name: 'Mina',
    assetId: avatarSheet.id,
    data: { characterSheetAssetId: avatarSheet.id },
  })
  saveStudioItem({ kind: 'garment', name: 'Linen shirt', assetId: garmentPhoto.id })
  saveStudioItem({ kind: 'pose', name: 'Hands in pockets', assetId: posePhoto.id })
  saveStudioItem({ kind: 'scene', name: 'Loft', assetId: scenePhoto.id })

  const hidden = [avatarSheet.id, garmentPhoto.id, posePhoto.id, scenePhoto.id]
  const all = listAssets({ limit: 1000 }).map((entry) => entry.id)
  const visible = listAssets({ limit: 1000, excludeStudioAssets: true }).map((entry) => entry.id)

  for (const id of hidden) {
    assert.ok(all.includes(id), 'the file exists in the database')
    assert.ok(!visible.includes(id), 'the library leaves it to the Studio')
  }
  assert.ok(visible.includes(unrelated.id))

  // The folder view and the counts see the same visible list.
  assert.deepEqual(
    listAssets({ limit: 1000, folderId: folder.id, excludeStudioAssets: true }).map((entry) => entry.id),
    [unrelated.id],
  )
  assert.equal(countAssets({ excludeStudioAssets: true }), visible.length)
  assert.equal(countAssets(), all.length)
})
