import { chmodSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'

/** How many automatic pre-migration copies stay on disk. */
export const AUTO_BACKUP_KEEP = 5

// Milliseconds keep two backups taken inside one second from fighting over a file name.
const STAMP = /\d{8}T\d{9}Z/

export interface MigrationBackupInput {
  database: DatabaseSync
  dataDir: string
  /** Database file name, so a second database keeps its own backup family. */
  name?: string
  fromVersion: number
  toVersion: number
  keep?: number
  now?: Date
}

function utcStamp(now: Date): string {
  return now.toISOString().replace(/[-:.]/g, '')
}

function escapeForSql(path: string): string {
  return path.replace(/'/g, "''")
}

function backupPattern(name: string): RegExp {
  return new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.v\\d+-to-v\\d+-${STAMP.source}\\.db$`)
}

function stampOf(pattern: RegExp, fileName: string): string | null {
  const match = pattern.exec(fileName)
  return match ? (match[0].match(STAMP)?.[0] ?? null) : null
}

// Only files this helper wrote are candidates, so a hand-made copy in the same folder survives.
function pruneAutoBackups(directory: string, name: string, keep: number): void {
  const pattern = backupPattern(name)
  const copies: Array<{ fileName: string; stamp: string }> = []
  for (const fileName of readdirSync(directory)) {
    const stamp = stampOf(pattern, fileName)
    if (stamp) copies.push({ fileName, stamp })
  }
  copies.sort((left, right) =>
    left.stamp === right.stamp
      ? right.fileName.localeCompare(left.fileName)
      : right.stamp.localeCompare(left.stamp),
  )
  for (const copy of copies.slice(Math.max(keep, 1))) {
    unlinkSync(join(directory, copy.fileName))
  }
}

/**
 * Writes a consistent copy of the database before pending migrations run. VACUUM INTO is the
 * only copy that is safe while WAL is on: a file copy can miss the WAL. A failure here throws
 * before any migration starts, so the database stays at its old version.
 */
export function backUpBeforeMigration(input: MigrationBackupInput): string {
  const name = input.name ?? 'sunnygen.db'
  const directory = join(input.dataDir, 'backups')
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const fileName = `${name}.v${input.fromVersion}-to-v${input.toVersion}-${utcStamp(input.now ?? new Date())}.db`
  const path = join(directory, fileName)

  try {
    input.database.exec(`VACUUM INTO '${escapeForSql(path)}'`)
    chmodSync(path, 0o600)
  } catch (error) {
    // A half-written target would otherwise look like a usable backup to the next run.
    try {
      unlinkSync(path)
    } catch {
      // The file was never created.
    }
    throw error
  }

  pruneAutoBackups(directory, name, input.keep ?? AUTO_BACKUP_KEEP)
  console.info(`Database backup before migration ${input.fromVersion} to ${input.toVersion}: ${path}`)
  return path
}
