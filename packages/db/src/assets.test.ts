import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import type { AssetSource } from '@sunnygen/core'

const dataDir = mkdtempSync(join(tmpdir(), 'sunnygen-assets-'))
process.env.SUNNYGEN_DATA_DIR = dataDir

const { closeDb } = await import('./database')
const { saveStudioItem } = await import('./repositories/studio')
const { createFolder } = await import('./repositories/folders')
const {
  countAssets,
  createAsset,
  findAssetBySha256,
  getAsset,
  getAssetsByIds,
  listAssets,
  sanitizeAssetName,
  selectStudioUploads,
  uniqueAssetName,
} = await import('./repositories/assets')

after(() => {
  closeDb()
  rmSync(dataDir, { recursive: true, force: true })
})

let counter = 0

function asset(
  source: AssetSource,
  options: { sha256?: string; name?: string; unique?: boolean; nsfw?: boolean } = {},
) {
  counter += 1
  return createAsset({
    kind: 'image',
    mime: 'image/png',
    byteSize: 16,
    sha256: options.sha256 ?? `sha-${counter}`,
    source,
    path: `2026/11/${counter}.png`,
    name: options.name ?? null,
    unique: options.unique ?? false,
    nsfw: options.nsfw ?? false,
  })
}

test('a user upload always inserts a new row, even for identical bytes', () => {
  const first = asset('upload', { sha256: 'sha-same', name: 'door-photo.jpg', unique: true })
  const second = asset('upload', { sha256: 'sha-same', name: 'door-photo.jpg', unique: true })

  assert.notEqual(second.id, first.id)
  assert.equal(first.name, 'door-photo.jpg')
  assert.match(
    String(second.name),
    /^door-photo-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/,
  )
})

test('internal callers still reuse the asset for the same bytes', () => {
  const first = asset('generated', { sha256: 'sha-shared' })
  const second = asset('generated', { sha256: 'sha-shared' })
  assert.equal(second.id, first.id)
  assert.equal(second.name, null)
})

test('a name is only set when the caller passes one', () => {
  assert.equal(asset('upload', { name: 'with-name.png', unique: true }).name, 'with-name.png')
  assert.equal(asset('upload', { unique: true }).name, null)
})

test('names are sanitised and a taken name gets a uuid before the extension', () => {
  assert.equal(sanitizeAssetName('../../etc/passwd'), 'passwd')
  assert.equal(sanitizeAssetName('  spaces  .png '), 'spaces  .png')
  assert.equal(sanitizeAssetName(''), 'upload')
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
  assert.match(uniqueAssetName('door-photo.jpg'), new RegExp(`^door-photo-${uuid}\\.jpg$`))
  assert.match(uniqueAssetName('noext'), new RegExp(`^noext-${uuid}$`))
  assert.notEqual(uniqueAssetName('door-photo.jpg'), uniqueAssetName('door-photo.jpg'))
})

test('the studio upload selection skips crop assets', () => {
  const rows = [
    { id: 'studio-upload', source: 'studio' },
    { id: 'crop', source: 'studio' },
    { id: 'render', source: 'generated' },
  ]
  assert.deepEqual(selectStudioUploads(rows, new Set(['crop'])), ['studio-upload'])
})

test('safe reads hide NSFW rows and NSFW mode returns them', () => {
  const safe = asset('upload', { unique: true })
  const hidden = asset('upload', { unique: true, nsfw: true })

  const safeList = listAssets({ limit: 1000 })
  assert.ok(safeList.some((row) => row.id === safe.id))
  assert.equal(
    safeList.some((row) => row.id === hidden.id),
    false,
  )
  assert.equal(
    safeList.every((row) => row.nsfw === false),
    true,
  )

  const allList = listAssets({ limit: 1000, includeNsfw: true })
  assert.ok(allList.some((row) => row.id === hidden.id))
  assert.equal(allList.find((row) => row.id === hidden.id)?.nsfw, true)
})

test('safe counts agree with safe lists', () => {
  const safeCount = countAssets()
  const allCount = countAssets({ includeNsfw: true })
  assert.ok(allCount > safeCount)
  assert.equal(
    allCount - safeCount,
    listAssets({ limit: 1000, includeNsfw: true }).filter((row) => row.nsfw).length,
  )
})

test('by-id reads refuse an NSFW asset unless the caller asks for it', () => {
  const hidden = asset('upload', { unique: true, nsfw: true })

  assert.equal(getAsset(hidden.id), null)
  assert.equal(getAsset(hidden.id, { includeNsfw: true })?.id, hidden.id)
  assert.deepEqual(getAssetsByIds([hidden.id]), [])
  assert.deepEqual(
    getAssetsByIds([hidden.id], { includeNsfw: true }).map((row) => row.id),
    [hidden.id],
  )
  // The poller and the media pipeline resolve rows they already own by id.
  assert.equal(getAsset(hidden.id, { includeNsfw: true })?.nsfw, true)
})

test('an upload only reuses the row of its own visibility class', () => {
  const hidden = asset('generated', { sha256: 'sha-visible-split', nsfw: true })
  assert.equal(findAssetBySha256('sha-visible-split', false), null)
  assert.equal(findAssetBySha256('sha-visible-split', true)?.id, hidden.id)

  const safe = asset('generated', { sha256: 'sha-visible-split', nsfw: false })
  assert.notEqual(safe.id, hidden.id)
  assert.equal(safe.nsfw, false)
  assert.equal(findAssetBySha256('sha-visible-split', false)?.id, safe.id)
})

test('the studio exclusion still hides studio-owned files from the library and its count', () => {
  const owned = asset('studio', { unique: true })
  const library = asset('upload', { unique: true })
  saveStudioItem({ kind: 'garment', name: 'Owned file', assetId: owned.id })

  // The exclusion is opt-in: without it a studio file is still a row in the library query.
  const listed = listAssets({ limit: 1000 }).map((row) => row.id)
  assert.ok(listed.includes(owned.id))

  const libraryOnly = listAssets({ limit: 1000, excludeStudioAssets: true }).map((row) => row.id)
  assert.equal(libraryOnly.includes(owned.id), false)
  assert.ok(libraryOnly.includes(library.id))
  assert.equal(countAssets({ excludeStudioAssets: true }), countAssets() - 1)
})

test('folder scoping keeps unassigned and named folders apart', () => {
  const unassigned = asset('upload', { unique: true })
  const folder = createFolder({ name: 'Scoped folder' })
  const inFolder = createAsset({
    kind: 'image',
    mime: 'image/png',
    byteSize: 16,
    sha256: 'sha-folder-scope',
    source: 'upload',
    path: '2026/11/folder.png',
    folderId: folder.id,
    unique: true,
  })

  const loose = listAssets({ folderId: null, limit: 1000 }).map((row) => row.id)
  assert.ok(loose.includes(unassigned.id))
  assert.equal(loose.includes(inFolder.id), false)

  const scoped = listAssets({ folderId: folder.id, limit: 1000 }).map((row) => row.id)
  assert.deepEqual(scoped, [inFolder.id])

  const all = listAssets({ limit: 1000 }).map((row) => row.id)
  assert.ok(all.includes(unassigned.id))
  assert.ok(all.includes(inFolder.id))
})
