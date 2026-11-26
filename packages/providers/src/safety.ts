import { enumValues, propertyType } from './schema'
import type { ProviderRequest } from './types'

const SAFETY_FIELD = /safety|moderation|moderate|censor/i

export function nsfwMode(request: ProviderRequest): boolean {
  return request.params.nsfw === true
}

/**
 * NSFW mode writes the least restrictive documented value for every safety
 * field in the request schema. Safe mode writes nothing, so each endpoint
 * keeps whatever body it sent before.
 */
export function applySafetyFields(
  body: Record<string, unknown>,
  properties: Record<string, unknown>,
  components: Record<string, unknown>,
  nsfw: boolean,
): void {
  if (!nsfw) return
  for (const [name, property] of Object.entries(properties)) {
    if (!SAFETY_FIELD.test(name)) continue
    const type = propertyType(property, components)
    if (type === 'boolean') {
      body[name] = false
      continue
    }
    const allowed = enumValues(property, components)
    if (allowed.length === 0) continue
    const numbers = allowed.map(Number)
    if (!numbers.every(Number.isFinite)) continue
    const highest = Math.max(...numbers)
    body[name] = type === 'integer' ? Math.round(highest) : type === 'number' ? highest : String(highest)
  }
}
