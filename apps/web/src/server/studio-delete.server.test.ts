import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

const dataDir = mkdtempSync(join(tmpdir(), 'sunnygen-studio-delete-'))
process.env.SUNNYGEN_DATA_DIR = dataDir
process.env.SUNNYGEN_MEDIA_DIR = join(dataDir, 'media')

const {
  closeDb,
  createGeneration,
  getAsset,
  getGeneration,
  getStudioItem,
  mediaDir,
  saveStudioItem,
  updateGeneration,
} = await import('@sunnygen/db')
const { storeBuffer, toInputAssets } = await import('./media.server')
const { deleteStudioItemWithAssets } = await import('./studio-assets.server')

after(() => {
  closeDb()
  rmSync(dataDir, { recursive: true, force: true })
})

let counter = 0

async function mediaFile(source: 'upload' | 'studio' | 'generated' = 'upload') {
  counter += 1
  return storeBuffer({
    buffer: Buffer.from(`studio-file-${counter}`),
    mime: 'image/png',
    kind: 'image',
    source,
    unique: true,
  })
}

test('deleting a studio item removes its unshared files and keeps a shared one', async () => {
  const body = await mediaFile()
  const shared = await mediaFile()
  const avatar = saveStudioItem({
    kind: 'avatar',
    name: 'Mina',
    assetId: body.id,
    data: { characterSheetAssetId: shared.id },
  })
  saveStudioItem({ kind: 'garment', name: 'Shared shirt', assetId: shared.id })

  const result = await deleteStudioItemWithAssets(avatar.id)

  assert.equal(getStudioItem(avatar.id), null)
  assert.equal(getAsset(body.id), null)
  assert.equal(getAsset(shared.id)?.id, shared.id)
  assert.equal(result.deletedAssets, 1)
  await assert.rejects(access(join(mediaDir, body.path)))
  await access(join(mediaDir, shared.path))
})

test('a generation with a deleted input still loads and lists the input as missing', async () => {
  const input = await mediaFile()
  const output = await mediaFile('generated')
  const pose = saveStudioItem({ kind: 'pose', name: 'Leaning on a rail', assetId: input.id })
  const generation = createGeneration({
    kind: 'image',
    provider: 'fal',
    model: 'nano-banana-2',
    prompt: 'white studio',
    inputAssetIds: [input.id],
  })
  updateGeneration(generation.id, { status: 'succeeded', outputAssetIds: [output.id] })

  await deleteStudioItemWithAssets(pose.id)

  const loaded = getGeneration(generation.id)
  assert.ok(loaded)
  assert.deepEqual(loaded.outputAssetIds, [output.id])
  // What the references modal and the wall get for the deleted input: a placeholder entry.
  assert.deepEqual(toInputAssets(loaded.inputAssetIds, new Map()), [
    {
      id: input.id,
      kind: 'image',
      url: `/api/media/${input.id}`,
      width: null,
      height: null,
      missing: true,
    },
  ])
  await access(join(mediaDir, output.path))
})
