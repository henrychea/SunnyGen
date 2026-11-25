/**
 * Backfill: studio assets that are really user uploads become uploads.
 *
 * Studio uploads used to be stored with source 'studio', which the Assets page does not list
 * (it shows upload and social). Anything the user uploaded through the studio dialogs or a pack
 * import is an upload; only the crops and boards an avatar cut for itself are internal. This
 * rewrites the source for every studio asset that no studio item references as a crop.
 *
 *   pnpm tsx scripts/backfill-studio-uploads.ts --db <path to sunnygen.db>
 *   ... --dry-run
 */
import { resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { selectStudioUploads } from '../packages/db/src/repositories/assets.ts'

interface Args {
  db: string
  dryRun: boolean
}

function parseArgs(argv: string[]): Args {
  const flags = new Map<string, string>()
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string
    if (!arg.startsWith('--')) continue
    const [key, inline] = arg.slice(2).split('=')
    const next = argv[index + 1]
    const value = inline ?? (next && !next.startsWith('--') ? ((index += 1), next) : '')
    flags.set(key as string, value)
  }
  const db = flags.get('db')
  if (!db) throw new Error('Pass --db <path to sunnygen.db>')
  return { db: resolve(db), dryRun: flags.has('dry-run') }
}

function cropIdsFrom(db: DatabaseSync): Set<string> {
  const rows = db.prepare("SELECT data FROM studio_items WHERE kind = 'avatar'").all() as Array<{
    data: string
  }>
  const ids = new Set<string>()
  for (const row of rows) {
    let data: Record<string, unknown> = {}
    try {
      const parsed = JSON.parse(row.data) as unknown
      data = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
    } catch {
      data = {}
    }
    for (const key of ['crops', 'cropTiles', 'boards']) {
      const entries = data[key]
      if (!Array.isArray(entries)) continue
      for (const entry of entries) {
        const assetId = (entry as { assetId?: unknown } | null)?.assetId
        if (typeof assetId === 'string' && assetId) ids.add(assetId)
      }
    }
  }
  return ids
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  const db = new DatabaseSync(args.db)
  db.exec('PRAGMA busy_timeout = 5000')

  const rows = db.prepare("SELECT id, source FROM assets WHERE source = 'studio'").all() as Array<{
    id: string
    source: string
  }>
  const cropIds = cropIdsFrom(db)
  const ids = selectStudioUploads(rows, cropIds)

  console.log(
    `${rows.length} studio asset(s), ${cropIds.size} crop asset(s), ${ids.length} to re-list as uploads`,
  )
  for (const id of ids) console.log(`- ${id}`)

  if (args.dryRun) {
    console.log('\nDry run. Nothing written.')
    return
  }
  if (ids.length === 0) {
    console.log('\nNothing to write.')
    return
  }

  const update = db.prepare("UPDATE assets SET source = 'upload' WHERE id = ?")
  db.exec('BEGIN')
  try {
    for (const id of ids) update.run(id)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  console.log(`\nUpdated ${ids.length} asset(s) to source 'upload'.`)
}

main()
