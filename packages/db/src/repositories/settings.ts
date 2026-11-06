import { getDb } from '../database'

export function readSetting(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

export function writeSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(key, value, Date.now())
}

export function deleteSetting(key: string): void {
  getDb().prepare('DELETE FROM settings WHERE key = ?').run(key)
}

export function listSettings(): Record<string, string> {
  const rows = getDb().prepare('SELECT key, value FROM settings ORDER BY key').all() as Array<{
    key: string
    value: string
  }>
  return Object.fromEntries(rows.map((row) => [row.key, row.value]))
}

export function hasSetting(key: string): boolean {
  return readSetting(key) !== null
}
