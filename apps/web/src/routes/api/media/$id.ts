import { createFileRoute } from '@tanstack/react-router'
import { snapThumbWidth } from '~/lib/media-thumbs'
import { openAssetFile, openAssetThumbFile, kindForMime } from '~/server/media.server'

const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable'

function thumbHeaders(totalBytes: number): Headers {
  return new Headers({
    'Content-Type': 'image/webp',
    'Content-Length': String(totalBytes),
    'Cache-Control': IMMUTABLE_CACHE,
    'X-Content-Type-Options': 'nosniff',
  })
}

function parseRange(header: string | null, total: number): { start: number; end: number } | null {
  if (!header?.startsWith('bytes=')) return null
  const [rawStart, rawEnd] = header.slice(6).split('-')
  if (rawStart === '' && rawEnd === '') return null
  if (rawStart === '' && rawEnd !== undefined) {
    const suffix = Number(rawEnd)
    if (!Number.isFinite(suffix) || suffix <= 0) return null
    return { start: Math.max(total - suffix, 0), end: total - 1 }
  }
  const start = Number(rawStart)
  if (!Number.isFinite(start) || start < 0 || start >= total) return null
  const end = rawEnd === undefined || rawEnd === '' ? total - 1 : Number(rawEnd)
  if (!Number.isFinite(end) || end < start) return null
  return { start, end: Math.min(end, total - 1) }
}

export const Route = createFileRoute('/api/media/$id')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const url = new URL(request.url)
        const width = url.searchParams.has('download') ? null : snapThumbWidth(url.searchParams.get('w'))
        if (width) {
          const thumb = await openAssetThumbFile(params.id, width).catch(() => null)
          if (thumb) {
            return new Response(thumb.stream, { status: 200, headers: thumbHeaders(thumb.totalBytes) })
          }
        }

        const initial = await openAssetFile(params.id)
        if (!initial) return new Response('Not found', { status: 404 })

        const range = parseRange(request.headers.get('range'), initial.totalBytes)
        const file = range ? await openAssetFile(params.id, range) : initial
        if (!file) return new Response('Not found', { status: 404 })

        const length = file.end - file.start + 1
        const download = url.searchParams.has('download') || !kindForMime(file.mime)
        const headers = new Headers({
          'Content-Type': download ? 'application/octet-stream' : file.mime,
          'Content-Length': String(length),
          'Accept-Ranges': 'bytes',
          'Cache-Control': IMMUTABLE_CACHE,
          'X-Content-Type-Options': 'nosniff',
        })
        if (range) {
          headers.set('Content-Range', `bytes ${file.start}-${file.end}/${file.totalBytes}`)
        }
        if (download) {
          const extension = kindForMime(file.mime)
            ? (file.mime.split('/')[1]?.replace('jpeg', 'jpg') ?? 'bin')
            : 'bin'
          headers.set('Content-Disposition', `attachment; filename="${params.id}.${extension}"`)
          headers.set('Cache-Control', 'no-store')
        }

        return new Response(file.stream, {
          status: range ? 206 : 200,
          headers,
        })
      },
      HEAD: async ({ params, request }) => {
        const width = snapThumbWidth(new URL(request.url).searchParams.get('w'))
        if (width) {
          const thumb = await openAssetThumbFile(params.id, width).catch(() => null)
          if (thumb) return new Response(null, { status: 200, headers: thumbHeaders(thumb.totalBytes) })
        }
        const file = await openAssetFile(params.id)
        if (!file) return new Response(null, { status: 404 })
        return new Response(null, {
          status: 200,
          headers: {
            'Content-Type': kindForMime(file.mime) ? file.mime : 'application/octet-stream',
            'Content-Length': String(file.totalBytes),
            'Accept-Ranges': 'bytes',
          },
        })
      },
    },
  },
})
