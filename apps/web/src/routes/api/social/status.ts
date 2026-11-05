import { createFileRoute } from '@tanstack/react-router'
import { cobaltOnline } from '~/server/social.server'

export const Route = createFileRoute('/api/social/status')({
  server: {
    handlers: {
      GET: async () => Response.json({ online: await cobaltOnline() }),
    },
  },
})
