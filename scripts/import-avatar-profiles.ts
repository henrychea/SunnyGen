/**
 * Backfill avatar profiles and identity keywords from each avatar's reference sheet.
 *
 * Existing avatars predate the profile, so the sheet is the only truthful source. The
 * extraction is the same vision request the wizard used before prompts replaced it.
 *
 *   pnpm tsx scripts/import-avatar-profiles.ts --db ../SunnyGen/data/sunnygen.db
 *   pnpm tsx scripts/import-avatar-profiles.ts --db ... --dry-run
 *
 * Skips avatars that already carry a profile unless --force is passed.
 */
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import {
  DEFAULT_AVATAR_PROFILE,
  identityKeywords,
  parseAvatarProfile,
  type AvatarProfile,
} from '@sunnygen/core'
import { extractAvatarProfile } from '../apps/web/src/server/avatar-profile.server.ts'

type Args = { db: string; media: string; dryRun: boolean; force: boolean; origin?: string }

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
    origin: flags.get('origin'),
  }
}

// Facts the user stated when the sheets were made. Every avatar sits at 165 cm.
const STATED: Record<string, { heightCm: number; weightKg?: number; body?: Partial<AvatarProfile['body']> }> =
  {
    K4: { heightCm: 165, weightKg: 49, body: { build: 'slim', bust: 'slight' } },
    B1: { heightCm: 165, weightKg: 47 },
    Mina: { heightCm: 165, weightKg: 50 },
  }

interface AvatarRow {
  id: string
  name: string
  data: string
}

function parseData(raw: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw) as unknown
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function sheetPath(db: DatabaseSync, assetId: string): string | null {
  const row = db.prepare('SELECT path FROM assets WHERE id = ?').get(assetId) as { path?: string } | undefined
  return typeof row?.path === 'string' ? row.path : null
}

async function assistantKey(db: DatabaseSync, dbPath: string): Promise<string> {
  const env = process.env.OPENROUTER_API_KEY
  if (env?.trim()) return env.trim()
  const row = db.prepare("SELECT value FROM settings WHERE key = 'assistant.openrouter.key'").get() as
    | { value?: string }
    | undefined
  const stored = typeof row?.value === 'string' ? row.value : ''
  if (!stored) throw new Error('No OpenRouter key in settings or OPENROUTER_API_KEY')
  // Stored keys are encrypted with data/secrets.key, which paths.ts resolves at import time.
  process.env.SUNNYGEN_DATA_DIR ??= dirname(dbPath)
  const { decryptSecret } = await import('../packages/db/src/secrets.ts')
  const value = decryptSecret('assistant.openrouter.key', stored).trim()
  if (!value) throw new Error('The stored OpenRouter key decrypted to an empty value')
  return value
}

// The extractor answers in free text ("asian"), which reads vague in a prompt. Snap it to
// the preset the sheets were made with.
function normalizeEthnicity(profile: AvatarProfile): AvatarProfile {
  const ethnicity = profile.identity.ethnicity.trim().toLowerCase()
  if (ethnicity !== 'asian' && ethnicity !== 'chinese') return profile
  return { ...profile, identity: { ...profile.identity, ethnicity: 'East Asian' } }
}

function applyStatedFacts(name: string, profile: AvatarProfile): AvatarProfile {
  const stated = STATED[name]
  if (!stated) return profile
  return {
    ...profile,
    identity: {
      ...profile.identity,
      heightCm: stated.heightCm,
      ...(stated.weightKg === undefined ? {} : { weightKg: stated.weightKg }),
    },
    body: { ...profile.body, ...stated.body },
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const db = new DatabaseSync(args.db, { readOnly: args.dryRun })
  db.exec('PRAGMA busy_timeout = 5000')
  const key = await assistantKey(db, args.db)
  const rows = db
    .prepare(
      `SELECT id, name, data FROM studio_items
       WHERE kind = 'avatar' AND asset_id IS NOT NULL
       ORDER BY created_at`,
    )
    .all() as AvatarRow[]

  console.log(`${rows.length} avatars in ${args.db}${args.dryRun ? ' (dry run)' : ''}`)
  const updates: Array<{ id: string; name: string; profile: AvatarProfile }> = []

  for (const row of rows) {
    const data = parseData(row.data)
    if (data.avatarProfile && !args.force) {
      const stored = parseAvatarProfile(data.avatarProfile)
      const updated = stored ? applyStatedFacts(row.name, stored) : null
      if (updated && JSON.stringify(updated) !== JSON.stringify(stored)) {
        updates.push({ id: row.id, name: row.name, profile: updated })
        console.log(`- ${row.name}: stated facts applied to the stored profile`)
        continue
      }
      console.log(`- ${row.name}: profile already stored, skipped (use --force to redo)`)
      continue
    }
    const sheetId = typeof data.characterSheetAssetId === 'string' ? data.characterSheetAssetId : null
    if (!sheetId) {
      console.log(`- ${row.name}: no reference sheet, skipped`)
      continue
    }
    const relative = sheetPath(db, sheetId)
    if (!relative) {
      console.log(`- ${row.name}: sheet asset ${sheetId} missing, skipped`)
      continue
    }
    const bytes = readFileSync(join(args.media, relative))
    const mime = relative.endsWith('.jpg') || relative.endsWith('.jpeg') ? 'image/jpeg' : 'image/png'
    const extracted = await extractAvatarProfile({
      imageDataUrl: `data:${mime};base64,${bytes.toString('base64')}`,
      key,
      origin: args.origin,
    })
    const profile = applyStatedFacts(
      row.name,
      normalizeEthnicity({ ...DEFAULT_AVATAR_PROFILE, ...extracted }),
    )
    updates.push({ id: row.id, name: row.name, profile })
    console.log(`- ${row.name}: extracted`)
    console.log(JSON.stringify(identityKeywords(profile)))
  }

  if (args.dryRun) {
    console.log('\nDry run. Nothing written.')
    return
  }
  if (updates.length === 0) {
    console.log('Nothing to write.')
    return
  }

  const write = db.prepare('UPDATE studio_items SET data = ?, updated_at = ? WHERE id = ?')
  const now = Date.now()
  db.exec('BEGIN')
  try {
    for (const update of updates) {
      const row = db.prepare('SELECT data FROM studio_items WHERE id = ?').get(update.id) as
        | { data: string }
        | undefined
      const data = parseData(row?.data ?? '{}')
      data.avatarProfile = update.profile
      data.identityKeywords = identityKeywords(update.profile)
      write.run(JSON.stringify(data), now, update.id)
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  console.log(`\nWrote ${updates.length} profile(s) into ${args.db}`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
