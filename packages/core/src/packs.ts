import { z } from 'zod'
import {
  GARMENT_SLOTS,
  GARMENT_SOURCES,
  STUDIO_KINDS,
  type GarmentSlot,
  type GarmentSource,
  type StudioKind,
} from './domain'

/**
 * Packs are the portable way to move Studio libraries between machines: a zip
 * (or folder) of images plus an optional JSON manifest that names each file and
 * assigns its kind. The planner below is pure so the same rules run in tests and
 * in the server importer.
 */

export const PACK_MANIFEST_NAMES = ['sunnygen-pack.json', 'pack.json', 'sunnygen.json'] as const
export const PACK_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif'] as const
export const MAX_PACK_BYTES = 250 * 1024 * 1024
export const MAX_PACK_ITEMS = 500
export const PACK_NAME_LIMIT = 80

const pathField = z.string().trim().min(1).max(400)

const packSidecarSchema = z.object({
  file: pathField.optional(),
  name: z.string().trim().min(1).max(PACK_NAME_LIMIT).optional(),
  kind: z.enum(STUDIO_KINDS).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  cleanFile: pathField.optional(),
  characterSheetFile: pathField.optional(),
  include: z.boolean().optional(),
})

export const packManifestSchema = z
  .object({
    name: z.string().trim().min(1).max(PACK_NAME_LIMIT).optional(),
    kind: z.enum(STUDIO_KINDS).optional(),
    defaults: z
      .object({
        data: z.record(z.string(), z.unknown()).optional(),
      })
      .optional(),
    items: z.array(packSidecarSchema).max(MAX_PACK_ITEMS).optional(),
    files: z.record(pathField, packSidecarSchema).optional(),
  })
  .superRefine((value, context) => {
    if (!value.items?.length && !value.files) {
      context.addIssue({ code: 'custom', message: 'A pack manifest needs "items" or "files".' })
    }
  })

export type PackManifest = z.infer<typeof packManifestSchema>
export type PackSidecar = z.infer<typeof packSidecarSchema>

export interface PackEntry {
  path: string
  size?: number
}

export interface PlannedPackItem {
  file: string
  name: string
  kind: StudioKind
  data: Record<string, unknown>
  cleanFile: string | null
  characterSheetFile: string | null
  size: number
}

export interface PackPlanIssue {
  file: string
  error: string
}

export interface PackPlanSkip {
  file: string
  reason: string
}

export interface PackPlan {
  name: string | null
  manifestPath: string | null
  items: PlannedPackItem[]
  issues: PackPlanIssue[]
  skipped: PackPlanSkip[]
  ignored: number
}

export interface PlanPackOptions {
  entries: PackEntry[]
  manifest?: PackManifest | null
  manifestPath?: string | null
  fallbackKind?: StudioKind
  existing?: Array<{ kind: StudioKind; name: string }>
}

/** Normalizes zip/folder paths to forward slashes without leading or dot segments. */
export function normalizePackPath(value: string): string {
  const parts: string[] = []
  for (const segment of value.replaceAll('\\', '/').split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      parts.pop()
      continue
    }
    parts.push(segment)
  }
  return parts.join('/')
}

export function isIgnoredPackPath(path: string): boolean {
  return path
    .split('/')
    .some(
      (segment) =>
        segment.startsWith('.') ||
        segment === '__MACOSX' ||
        segment.toLowerCase() === 'thumbs.db' ||
        segment.toLowerCase() === 'desktop.ini',
    )
}

export function isPackImage(path: string): boolean {
  const lower = path.toLowerCase()
  return PACK_IMAGE_EXTENSIONS.some((extension) => lower.endsWith(extension))
}

