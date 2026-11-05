import { createFileRoute } from '@tanstack/react-router'
import { getDatabaseInfo } from '@sunnygen/db'
import { ensurePoller } from '~/server/generation-poller.server'

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: () => {
        ensurePoller()
        return Response.json({
          ok: true,
          database: getDatabaseInfo().version,
        })
      },
    },
  },
})
