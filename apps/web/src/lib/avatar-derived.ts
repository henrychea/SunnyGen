/**
 * A new image in any slot makes everything cut from the old ones stale: the crop tiles, the
 * board files, the stored boxes and the legacy cell selection. The save payload drops them so
 * the server never keeps a crop that belongs to an image the avatar no longer has.
 */
export const DERIVED_AVATAR_KEYS = ['crops', 'cropTiles', 'cropCells', 'cropRegions', 'boards'] as const

export function withoutDerived(data: Record<string, unknown> | undefined): Record<string, unknown> {
  const next = { ...data }
  for (const key of DERIVED_AVATAR_KEYS) delete next[key]
  return next
}

export function hasDerived(data: Record<string, unknown> | undefined): boolean {
  return DERIVED_AVATAR_KEYS.some((key) => data?.[key] !== undefined)
}
