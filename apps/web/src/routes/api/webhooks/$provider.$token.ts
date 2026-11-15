import { createFileRoute } from '@tanstack/react-router'
import { handleProviderWebhook } from '~/server/webhooks.server'

export const Route = createFileRoute('/api/webhooks/$provider/$token')({
  server: {
    handlers: {
      POST: ({ request, params }) => handleProviderWebhook(params.provider, params.token, request),
    },
  },
})