/** Root-level manifests win; fall back to the only root-level JSON in the pack. */
export function findManifestPath(paths: string[]): string | null {
  const root = paths
    .map(normalizePackPath)
    .filter((path) => path && !path.includes('/') && path.toLowerCase().endsWith('.json'))
    .filter((path) => !isIgnoredPackPath(path))
  for (const name of PACK_MANIFEST_NAMES) {
    const hit = root.find((path) => path.toLowerCase() === name)
    if (hit) return hit
  }
  return root.length === 1 ? (root[0] ?? null) : null
}

const KIND_HINTS: Array<{ pattern: RegExp; kind: StudioKind }> = [
  { pattern: /(^|[^a-z])poses?([^a-z]|$)/i, kind: 'pose' },
  { pattern: /(garments?|clothing|clothes|wardrobe|outfits?)/i, kind: 'garment' },
  { pattern: /(scenes?|backgrounds?|backdrops?|studios?)/i, kind: 'scene' },
  { pattern: /(avatars?|characters?|models?)/i, kind: 'avatar' },
]

export function inferKindFromPath(path: string): StudioKind | null {
  for (const segment of normalizePackPath(path).split('/')) {
    for (const hint of KIND_HINTS) {
      if (hint.pattern.test(segment)) return hint.kind
    }
  }
  return null
}

