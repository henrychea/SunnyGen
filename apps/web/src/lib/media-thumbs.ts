export const THUMB_WIDTHS = [160, 320, 640, 1280] as const

export type ThumbWidth = (typeof THUMB_WIDTHS)[number]

export function snapThumbWidth(value: string | null): ThumbWidth | null {
  if (value === null) return null
  const raw = value.trim()
  if (raw === '') return null
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0) return null
  let snapped: ThumbWidth = THUMB_WIDTHS[0]
  for (const width of THUMB_WIDTHS) {
    if (width <= parsed) snapped = width
  }
  return snapped
}

export function thumbUrl(url: string, width: ThumbWidth): string {
  if (!url.startsWith('/api/media/')) return url
  const [path, query = ''] = url.split('?')
  const params = new URLSearchParams(query)
  params.set('w', String(width))
  return `${path}?${params.toString()}`
}

export function thumbSrcSet(url: string, widths: readonly ThumbWidth[] = [320, 640]): string {
  return widths.map((width) => `${thumbUrl(url, width)} ${width}w`).join(', ')
}
