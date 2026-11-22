/**
 * Backfill avatar crops from each avatar's 4x4 panel.
 *
 * The reference planner prefers three crops (front face, three-quarter face, full
 * body) over the whole collage. The app only creates them when a panel cell is at
 * least PANEL_CROP_MIN_SIDE (1024 px); older panels are smaller than that, so those
 * avatars keep sending collages, which image models tend to ignore.
 *
 * This writes the crops the app would have written, at whatever the panel allows,
 * and stores them on the item so the planner uses them without a code change.
 *
 *   pnpm --filter @sunnygen/web exec tsx scripts/backfill-avatar-crops.ts --db <path>
 *   ... --dry-run
 */
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import sharp from 'sharp'
import { AVATAR_CROP_CELLS, PANEL_GRID, type AvatarCropRole } from '@sunnygen/core'

const ROLES = Object.keys(AVATAR_CROP_CELLS) as AvatarCropRole[]
const MIN_CELL = 128

interface Args {
  db: string
  media: string
  dryRun: boolean
  force: boolean
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
  return {
    db: resolve(db),
    media: resolve(flags.get('media') || join(dirname(resolve(db)), 'media')),
    dryRun: flags.has('dry-run'),
    force: flags.has('force'),
  }
}

interface AvatarRow {
  id: string
  name: string
  assetId: string
  data: string
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const db = new DatabaseSync(args.db)
  db.exec('PRAGMA busy_timeout = 5000')

  const rows = db
    .prepare(
      `SELECT id, name, asset_id AS assetId, data FROM studio_items
       WHERE kind = 'avatar' AND asset_id IS NOT NULL
       ORDER BY created_at`,
    )
    .all() as AvatarRow[]

  const selectAsset = db.prepare('SELECT id FROM assets WHERE sha256 = ?')
  const insertAsset = db.prepare(
    `INSERT INTO assets (id, kind, mime, byte_size, width, height, duration, sha256, source, path, folder_id, created_at)
     VALUES (?, 'image', 'image/jpeg', ?, ?, ?, NULL, ?, 'studio', ?, NULL, ?)`,
  )

  for (const row of rows) {
    const data = JSON.parse(row.data) as Record<string, unknown>
    if (!data.avatarProfile) {
      console.log(`- ${row.name}: no profile, skipped`)
      continue
    }
    if (data.crops && !args.force) {
      console.log(`- ${row.name}: crops already stored, skipped (use --force to redo)`)
      continue
    }
    const asset = db.prepare('SELECT path FROM assets WHERE id = ?').get(row.assetId) as
      | { path?: string }
      | undefined
    if (!asset?.path) {
      console.log(`- ${row.name}: panel ${row.assetId} has no file, skipped`)
      continue
    }
    const panel = await sharp(join(args.media, asset.path)).toBuffer()
    const metadata = await sharp(panel).metadata()
    const cellWidth = Math.floor((metadata.width ?? 0) / PANEL_GRID)
    const cellHeight = Math.floor((metadata.height ?? 0) / PANEL_GRID)
    if (Math.min(cellWidth, cellHeight) < MIN_CELL) {
      console.log(`- ${row.name}: cells ${cellWidth}x${cellHeight} are too small, skipped`)
      continue
    }

    const crops: Array<{ role: AvatarCropRole; assetId: string; width: number; height: number }> = []
    for (const role of ROLES) {
      const cell = AVATAR_CROP_CELLS[role]
      const buffer = await sharp(panel)
        .extract({
          left: cell.column * cellWidth,
          top: cell.row * cellHeight,
          width: cellWidth,
          height: cellHeight,
        })
        .jpeg({ quality: 92, mozjpeg: true })
        .toBuffer()
      const sha256 = createHash('sha256').update(buffer).digest('hex')
      const existing = selectAsset.get(sha256) as { id?: string } | undefined
      let assetId = existing?.id
      if (!assetId) {
        assetId = randomUUID()
        if (!args.dryRun) {
          const now = new Date()
          const folder = join(String(now.getUTCFullYear()), String(now.getUTCMonth() + 1).padStart(2, '0'))
          const relativePath = join(folder, `${randomUUID()}.jpg`)
          const absolutePath = join(args.media, relativePath)
          mkdirSync(dirname(absolutePath), { recursive: true, mode: 0o700 })
          writeFileSync(absolutePath, buffer, { mode: 0o600 })
          insertAsset.run(assetId, buffer.byteLength, cellWidth, cellHeight, sha256, relativePath, Date.now())
        }
      }
      crops.push({ role, assetId, width: cellWidth, height: cellHeight })
    }

    console.log(`- ${row.name}: ${crops.length} crops at ${cellWidth}x${cellHeight}`)
    if (args.dryRun) continue
    data.crops = crops
    db.prepare('UPDATE studio_items SET data = ?, updated_at = ? WHERE id = ?').run(
      JSON.stringify(data),
      Date.now(),
      row.id,
    )
  }

  console.log(args.dryRun ? '\nDry run. Nothing written.' : '\nDone.')
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
