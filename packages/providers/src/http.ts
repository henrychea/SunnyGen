import { isPrivateHostname } from '@sunnygen/core'
import type { ProviderOutput } from './types'

const MAX_OUTPUT_BYTES = 512 * 1024 * 1024

export function errorMessage(value: unknown, fallback = 'Generation failed'): string {
  if (!value) return fallback
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    const first = value[0]
    if (first && typeof first === 'object') {
      if ('message' in first && typeof first.message === 'string') return first.message
      if ('msg' in first && typeof first.msg === 'string') return first.msg
      if ('detail' in first && typeof first.detail === 'string') return first.detail
    }
    return JSON.stringify(value).slice(0, 500)
  }
  if (typeof value === 'object') {
    if ('message' in value && typeof value.message === 'string') return value.message
    if ('reason' in value && typeof value.reason === 'string') return value.reason
    if ('detail' in value && typeof value.detail === 'string') return value.detail
    if ('code' in value && typeof value.code === 'string') {
      const message = 'message' in value && typeof value.message === 'string' ? value.message : value.code
      return value.code === message ? value.code : `${value.code}: ${message}`
    }
  }
  return fallback
}

export async function responseError(response: Response, fallback: string): Promise<string> {
  const text = await response.text().catch(() => '')
  if (!text) return fallback
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>
    if (parsed.error) return errorMessage(parsed.error, fallback)
    if (parsed.message) return errorMessage(parsed.message, fallback)
    if (parsed.detail) return errorMessage(parsed.detail, fallback)
  } catch {
    // Use the raw body.
  }
  return text.slice(0, 500)
}

export async function downloadOutput(url: string): Promise<ProviderOutput> {
  if (!isHttpUrl(url)) throw new Error('Provider returned a non-http output URL')
  if (isPrivateHostname(new URL(url).hostname)) throw new Error('Provider returned a private output URL')
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(120_000) })
  if (!response.ok) throw new Error(`Could not download output (HTTP ${response.status})`)
  if (isPrivateHostname(new URL(response.url).hostname)) {
    throw new Error('Provider redirected to a private output URL')
  }
  const declared = Number(response.headers.get('content-length') ?? 0)
  if (declared > MAX_OUTPUT_BYTES) throw new Error('Provider output exceeds the size limit')
  const mime =
    (response.headers.get('content-type') ?? '').split(';')[0]?.trim() || 'application/octet-stream'
  if (!response.body) throw new Error('Provider returned an empty output')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_OUTPUT_BYTES) {
      await reader.cancel()
      throw new Error('Provider output exceeds the size limit')
    }
    chunks.push(value)
  }
  return { buffer: Buffer.concat(chunks), mime }
}

export function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}
