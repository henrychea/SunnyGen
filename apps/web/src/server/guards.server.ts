import { isPrivateHostname } from '@sunnygen/core'

/**
 * Blocks DNS-rebinding requests: a browser resolving attacker.example to a LAN
 * address still sends that public name in Host, so only local names, Cloudflare
 * Tunnel requests, and explicitly allowlisted hosts may reach the app.
 */
export function hostGuard(request: Request): Response | null {
  const header = request.headers.get('host')
  if (!header) return null
  const trimmed = header.trim().toLowerCase()
  const host = trimmed.startsWith('[')
    ? (() => {
        const end = trimmed.indexOf(']')
        return end > 0 ? trimmed.slice(1, end) : trimmed
      })()
    : (trimmed.split(':')[0] ?? '')
  if (!host) return null
  if (host === 'localhost' || host.endsWith('.localhost')) return null
  if (host.endsWith('.local') || host.endsWith('.ts.net')) return null
  if (isPrivateHostname(host)) return null
  if (request.headers.get('cf-ray') || request.headers.get('cf-connecting-ip')) return null
  const allowed = (process.env.SUNNYGEN_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
  if (allowed.includes(host)) return null
  return new Response('Forbidden host', { status: 403 })
}

/**
 * Blocks cross-site browser requests to state-changing handlers. Non-browser
 * callers (curl, scripts) send neither header and are unaffected.
 */
export function originGuard(request: Request): Response | null {
  if (request.method === 'GET' || request.method === 'HEAD') return null
  const site = request.headers.get('sec-fetch-site')
  if (site === 'cross-site' || site === 'same-site') {
    return new Response('Forbidden origin', { status: 403 })
  }
  const origin = request.headers.get('origin')
  if (origin === null) return null

  let expected: string
  try {
    // Cloudflare Tunnel terminates TLS and forwards plain HTTP while keeping
    // the public Host, so rebuild the browser-visible origin from proxy headers.
    const url = new URL(request.url)
    const protocol =
      request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || url.protocol.slice(0, -1)
    const host = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() || url.host
    if (protocol !== 'http' && protocol !== 'https') {
      return new Response('Forbidden origin', { status: 403 })
    }
    expected = new URL(`${protocol}://${host}`).origin
  } catch {
    return new Response('Forbidden origin', { status: 403 })
  }

  try {
    return new URL(origin).origin === expected ? null : new Response('Forbidden origin', { status: 403 })
  } catch {
    return new Response('Forbidden origin', { status: 403 })
  }
}

/** Rejects oversized bodies before they are buffered in memory. */
export function payloadTooLarge(request: Request, maxBytes: number): Response | null {
  const raw = request.headers.get('content-length')
  if (!raw) return null
  const length = Number(raw)
  if (!Number.isFinite(length) || length <= maxBytes) return null
  return Response.json(
    { error: `Request body exceeds the ${Math.round(maxBytes / 1_048_576)} MB limit` },
    { status: 413 },
  )
}
