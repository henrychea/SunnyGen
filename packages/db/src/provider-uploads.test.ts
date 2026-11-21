import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

const dataDir = mkdtempSync(join(tmpdir(), 'sunnygen-uploads-'))
process.env.SUNNYGEN_DATA_DIR = dataDir

const { closeDb } = await import('./database')
const { deleteProviderUpload, readProviderUpload, saveProviderUpload } =
  await import('./repositories/provider-uploads')

after(() => {
  closeDb()
  rmSync(dataDir, { recursive: true, force: true })
})

test('a stored upload keeps its provider URL and expiry', () => {
  const expiresAt = Date.now() + 60_000
  saveProviderUpload('fal', 'hash-1', 'https://cdn.test/1.png', expiresAt)
  assert.deepEqual(readProviderUpload('fal', 'hash-1'), {
    url: 'https://cdn.test/1.png',
    expiresAt,
  })
})

test('uploads are keyed per provider so Sunra and fal URLs never mix', () => {
  saveProviderUpload('fal', 'hash-2', 'https://cdn.test/fal.png', null)
  saveProviderUpload('sunra', 'hash-2', 'https://assets.test/sunra.png', null)
  assert.equal(readProviderUpload('fal', 'hash-2')?.url, 'https://cdn.test/fal.png')
  assert.equal(readProviderUpload('sunra', 'hash-2')?.url, 'https://assets.test/sunra.png')
  assert.equal(readProviderUpload('azure', 'hash-2'), null)
})

test('re-uploading the same asset replaces the old URL', () => {
  saveProviderUpload('fal', 'hash-3', 'https://cdn.test/old.png', Date.now() - 1)
  saveProviderUpload('fal', 'hash-3', 'https://cdn.test/new.png', Date.now() + 60_000)
  assert.equal(readProviderUpload('fal', 'hash-3')?.url, 'https://cdn.test/new.png')
})

test('a rejected URL can be dropped', () => {
  saveProviderUpload('sunra', 'hash-4', 'https://assets.test/4.png', null)
  deleteProviderUpload('sunra', 'hash-4')
  assert.equal(readProviderUpload('sunra', 'hash-4'), null)
})
