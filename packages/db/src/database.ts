import { chmodSync, mkdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { MIGRATIONS, SCHEMA_VERSION } from './migrations'
import { dataDir, databasePath, mediaDir } from './paths'
import { migrateSecretRows } from './secrets'

let connection: DatabaseSync | null = null

function migrate(database: DatabaseSync): void {
  const row = database.prepare('PRAGMA user_version').get() as { user_version: number }
  for (let version = row.user_version; version < MIGRATIONS.length; version += 1) {
    const migration = MIGRATIONS[version]
    if (!migration) throw new Error(`Missing database migration ${version + 1}`)
    database.exec('BEGIN')
    try {
      database.exec(migration)
      database.exec(`PRAGMA user_version = ${version + 1}`)
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
  }
}

function encryptLegacySecrets(database: DatabaseSync): void {
  const rows = database.prepare('SELECT key, value FROM settings').all() as Array<{
    key: string
    value: string
  }>
  if (rows.length === 0) return
  const update = database.prepare('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?')
  database.exec('BEGIN')
  try {
    const migrated = migrateSecretRows(rows, (key, encrypted) => {
      update.run(encrypted, Date.now(), key)
    })
    database.exec('COMMIT')
    if (migrated > 0) {
      console.info(`Encrypted ${migrated} stored credential(s) with AES-256-GCM.`)
    }
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

export function getDb(): DatabaseSync {
  if (connection) return connection
  mkdirSync(dataDir, { recursive: true, mode: 0o700 })
  mkdirSync(mediaDir, { recursive: true, mode: 0o700 })
  const database = new DatabaseSync(databasePath)
  database.exec('PRAGMA journal_mode = WAL')
  database.exec('PRAGMA foreign_keys = ON')
  database.exec('PRAGMA busy_timeout = 5000')
  migrate(database)
  encryptLegacySecrets(database)
  // The settings table holds provider keys, so keep the database and its
  // sidecars readable only by the owner.
  for (const file of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
    try {
      chmodSync(file, 0o600)
    } catch {
      // Sidecar files may not exist yet.
    }
  }
  connection = database
  return database
}

export interface DatabaseInfo {
  path: string
  version: number
  dataDir: string
  mediaDir: string
}

export function getDatabaseInfo(): DatabaseInfo {
  const database = getDb()
  const row = database.prepare('PRAGMA user_version').get() as { user_version: number }
  return {
    path: databasePath,
    version: row.user_version,
    dataDir,
    mediaDir,
  }
}

export function closeDb(): void {
  connection?.close()
  connection = null
}

export { SCHEMA_VERSION }
