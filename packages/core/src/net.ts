const PRIVATE_V4 = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
]

/**
 * True for loopback, link-local, CGNAT/Tailscale, and RFC 1918 addresses plus
 * mDNS names. Used to keep server-side fetches away from the local network.
 */
export function isPrivateHostname(hostname: string): boolean {
  const host = hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
  if (!host) return true
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true
  if (PRIVATE_V4.some((pattern) => pattern.test(host))) return true
  if (host === '::' || host === '::1') return true
  if (/^(fc|fd|fe8|fe9|fea|feb)/.test(host) && host.includes(':')) return true
  return false
}
