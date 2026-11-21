import { getDb } from '../database'

export interface ProviderUpload {
  url: string
  expiresAt: number | null
}

export function readProviderUpload(provider: string, sha256: string): ProviderUpload | null {
  const row = getDb()
    .prepare('SELECT url, expires_at FROM provider_uploads WHERE provider = ? AND sha256 = ?')
    .get(provider, sha256) as { url: string; expires_at: number | null } | undefined
  if (!row) return null
  return { url: row.url, expiresAt: row.expires_at }
}

export function saveProviderUpload(
  provider: string,
  sha256: string,
  url: string,
  expiresAt: number | null,
): void {
  getDb()
    .prepare(
      `INSERT INTO provider_uploads (provider, sha256, url, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(provider, sha256) DO UPDATE SET url = excluded.url, expires_at = excluded.expires_at`,
    )
    .run(provider, sha256, url, expiresAt, Date.now())
}

export function deleteProviderUpload(provider: string, sha256: string): void {
  getDb().prepare('DELETE FROM provider_uploads WHERE provider = ? AND sha256 = ?').run(provider, sha256)
}
