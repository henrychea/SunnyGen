import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { importSocialPost } from '~/server/social.server'
import { payloadTooLarge } from '~/server/guards.server'

const bodySchema = z.object({ url: z.string().url() })

export const Route = createFileRoute('/api/social/resolve')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const tooLarge = payloadTooLarge(request, 1_048_576)
        if (tooLarge) return tooLarge

        let payload: unknown
        try {
          payload = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }
        const parsed = bodySchema.safeParse(payload)
        if (!parsed.success) {
          return Response.json({ error: 'A valid http(s) URL is required' }, { status: 400 })
        }
        try {
          const assets = await importSocialPost(parsed.data.url)
          return Response.json({ assets })
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : 'Import failed' },
            { status: 502 },
          )
        }
      },
    },
  },
})
