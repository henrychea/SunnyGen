import { unzipSync } from 'fflate'
import sharp from 'sharp'
import {
  MAX_PACK_BYTES,
  MAX_PACK_ITEMS,
  findManifestPath,
  normalizePackPath,
  parsePackManifest,
  planPack,
  type PackManifest,
  type StudioKind,
} from '@sunnygen/core'
import { listStudioItems, saveStudioItem } from '@sunnygen/db'
import { storeBuffer } from './media.server'

const MIME_BY_FORMAT: Record<string, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
}

export interface PackImportItem {
  id: string
  kind: StudioKind
  name: string
}

export interface PackImportResult {
  name: string | null
  manifestPath: string | null
  imported: PackImportItem[]
  skipped: Array<{ file: string; reason: string }>
  failed: Array<{ file: string; error: string }>
  ignored: number
}

export interface PackSource {
  kind?: StudioKind
  zip?: Uint8Array
  files?: Array<{ path: string; data: Uint8Array }>
  mapping?: string
  mappingName?: string
}

function readManifestJson(text: string, source: string): PackManifest {
  let value: unknown
  try {
    value = JSON.parse(text) as unknown
  } catch {
    throw new Error(`${source} is not valid JSON.`)
  }
  try {
    return parsePackManifest(value)
  } catch (error) {
    const detail = error instanceof Error ? error.message.split('\n')[0] : ''
    throw new Error(`${source} is not a valid pack manifest.${detail ? ` ${detail}` : ''}`)
  }
}

async function imageMime(buffer: Uint8Array): Promise<string> {
  try {
    const metadata = await sharp(buffer).metadata()
    const mime = metadata.format ? MIME_BY_FORMAT[metadata.format] : undefined
    if (mime) return mime
  } catch {
    // Fall through to the shared error below.
  }
  throw new Error('Not a supported image (.png, .jpg, .webp, .avif, .gif).')
}

export function unzipPack(bytes: Uint8Array): Array<{ path: string; data: Uint8Array }> {
  let files: Record<string, Uint8Array>
  let unpacked = 0
  let oversized = false
  try {
    // Refuse zip bombs before fflate inflates them into memory.
    files = unzipSync(bytes, {
      filter: (entry) => {
        if (entry.name.endsWith('/')) return true
        unpacked += entry.originalSize
        if (unpacked > MAX_PACK_BYTES * 2) {
          oversized = true
          return false
        }
        return true
      },
    })
  } catch {
    throw new Error('Could not read the zip. Rebuild it as an uncompressed or deflate zip.')
  }
  if (oversized) throw new Error('The pack expands beyond the 500 MB limit.')
  return Object.entries(files)
    .map(([path, data]) => ({ path: normalizePackPath(path), data }))
    .filter((entry) => entry.path && !entry.path.endsWith('/'))
}

/**
 * Imports a Studio pack. Every item is independent: a bad file lands in
 * `failed` and the rest of the pack still imports.
 */
export async function importPack(source: PackSource): Promise<PackImportResult> {
  const entries = source.zip ? unzipPack(source.zip) : (source.files ?? [])
  const files = new Map(entries.map((entry) => [entry.path.toLowerCase(), entry.data]))
  const paths = entries.map((entry) => entry.path)

  if (entries.length === 0) throw new Error('The pack is empty.')
  if (paths.length > MAX_PACK_ITEMS * 4) throw new Error('The pack has too many files.')

  const manifestPath = source.mapping ? null : findManifestPath(paths)
  const manifest = source.mapping
    ? readManifestJson(source.mapping, source.mappingName ?? 'The mapping file')
    : manifestPath
      ? readManifestJson(
          new TextDecoder('utf-8')
            .decode(files.get(manifestPath.toLowerCase()) ?? new Uint8Array())
            .replace(/^\uFEFF/, ''),
          manifestPath,
        )
      : null

  const existing = listStudioItems().map((item) => ({ kind: item.kind, name: item.name }))
  const plan = planPack({
    entries: entries.map((entry) => ({ path: entry.path, size: entry.data.byteLength })),
    manifest,
    manifestPath,
    fallbackKind: source.kind,
    existing,
  })

  if (plan.items.length > MAX_PACK_ITEMS) {
    throw new Error(`A pack can import at most ${MAX_PACK_ITEMS} items.`)
  }

  const result: PackImportResult = {
    name: plan.name,
    manifestPath,
    imported: [],
    skipped: plan.skipped,
    failed: plan.issues.map((issue) => ({ file: issue.file, error: issue.error })),
    ignored: plan.ignored,
  }

  for (const item of plan.items) {
    try {
      const buffer = files.get(item.file.toLowerCase())
      if (!buffer) throw new Error('File not found in the pack.')
      const mime = await imageMime(buffer)
      const asset = await storeBuffer({ buffer: Buffer.from(buffer), mime, kind: 'image', source: 'studio' })

      let cleanAssetId: string | null = null
      if (item.cleanFile) {
        const clean = files.get(item.cleanFile.toLowerCase())
        if (!clean) throw new Error(`Prepared image not found: ${item.cleanFile}`)
        cleanAssetId = (
          await storeBuffer({
            buffer: Buffer.from(clean),
            mime: await imageMime(clean),
            kind: 'image',
            source: 'studio',
          })
        ).id
      }

      const data = { ...item.data }
      if (item.characterSheetFile) {
        const sheet = files.get(item.characterSheetFile.toLowerCase())
        if (!sheet) throw new Error(`Character sheet not found: ${item.characterSheetFile}`)
        data.characterSheetAssetId = (
          await storeBuffer({
            buffer: Buffer.from(sheet),
            mime: await imageMime(sheet),
            kind: 'image',
            source: 'studio',
          })
        ).id
      }

      const saved = saveStudioItem({
        kind: item.kind,
        name: item.name,
        assetId: asset.id,
        cleanAssetId,
        data,
      })
      result.imported.push({ id: saved.id, kind: saved.kind, name: saved.name })
    } catch (error) {
      result.failed.push({
        file: item.file,
        error: error instanceof Error ? error.message : 'Import failed',
      })
    }
  }

  return result
}
