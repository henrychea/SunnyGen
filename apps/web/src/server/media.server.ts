import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { createAsset, findAssetBySha256, getAsset, mediaDir } from '@sunnygen/db'
import { isPrivateHostname, type AssetKind, type AssetRecord, type AssetSource } from '@sunnygen/core'
import sharp from 'sharp'

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024
const MAX_REMOTE_BYTES = 250 * 1024 * 1024

const MIME_KINDS: Record<string, AssetKind> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'image/gif': 'image',
  'image/avif': 'image',
  'video/mp4': 'video',
  'video/webm': 'video',
  'video/quicktime': 'video',
  'audio/mpeg': 'audio',
  'audio/wav': 'audio',
  'audio/ogg': 'audio',
}

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
  'audio/ogg': '.ogg',
}

export interface PublicAsset {
  id: string
  kind: AssetKind
  mime: string
  width: number | null
  height: number | null
  duration: number | null
  byteSize: number
  source: AssetSource
  url: string
  createdAt: number
}

export function assetUrl(assetId: string): string {
  return `/api/media/${assetId}`
}

export function toPublicAsset(asset: AssetRecord): PublicAsset {
  return {
    id: asset.id,
    kind: asset.kind,
    mime: asset.mime,
    width: asset.width,
    height: asset.height,
    duration: asset.duration,
    byteSize: asset.byteSize,
    source: asset.source,
    url: assetUrl(asset.id),
    createdAt: asset.createdAt,
  }
}

export function kindForMime(mime: string): AssetKind | null {
  return MIME_KINDS[mime.toLowerCase()] ?? null
}

async function imageDimensions(
  buffer: Buffer,
  kind: AssetKind,
): Promise<{ width: number | null; height: number | null }> {
  if (kind !== 'image') return { width: null, height: null }
  try {
    const metadata = await sharp(buffer).metadata()
    return { width: metadata.width ?? null, height: metadata.height ?? null }
  } catch {
    return { width: null, height: null }
  }
}

export interface StoreBufferInput {
  buffer: Buffer
  mime: string
  source: AssetSource
  folderId?: string | null
  kind?: AssetKind
}

export async function storeBuffer(input: StoreBufferInput): Promise<AssetRecord> {
  const mime = input.mime.split(';')[0]?.trim().toLowerCase() ?? 'application/octet-stream'
  const kind = input.kind ?? kindForMime(mime)
  if (!kind) throw new Error(`Unsupported media type: ${mime || 'unknown'}`)
  if (input.buffer.byteLength === 0) throw new Error('Empty file')
  if (input.buffer.byteLength > MAX_UPLOAD_BYTES) throw new Error('File exceeds the 100 MB limit')

  const sha256 = createHash('sha256').update(input.buffer).digest('hex')
  const existing = findAssetBySha256(sha256)
  if (existing) return existing

  const now = new Date()
  const folder = join(String(now.getUTCFullYear()), String(now.getUTCMonth() + 1).padStart(2, '0'))
  const extension = MIME_EXTENSIONS[mime] ?? '.bin'
  const relativePath = join(folder, `${randomUUID()}${extension}`)
  const absolutePath = join(mediaDir, relativePath)
  await mkdir(dirname(absolutePath), { recursive: true, mode: 0o700 })
  await writeFile(absolutePath, input.buffer, { mode: 0o600 })

  const dimensions = await imageDimensions(input.buffer, kind)
  return createAsset({
    kind,
    mime,
    byteSize: input.buffer.byteLength,
    width: dimensions.width,
    height: dimensions.height,
    sha256,
    source: input.source,
    path: relativePath,
    folderId: input.folderId ?? null,
  })
}

async function readCapped(response: Response, maxBytes: number): Promise<Buffer> {
  const declared = Number(response.headers.get('content-length') ?? 0)
  if (declared > maxBytes) throw new Error('Remote file exceeds the size limit')
  if (!response.body) return Buffer.alloc(0)
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new Error('Remote file exceeds the size limit')
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}

export async function storeRemoteAsset(
  url: string,
  options: {
    kind: AssetKind
    source?: AssetSource
    folderId?: string | null
    allowHosts?: string[]
  },
): Promise<AssetRecord> {
  let target: URL
  try {
    target = new URL(url)
  } catch {
    throw new Error('Remote URL is not valid')
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new Error('Remote URL must use http or https')
  }
  const allowed = new Set((options.allowHosts ?? []).map((host) => host.toLowerCase()))
  if (isPrivateHostname(target.hostname) && !allowed.has(target.hostname.toLowerCase())) {
    throw new Error('Remote host is not allowed')
  }

  const response = await fetch(target, { redirect: 'follow', signal: AbortSignal.timeout(60_000) })
  if (!response.ok) throw new Error(`Download failed: ${response.status}`)
  const finalHost = new URL(response.url).hostname.toLowerCase()
  if (isPrivateHostname(finalHost) && !allowed.has(finalHost)) {
    throw new Error('Remote host is not allowed')
  }
  const buffer = await readCapped(response, MAX_REMOTE_BYTES)
  const mime = (response.headers.get('content-type') ?? '').split(';')[0]?.trim()
  return storeBuffer({
    buffer,
    mime: mime || (options.kind === 'video' ? 'video/mp4' : 'image/png'),
    kind: options.kind,
    source: options.source ?? 'generated',
    folderId: options.folderId,
  })
}

function safeAssetPath(path: string): string {
  const absolute = resolve(mediaDir, path)
  const inside = relative(mediaDir, absolute)
  if (inside.startsWith('..') || inside === '') throw new Error('Invalid media path')
  return absolute
}

export interface AssetFile {
  stream: ReadableStream
  totalBytes: number
  start: number
  end: number
  mime: string
}

export async function openAssetFile(
  assetId: string,
  range?: { start: number; end?: number },
): Promise<AssetFile | null> {
  const asset = getAsset(assetId)
  if (!asset) return null
  const path = safeAssetPath(asset.path)
  const info = await stat(path)
  const start = range ? Math.max(0, Math.min(range.start, Math.max(info.size - 1, 0))) : 0
  const end = range?.end !== undefined ? Math.max(start, Math.min(range.end, info.size - 1)) : info.size - 1
  const stream = createReadStream(path, { start, end })
  return {
    stream: Readable.toWeb(stream) as ReadableStream,
    totalBytes: info.size,
    start,
    end,
    mime: asset.mime,
  }
}

export async function readAssetBuffer(
  assetId: string,
): Promise<{ asset: AssetRecord; buffer: Buffer } | null> {
  const asset = getAsset(assetId)
  if (!asset) return null
  const buffer = await readFile(safeAssetPath(asset.path))
  return { asset, buffer }
}

export async function removeAssetFile(assetId: string): Promise<void> {
  const asset = getAsset(assetId)
  if (!asset) return
  try {
    await unlink(safeAssetPath(asset.path))
  } catch {
    // The row can still be deleted when the file is already gone.
  }
}
