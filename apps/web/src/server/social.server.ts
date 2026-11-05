import { z } from 'zod'
import type { AssetKind } from '@sunnygen/core'
import { storeRemoteAsset, toPublicAsset, type PublicAsset } from './media.server'

const pickerSchema = z.object({
  status: z.literal('picker'),
  picker: z.array(z.object({ url: z.string().min(1), type: z.string().optional() })),
})

const singleSchema = z.object({
  status: z.enum(['tunnel', 'redirect']),
  url: z.string().min(1),
})

const errorSchema = z.object({
  status: z.literal('error'),
  error: z.object({ code: z.string().optional(), message: z.string().optional() }).optional(),
})

const responseSchema = z.union([pickerSchema, singleSchema, errorSchema])

function cobaltBaseUrl(): string {
  const raw = process.env.COBALT_API_URL?.trim() || 'http://127.0.0.1:9000/'
  return raw.endsWith('/') ? raw : `${raw}/`
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  const key = process.env.COBALT_API_KEY?.trim()
  if (key) headers.Authorization = `Api-Key ${key}`
  return headers
}

function rewriteTunnel(url: string, base: string): string {
  try {
    const parsed = new URL(url)
    return parsed.pathname.startsWith('/tunnel')
      ? `${new URL(base).origin}${parsed.pathname}${parsed.search}`
      : url
  } catch {
    return url
  }
}

function cobaltErrorMessage(code: string): string {
  const value = code.toLowerCase()
  if (value.includes('rate')) return 'Cobalt is rate limited. Try again in a moment.'
  if (value.includes('unsupported') && value.includes('service'))
    return 'This service is not supported by your cobalt instance.'
  if (value.includes('unsupported') || value.includes('link')) return 'This link is not supported by cobalt.'
  if (value.includes('fetch.fail'))
    return 'Cobalt could not reach that post. It may be private, deleted, or blocked.'
  if (value.includes('auth') || value.includes('key') || value.includes('cookie'))
    return 'Cobalt needs credentials for this post.'
  if (value.includes('empty')) return 'This post has no media to import.'
  return 'Could not fetch this post.'
}

export interface SocialItem {
  url: string
  kind: AssetKind
}

export async function resolveSocialPost(url: string): Promise<SocialItem[]> {
  const base = cobaltBaseUrl()
  let response: Response
  try {
    response = await fetch(base, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ url, downloadMode: 'auto', alwaysProxy: true }),
      signal: AbortSignal.timeout(20_000),
    })
  } catch {
    throw new Error(
      'Cobalt is not reachable. Start it with `./sunnygen --cobalt` or `docker compose up -d cobalt`.',
    )
  }

  const text = await response.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(`Cobalt returned ${response.status}.`)
  }

  const result = responseSchema.safeParse(parsed)
  if (!result.success) throw new Error('Cobalt returned an unexpected response.')

  if (result.data.status === 'error') {
    throw new Error(cobaltErrorMessage(result.data.error?.code ?? 'error.unexpected'))
  }
  if (result.data.status === 'picker') {
    const items = result.data.picker.map((item) => ({
      url: rewriteTunnel(item.url, base),
      kind: item.type === 'video' ? ('video' as const) : ('image' as const),
    }))
    if (items.length === 0) throw new Error('This post has no media to import.')
    return items
  }

  const isVideo = /\.(mp4|webm|mov|mkv)(\?|#|$)/i.test(result.data.url)
  return [{ url: rewriteTunnel(result.data.url, base), kind: isVideo ? 'video' : 'image' }]
}

export async function importSocialPost(url: string): Promise<PublicAsset[]> {
  const items = (await resolveSocialPost(url)).slice(0, 10)
  const assets: PublicAsset[] = []
  for (const item of items) {
    const asset = await storeRemoteAsset(item.url, { kind: item.kind, source: 'social' })
    assets.push(toPublicAsset(asset))
  }
  return assets
}

export async function cobaltOnline(): Promise<boolean> {
  try {
    const response = await fetch(cobaltBaseUrl(), {
      headers: authHeaders(),
      signal: AbortSignal.timeout(2_500),
    })
    return response.ok
  } catch {
    return false
  }
}
