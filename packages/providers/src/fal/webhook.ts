import type { ProviderWebhook } from '../types'

export const falWebhook: ProviderWebhook = {
  queryParam: 'fal_webhook',
  requestId(payload) {
    return typeof payload.request_id === 'string' && payload.request_id.length > 0
      ? payload.request_id
      : null
  },
}
