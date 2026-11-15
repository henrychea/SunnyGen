import type { ProviderWebhook } from '../types'

export const sunraWebhook: ProviderWebhook = {
  queryParam: 'webhook',
  requestId(payload) {
    return typeof payload.id === 'string' && payload.id.length > 0 ? payload.id : null
  },
}
