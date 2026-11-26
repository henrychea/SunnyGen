import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { after, test } from 'node:test'
import { MIGRATIONS, SCHEMA_VERSION } from './migrations'

const dataDir = mkdtempSync(join(tmpdir(), 'sunnygen-migrate-'))
const databasePath = join(dataDir, 'sunnygen.db')

// Build a v3 database with real rows before the app opens it, so the v4 step runs the way it
// will on an existing install.
{
  const previous = new DatabaseSync(databasePath)
  for (const migration of MIGRATIONS.slice(0, 3)) previous.exec(migration)
  previous.exec('PRAGMA user_version = 3')
  previous
    .prepare(
      `INSERT INTO assets (id, kind, mime, byte_size, width, height, duration, sha256, source, path, folder_id, created_at)
       VALUES ('existing', 'image', 'image/png', 16, NULL, NULL, NULL, 'sha-old', 'upload', '2026/11/old.png', NULL, 1)`,
    )
    .run()
  previous.close()
}

process.env.SUNNYGEN_DATA_DIR = dataDir
const { closeDb, getDb } = await import('./database')

after(() => {
  closeDb()
  rmSync(dataDir, { recursive: true, force: true })
})

test('v3 to v5 keeps rows, adds an asset name, a copy table, and allows duplicate hashes', () => {
  const db = getDb()
  assert.equal(SCHEMA_VERSION, 5)
  assert.equal(MIGRATIONS.length, 5)

  const columns = db.prepare('PRAGMA table_info(assets)').all() as Array<{ name: string }>
  assert.ok(columns.some((column) => column.name === 'name'))
  const existing = db.prepare("SELECT name FROM assets WHERE id = 'existing'").get() as {
    name: string | null
  }
  assert.equal(existing.name, null)

  db.prepare(
    `INSERT INTO assets (id, kind, name, mime, byte_size, width, height, duration, sha256, source, path, folder_id, created_at)
     VALUES ('second', 'image', 'door-photo.jpg', 'image/png', 16, NULL, NULL, NULL, 'sha-old', 'upload', '2026/11/second.png', NULL, 2)`,
  ).run()
  const count = db.prepare("SELECT COUNT(*) AS count FROM assets WHERE sha256 = 'sha-old'").get() as {
    count: number
  }
  assert.equal(count.count, 2)

  const index = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'assets_sha256'").get() as {
    sql: string
  }
  assert.match(index.sql, /^CREATE INDEX assets_sha256/)

  const copyColumns = db.prepare('PRAGMA table_info(video_copies)').all() as Array<{ name: string }>
  assert.ok(copyColumns.some((column) => column.name === 'output_asset_id'))
  assert.ok(copyColumns.some((column) => column.name === 'frame_asset_ids'))
  const copyIndex = db.prepare("SELECT name FROM sqlite_master WHERE name = 'video_copies_created'").get() as
    | { name: string }
    | undefined
  assert.equal(copyIndex?.name, 'video_copies_created')
})
