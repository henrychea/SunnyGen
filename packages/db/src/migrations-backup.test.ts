import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { after, test } from 'node:test'
import { backUpBeforeMigration } from './backups'
import { migrateDatabase } from './database'
import { MIGRATIONS } from './migrations'

const dirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sunnygen-backup-'))
  dirs.push(dir)
  return dir
}

after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

function version(db: DatabaseSync): number {
  return (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
}

/** A database at an older version, the way an install that skipped a release looks. */
function oldDatabase(dir: string, at: number): DatabaseSync {
  const db = new DatabaseSync(join(dir, 'sunnygen.db'))
  for (const migration of MIGRATIONS.slice(0, at)) db.exec(migration)
  db.exec(`PRAGMA user_version = ${at}`)
  return db
}

test('a pending migration on an existing database writes one backup at the old version', () => {
  const dir = tempDir()
  const db = oldDatabase(dir, 3)
  db.prepare(
    `INSERT INTO assets (id, kind, mime, byte_size, width, height, duration, sha256, source, path, folder_id, created_at)
     VALUES ('kept', 'image', 'image/png', 16, NULL, NULL, NULL, 'sha-kept', 'upload', '2026/11/kept.png', NULL, 1)`,
  ).run()

  const logged: string[] = []
  const original = console.info
  console.info = (...args: unknown[]) => {
    logged.push(args.join(' '))
  }
  try {
    migrateDatabase(db, dir)
  } finally {
    console.info = original
  }

  assert.equal(version(db), MIGRATIONS.length)
  const files = readdirSync(join(dir, 'backups'))
  assert.equal(files.length, 1)
  const name = files[0] as string
  assert.match(name, /^sunnygen\.db\.v3-to-v6-\d{8}T\d{9}Z\.db$/)

  const backup = new DatabaseSync(join(dir, 'backups', name), { readOnly: true })
  try {
    assert.equal(version(backup), 3)
    const row = backup.prepare("SELECT id, sha256 FROM assets WHERE id = 'kept'").get() as {
      id: string
      sha256: string
    }
    assert.deepEqual({ id: row.id, sha256: row.sha256 }, { id: 'kept', sha256: 'sha-kept' })
  } finally {
    backup.close()
  }

  assert.equal(logged.length, 1)
  assert.ok(logged[0]?.includes(join(dir, 'backups', name)))
  if (process.platform !== 'win32') {
    assert.equal(statSync(join(dir, 'backups', name)).mode & 0o777, 0o600)
  }
  db.close()
})

test('a fresh database writes no backup', () => {
  const dir = tempDir()
  const db = new DatabaseSync(join(dir, 'sunnygen.db'))
  migrateDatabase(db, dir)
  assert.equal(version(db), MIGRATIONS.length)
  assert.deepEqual(
    readdirSync(dir).filter((name) => name === 'backups'),
    [],
  )
  db.close()
})

test('an up-to-date database writes no backup', () => {
  const dir = tempDir()
  const db = new DatabaseSync(join(dir, 'sunnygen.db'))
  migrateDatabase(db, dir)
  migrateDatabase(db, dir)
  assert.deepEqual(
    readdirSync(dir).filter((name) => name === 'backups'),
    [],
  )
  db.close()
})

test('pruning keeps the newest five automatic backups and leaves other files alone', () => {
  const dir = tempDir()
  const db = new DatabaseSync(join(dir, 'sunnygen.db'))
  const backups = join(dir, 'backups')
  for (let index = 0; index < 6; index += 1) {
    backUpBeforeMigration({
      database: db,
      dataDir: dir,
      fromVersion: index + 1,
      toVersion: 6,
      now: new Date(Date.UTC(2026, 10, 26, 12, 0, index)),
    })
  }
  writeFileSync(join(backups, 'sunnygen.db.manual-copy.db'), '')
  writeFileSync(join(backups, 'guest.db.v1-to-v2-20261126T120000000Z.db'), '')

  const files = readdirSync(backups).sort()
  assert.equal(files.filter((name) => name.startsWith('sunnygen.db.v')).length, 5)
  assert.ok(!files.includes('sunnygen.db.v1-to-v6-20261126T120000000Z.db'))
  assert.ok(files.includes('sunnygen.db.v6-to-v6-20261126T120005000Z.db'))
  assert.ok(files.includes('sunnygen.db.manual-copy.db'))
  assert.ok(files.includes('guest.db.v1-to-v2-20261126T120000000Z.db'))
  db.close()
})

test('a failed backup leaves the database at its old version', () => {
  const dir = tempDir()
  const db = oldDatabase(dir, 3)
  // A file where the backups directory belongs makes the copy impossible.
  writeFileSync(join(dir, 'backups'), 'not a directory')

  assert.throws(() => migrateDatabase(db, dir))
  assert.equal(version(db), 3)
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE name = 'video_copies'").get()
  assert.equal(tables, undefined)
  db.close()
})
