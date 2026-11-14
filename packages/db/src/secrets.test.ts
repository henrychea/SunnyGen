import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

const dataDir = mkdtempSync(join(tmpdir(), 'sunnygen-secrets-'))
process.env.SUNNYGEN_DATA_DIR = dataDir
delete process.env.SUNNYGEN_SECRET

// Dynamic imports are required: paths.ts resolves the data directory at import
// time, so the environment above must exist before the modules load.
const { decryptSecret, encryptSecret, isEncryptedSecret, migrateSecretRows } = await import('./secrets')
const { readSetting, writeSetting } = await import('./repositories/settings')
const { closeDb, getDb } = await import('./database')

after(() => {
  closeDb()
  rmSync(dataDir, { recursive: true, force: true })
})

function rawSetting(key: string): string {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? ''
}

test('encrypts and decrypts a secret', () => {
  const encrypted = encryptSecret('provider.sunra.key', 'sk-sunra-123')
  assert.ok(isEncryptedSecret(encrypted))
  assert.notEqual(encrypted, 'sk-sunra-123')
  assert.equal(decryptSecret('provider.sunra.key', encrypted), 'sk-sunra-123')
})

test('uses a fresh IV per encryption', () => {
  const first = encryptSecret('provider.fal.key', 'same-key')
  const second = encryptSecret('provider.fal.key', 'same-key')
  assert.notEqual(first, second)
  assert.equal(decryptSecret('provider.fal.key', first), 'same-key')
  assert.equal(decryptSecret('provider.fal.key', second), 'same-key')
})

test('rejects tampered ciphertext', () => {
  const encrypted = encryptSecret('provider.azure.key', 'azure-secret')
  const blob = Buffer.from(encrypted.slice('enc:v1:'.length), 'base64url')
  const last = blob.length - 1
  blob[last] = (blob[last] ?? 0) ^ 1
  const flipped = `enc:v1:${blob.toString('base64url')}`
  assert.throws(() => decryptSecret('provider.azure.key', flipped), /Cannot decrypt provider\.azure\.key/)
})

test('binds ciphertext to its setting name', () => {
  const encrypted = encryptSecret('provider.azure.key', 'azure-secret')
  assert.throws(() => decryptSecret('provider.azure.baseUrl', encrypted), /Cannot decrypt/)
})

test('creates an owner-only key file', () => {
  encryptSecret('provider.fal.key', 'key-file-check')
  const mode = statSync(join(dataDir, 'secrets.key')).mode & 0o777
  assert.equal(mode, 0o600)
})

test('repository encrypts secret settings and leaves others plaintext', () => {
  writeSetting('provider.sunra.key', 'sk-live-123')
  writeSetting('studio.prepModel', 'nano-banana-2')

  assert.match(rawSetting('provider.sunra.key'), /^enc:v1:/)
  assert.equal(rawSetting('studio.prepModel'), 'nano-banana-2')
  assert.equal(readSetting('provider.sunra.key'), 'sk-live-123')
  assert.equal(readSetting('studio.prepModel'), 'nano-banana-2')
})

test('migrates legacy plaintext credentials only', () => {
  const updates: Array<{ key: string; value: string }> = []
  const count = migrateSecretRows(
    [
      { key: 'provider.fal.key', value: 'legacy-fal' },
      { key: 'assistant.openrouter.key', value: 'legacy-openrouter' },
      { key: 'provider.sunra.key', value: encryptSecret('provider.sunra.key', 'already-encrypted') },
      { key: 'studio.prepModel', value: 'nano-banana-2' },
    ],
    (key, value) => updates.push({ key, value }),
  )

  assert.equal(count, 2)
  assert.deepEqual(
    updates.map((entry) => entry.key),
    ['provider.fal.key', 'assistant.openrouter.key'],
  )
  for (const entry of updates) {
    assert.ok(isEncryptedSecret(entry.value))
    assert.equal(decryptSecret(entry.key, entry.value).startsWith('legacy-'), true)
  }
})

test('encrypts plaintext credentials when the database opens', () => {
  getDb()
    .prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
    .run('assistant.openrouter.key', 'legacy-startup', Date.now())
  closeDb()
  getDb()

  assert.match(rawSetting('assistant.openrouter.key'), /^enc:v1:/)
  assert.equal(readSetting('assistant.openrouter.key'), 'legacy-startup')
})
