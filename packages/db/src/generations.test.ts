import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

const dataDir = mkdtempSync(join(tmpdir(), 'sunnygen-generations-'))
process.env.SUNNYGEN_DATA_DIR = dataDir

const { closeDb } = await import('./database')
const { createFolder } = await import('./repositories/folders')
const {
  countGenerations,
  createGeneration,
  deleteFailedGenerations,
  getGeneration,
  listGenerations,
  updateGeneration,
} = await import('./repositories/generations')

after(() => {
  closeDb()
  rmSync(dataDir, { recursive: true, force: true })
})

test('deleteFailedGenerations removes failed rows without touching successful ones', () => {
  const failed = createGeneration({
    kind: 'image',
    provider: 'sunra',
    model: 'gpt-image-2',
    prompt: 'failed render',
  })
  updateGeneration(failed.id, { status: 'failed', error: 'moderation blocked' })

  const succeeded = createGeneration({
    kind: 'image',
    provider: 'sunra',
    model: 'gpt-image-2',
    prompt: 'successful render',
  })
  updateGeneration(succeeded.id, { status: 'succeeded' })

  assert.equal(deleteFailedGenerations(), 1)
  assert.equal(getGeneration(failed.id), null)
  assert.equal(getGeneration(succeeded.id)?.status, 'succeeded')
})

function generation(options: { prompt: string; nsfw?: boolean }): string {
  return createGeneration({
    kind: 'image',
    provider: 'sunra',
    model: 'gpt-image-2',
    prompt: options.prompt,
    nsfw: options.nsfw ?? false,
  }).id
}

test('safe reads hide NSFW generations and NSFW mode returns them', () => {
  const safeId = generation({ prompt: 'safe render' })
  const hiddenId = generation({ prompt: 'hidden render', nsfw: true })
  updateGeneration(safeId, { status: 'succeeded' })
  updateGeneration(hiddenId, { status: 'succeeded' })

  const safeList = listGenerations({ status: 'succeeded', limit: 1000 })
  assert.ok(safeList.some((row) => row.id === safeId))
  assert.equal(
    safeList.some((row) => row.id === hiddenId),
    false,
  )
  assert.equal(
    safeList.every((row) => row.nsfw === false),
    true,
  )

  const allList = listGenerations({ status: 'succeeded', limit: 1000, includeNsfw: true })
  assert.ok(allList.some((row) => row.id === hiddenId))
  assert.equal(allList.find((row) => row.id === hiddenId)?.nsfw, true)
})

test('safe counts agree with safe lists', () => {
  const safeCount = countGenerations({ status: 'succeeded' })
  const allCount = countGenerations({ status: 'succeeded', includeNsfw: true })
  assert.equal(allCount - safeCount, 1)
})

test('by-id reads refuse an NSFW generation unless the caller asks for it', () => {
  const hiddenId = generation({ prompt: 'by-id hidden', nsfw: true })

  assert.equal(getGeneration(hiddenId), null)
  assert.equal(getGeneration(hiddenId, { includeNsfw: true })?.id, hiddenId)
  assert.equal(getGeneration(hiddenId, { includeNsfw: true })?.nsfw, true)
})

test('a partial update keeps every untouched column and clearing an error clears its details', () => {
  const id = generation({ prompt: 'partial update', nsfw: true })
  updateGeneration(id, {
    status: 'failed',
    error: 'provider exploded',
    errorCode: 'provider_error',
    errorReason: 'model_error',
    errorRetryable: true,
    params: { aspectRatio: '1:1' },
  })

  const retried = updateGeneration(id, { status: 'running' })
  assert.equal(retried?.status, 'running')
  assert.equal(retried?.prompt, 'partial update')
  assert.equal(retried?.nsfw, true)
  assert.deepEqual(retried?.params, { aspectRatio: '1:1' })
  assert.equal(retried?.error, 'provider exploded')
  assert.equal(retried?.errorCode, 'provider_error')

  const cleared = updateGeneration(id, { error: null })
  assert.equal(cleared?.error, null)
  assert.equal(cleared?.errorCode, null)
  assert.equal(cleared?.errorReason, null)
  assert.equal(cleared?.errorRetryable, null)
  assert.equal(cleared?.status, 'running')
  assert.equal(cleared?.nsfw, true)
})

test('an empty patch writes nothing', () => {
  const id = generation({ prompt: 'no-op' })
  const before = getGeneration(id, { includeNsfw: true })
  assert.deepEqual(updateGeneration(id, {}), before)
  assert.equal(updateGeneration('missing-row', {}), null)
})

test('kind, status and folder filters still narrow the list', () => {
  const folder = createFolder({ name: 'Filtered runs' })
  const inFolder = createGeneration({
    kind: 'video',
    provider: 'sunra',
    model: 'veo3',
    prompt: 'folder video',
    folderId: folder.id,
  })
  createGeneration({ kind: 'video', provider: 'sunra', model: 'veo3', prompt: 'loose video' })

  const scoped = listGenerations({ folderId: folder.id, limit: 1000 })
  assert.deepEqual(
    scoped.map((row) => row.id),
    [inFolder.id],
  )
  assert.equal(
    listGenerations({ kind: 'image', limit: 1000 }).some((row) => row.kind === 'video'),
    false,
  )
  assert.ok(countGenerations({ kind: 'video' }) >= 2)
  assert.equal(
    countGenerations({ status: 'succeeded', kind: 'video' }),
    listGenerations({ status: 'succeeded', kind: 'video', limit: 1000 }).length,
  )
})
