import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

const dataDir = mkdtempSync(join(tmpdir(), 'sunnygen-generations-'))
process.env.SUNNYGEN_DATA_DIR = dataDir

const { closeDb } = await import('./database')
const { createGeneration, deleteFailedGenerations, getGeneration, updateGeneration } = await import(
  './repositories/generations'
)

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
