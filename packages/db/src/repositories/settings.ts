import { getDb } from '../database'
import { decryptSecret, encryptSecret, isSecretSetting } from '../secrets'

export function readSetting(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  if (!row) return null
  return isSecretSetting(key) ? decryptSecret(key, row.value) : row.value
}

export function writeSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(key, isSecretSetting(key) ? encryptSecret(key, value) : value, Date.now())
}

export function deleteSetting(key: string): void {
  getDb().prepare('DELETE FROM settings WHERE key = ?').run(key)
}

export function listSettings(): Record<string, string> {
  const rows = getDb().prepare('SELECT key, value FROM settings ORDER BY key').all() as Array<{
    key: string
    value: string
  }>
  return Object.fromEntries(
    rows.map(({ key, value }) => [key, isSecretSetting(key) ? decryptSecret(key, value) : value]),
  )
}

export function hasSetting(key: string): boolean {
  return readSetting(key) !== null
}
