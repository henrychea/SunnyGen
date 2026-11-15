import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { ProviderId } from '@sunnygen/core'
import { readSetting, writeSetting } from '@sunnygen/db'

const TOKEN_SETTING = 'webhook.token'
const TOKEN_BYTES = 32
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/

/**
 * Public origin providers can reach. Webhooks need a route from the internet,
 * so they stay disabled unless the operator names the public origin explicitly.
 */
function publicBaseUrl(): string | null {
  const raw = process.env.SUNNYGEN_PUBLIC_URL?.trim()
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.origin
  } catch {
    return null
  }
}

function webhookToken(): string {
  const stored = readSetting(TOKEN_SETTING)
  if (stored && TOKEN_PATTERN.test(stored)) return stored
  const token = randomBytes(TOKEN_BYTES).toString('base64url')
  writeSetting(TOKEN_SETTING, token)
  return readSetting(TOKEN_SETTING) ?? token
}

export function providerWebhookUrl(provider: ProviderId): string | null {
  const base = publicBaseUrl()
  if (!base) return null
  return `${base}/api/webhooks/${provider}/${webhookToken()}`
}

export function webhookTokenMatches(token: string): boolean {
  const expected = readSetting(TOKEN_SETTING)
  if (!expected || !TOKEN_PATTERN.test(expected)) return false
  const actual = Buffer.from(token, 'utf8')
  const wanted = Buffer.from(expected, 'utf8')
  return actual.length === wanted.length && timingSafeEqual(actual, wanted)
}