export function packItemName(path: string, limit = PACK_NAME_LIMIT): string {
  const base = normalizePackPath(path).split('/').pop() ?? path
  const stem = base.replace(/\.[^.]+$/, '')
  const cleaned = [...stem]
    .map((character) => {
      const code = character.codePointAt(0) ?? 0
      return code < 32 || code === 127 ? ' ' : character
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  return (cleaned || 'Imported item').slice(0, limit)
}

export function parsePackManifest(value: unknown): PackManifest {
  return packManifestSchema.parse(value)
}

function sidecarEntries(manifest: PackManifest): Array<PackSidecar & { file: string }> {
  const list: Array<PackSidecar & { file: string }> = []
  for (const item of manifest.items ?? []) {
    if (!item.file) continue
    list.push({ ...item, file: item.file })
  }
  for (const [file, item] of Object.entries(manifest.files ?? {})) {
    list.push({ ...item, file: item.file ?? file })
  }
  return list
}

function garmentData(raw: Record<string, unknown>): { data: Record<string, unknown>; error: string | null } {
  const slot = (raw.slot ?? 'top') as GarmentSlot
  const sourceKind = (raw.sourceKind ?? 'flat-lay') as GarmentSource
  if (!GARMENT_SLOTS.includes(slot)) {
    return { data: raw, error: `Unknown garment slot "${String(raw.slot)}".` }
  }
  if (!GARMENT_SOURCES.includes(sourceKind)) {
    return { data: raw, error: `Unknown garment source "${String(raw.sourceKind)}".` }
  }
  return { data: { ...raw, slot, sourceKind }, error: null }
}

/**
 * Turns a pack's file list and optional manifest into the items the importer
 * should create. Files that are missing, unreadable, or duplicated are reported
 * instead of failing the whole pack.
 */
export function planPack(options: PlanPackOptions): PackPlan {
  const entries = options.entries
    .map((entry) => ({ ...entry, path: normalizePackPath(entry.path) }))
    .filter((entry) => entry.path && !entry.path.endsWith('/'))
  const byPath = new Map(entries.map((entry) => [entry.path.toLowerCase(), entry]))
  const manifestPath = options.manifestPath ? normalizePackPath(options.manifestPath) : null

  const images = entries.filter(
    (entry) =>
      isPackImage(entry.path) &&
      !isIgnoredPackPath(entry.path) &&
      entry.path.toLowerCase() !== manifestPath?.toLowerCase(),
  )
  const ignored = entries.length - images.length

  const plan: PackPlan = {
    name: options.manifest?.name ?? null,
    manifestPath,
    items: [],
    issues: [],
    skipped: [],
    ignored,
  }

  const seen = new Set(
    (options.existing ?? []).map((item) => `${item.kind}|${item.name.trim().toLowerCase()}`),
  )
  const planned = new Set<string>()
  const claimed = new Set<string>()

  const addItem = (input: {
    file: string
    name?: string
    kind?: StudioKind
    data?: Record<string, unknown>
    cleanFile?: string | null
    characterSheetFile?: string | null
  }): void => {
    const file = normalizePackPath(input.file)
    const entry = byPath.get(file.toLowerCase())
    if (!entry) {
      plan.issues.push({ file, error: 'File not found in the pack.' })
      return
    }
    if (!isPackImage(entry.path) || isIgnoredPackPath(entry.path)) {
      plan.issues.push({ file, error: 'Not a supported image (.png, .jpg, .webp, .avif, .gif).' })
      return
    }

    const kind = input.kind ?? options.manifest?.kind ?? options.fallbackKind ?? inferKindFromPath(entry.path)
    if (!kind) {
      plan.issues.push({ file, error: 'Set a kind in the manifest or pick one before importing.' })
      return
    }

    const name = (input.name ?? packItemName(entry.path))
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, PACK_NAME_LIMIT)
    if (!name) {
      plan.issues.push({ file, error: 'Item name is empty.' })
      return
    }

    const data: Record<string, unknown> = {
      ...options.manifest?.defaults?.data,
      ...input.data,
    }

    if (kind === 'garment') {
      const garment = garmentData(data)
      if (garment.error) {
        plan.issues.push({ file, error: garment.error })
        return
      }
      Object.assign(data, garment.data)
    }

    let characterSheetFile: string | null = null
    if (kind === 'avatar') {
      if (!input.characterSheetFile) {
        plan.issues.push({ file, error: 'Avatars need a characterSheetFile in the manifest.' })
        return
      }
      const sheet = byPath.get(normalizePackPath(input.characterSheetFile).toLowerCase())
      if (!sheet || !isPackImage(sheet.path)) {
        plan.issues.push({
          file,
          error: `Character sheet not found: ${input.characterSheetFile}`,
        })
        return
      }
      characterSheetFile = sheet.path
      claimed.add(sheet.path.toLowerCase())
    }

    let cleanFile: string | null = null
    if (input.cleanFile) {
      const clean = byPath.get(normalizePackPath(input.cleanFile).toLowerCase())
      if (!clean || !isPackImage(clean.path)) {
        plan.issues.push({ file, error: `Prepared image not found: ${input.cleanFile}` })
        return
      }
      cleanFile = clean.path
      claimed.add(clean.path.toLowerCase())
    }

    const key = `${kind}|${name.toLowerCase()}`
    if (planned.has(key)) {
      plan.skipped.push({ file, reason: 'Duplicate name inside the pack.' })
      return
    }
    if (seen.has(key)) {
      plan.skipped.push({ file, reason: 'Already in the library.' })
      return
    }
    planned.add(key)
    plan.items.push({
      file: entry.path,
      name,
      kind,
      data,
      cleanFile,
      characterSheetFile,
      size: entry.size ?? 0,
    })
  }

  if (options.manifest) {
    const listed = new Set<string>()
    for (const sidecar of sidecarEntries(options.manifest)) {
      const file = normalizePackPath(sidecar.file)
      listed.add(file.toLowerCase())
      if (sidecar.include === false) {
        plan.skipped.push({ file, reason: 'Excluded by the manifest.' })
        continue
      }
      addItem({
        file,
        name: sidecar.name,
        kind: sidecar.kind,
        data: sidecar.data,
        cleanFile: sidecar.cleanFile,
        characterSheetFile: sidecar.characterSheetFile,
      })
    }
    for (const entry of images) {
      if (listed.has(entry.path.toLowerCase()) || claimed.has(entry.path.toLowerCase())) continue
      plan.skipped.push({ file: entry.path, reason: 'Not listed in the manifest.' })
    }
    return plan
  }

  for (const entry of images) {
    addItem({ file: entry.path })
  }
  return plan
}
