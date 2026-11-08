import { createFileRoute } from '@tanstack/react-router'
import { STUDIO_KINDS } from '@sunnygen/core'
import { MAX_UPLOAD_BYTES, kindForMime, storeBuffer, toPublicAsset } from '~/server/media.server'
import { payloadTooLarge } from '~/server/guards.server'

export const Route = createFileRoute('/api/studio-upload')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const tooLarge = payloadTooLarge(request, MAX_UPLOAD_BYTES + 1_048_576)
        if (tooLarge) return tooLarge

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
        const kind = form.get('kind')
        if (typeof kind !== 'string' || !(STUDIO_KINDS as readonly string[]).includes(kind)) {
          return Response.json({ error: 'A studio kind is required' }, { status: 400 })
        }
        if (file.size <= 0) {
          return Response.json({ error: 'The file is empty' }, { status: 400 })
        }
        if (file.size > MAX_UPLOAD_BYTES) {
          return Response.json({ error: 'File exceeds 100 MB limit' }, { status: 413 })
        }

        const mime = (file.type || 'application/octet-stream').split(';')[0]?.trim() ?? ''
        if (kindForMime(mime) !== 'image') {
          return Response.json({ error: 'Choose an image file.' }, { status: 415 })
        }

        try {
          const asset = await storeBuffer({
            buffer: Buffer.from(await file.arrayBuffer()),
            mime,
            kind: 'image',
            source: 'studio',
          })
          return Response.json(toPublicAsset(asset))
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
