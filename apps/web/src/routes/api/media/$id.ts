import { createFileRoute } from '@tanstack/react-router'
import { openAssetFile, kindForMime } from '~/server/media.server'

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
        const initial = await openAssetFile(params.id)
        if (!initial) return new Response('Not found', { status: 404 })

        const range = parseRange(request.headers.get('range'), initial.totalBytes)
        const file = range ? await openAssetFile(params.id, range) : initial
        if (!file) return new Response('Not found', { status: 404 })

        const length = file.end - file.start + 1
        const download = new URL(request.url).searchParams.has('download') || !kindForMime(file.mime)
        const headers = new Headers({
          'Content-Type': download ? 'application/octet-stream' : file.mime,
          'Content-Length': String(length),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=31536000, immutable',
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
      HEAD: async ({ params }) => {
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
