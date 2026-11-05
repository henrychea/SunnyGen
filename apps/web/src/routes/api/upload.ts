import { createFileRoute } from '@tanstack/react-router'
import { MAX_UPLOAD_BYTES, storeBuffer, toPublicAsset, kindForMime } from '~/server/media.server'

export const Route = createFileRoute('/api/upload')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let form: FormData
        try {
          form = await request.formData()
        } catch {
          return Response.json({ error: 'Expected multipart form data' }, { status: 400 })
        }

        const file = form.get('file')
        if (!(file instanceof File)) {
          return Response.json({ error: 'A file field is required' }, { status: 400 })
        }
        if (file.size <= 0) {
          return Response.json({ error: 'The file is empty' }, { status: 400 })
        }
        if (file.size > MAX_UPLOAD_BYTES) {
          return Response.json({ error: 'File exceeds the 100 MB limit' }, { status: 413 })
        }

        const mime = (file.type || 'application/octet-stream').split(';')[0]?.trim() ?? ''
        if (!kindForMime(mime)) {
          return Response.json({ error: `Unsupported media type: ${mime || 'unknown'}` }, { status: 415 })
        }

        const folderId = form.get('folderId')
        try {
          const asset = await storeBuffer({
            buffer: Buffer.from(await file.arrayBuffer()),
            mime,
            source: 'upload',
            folderId: typeof folderId === 'string' && folderId ? folderId : null,
          })
          return Response.json({ asset: toPublicAsset(asset) })
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : 'Upload failed' },
            { status: 500 },
          )
        }
      },
    },
  },
})
