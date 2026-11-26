import { getCookie, setCookie } from '@tanstack/react-start/server'

export const NSFW_COOKIE = 'sunnygen.nsfw'

// The root route's pre-paint bootstrap reads the same cookie name as a literal.
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

export function readNsfwMode(): boolean {
  return getCookie(NSFW_COOKIE) === '1'
}

/** Readable from the inline theme bootstrap, so the NSFW tokens apply before first paint. */
export function writeNsfwMode(enabled: boolean): void {
  setCookie(NSFW_COOKIE, enabled ? '1' : '0', {
    path: '/',
    sameSite: 'lax',
    maxAge: ONE_YEAR_SECONDS,
    httpOnly: false,
  })
}
