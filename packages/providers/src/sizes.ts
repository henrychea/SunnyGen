const GPT_IMAGE_SIZES: Record<string, Record<string, string>> = {
  '1k': {
    '1:1': '1024x1024',
    '16:9': '1536x864',
    '9:16': '864x1536',
    '4:3': '1280x960',
    '3:4': '960x1280',
    '3:2': '1536x1024',
    '2:3': '1024x1536',
    '21:9': '2016x864',
    '27:16': '1728x1024',
    '16:27': '1024x1728',
    '9:8': '1152x1024',
    '8:9': '1024x1152',
  },
  '2k': {
    '1:1': '2048x2048',
    '16:9': '3072x1728',
    '9:16': '1728x3072',
    '4:3': '2560x1920',
    '3:4': '1920x2560',
    '3:2': '3072x2048',
    '2:3': '2048x3072',
    '21:9': '3840x1648',
    '27:16': '3456x2048',
    '16:27': '2048x3456',
    '9:8': '2304x2048',
    '8:9': '2048x2304',
  },
  '4k': {
    '1:1': '3072x3072',
    '16:9': '3840x2160',
    '9:16': '2160x3840',
    '4:3': '3072x2304',
    '3:4': '2304x3072',
    '3:2': '3456x2304',
    '2:3': '2304x3456',
    '21:9': '3840x1648',
    '27:16': '3456x2048',
    '16:27': '2048x3456',
    '9:8': '3456x3072',
    '8:9': '3072x3456',
  },
}

export function gptImageSize(aspectRatio: string, quality: string): { width: number; height: number } | null {
  const tier = GPT_IMAGE_SIZES[quality] ?? GPT_IMAGE_SIZES['1k']
  const exact = tier?.[aspectRatio] ?? GPT_IMAGE_SIZES['1k']?.[aspectRatio]
  if (exact) {
    const parts = exact.split('x')
    return { width: Number(parts[0] ?? 0), height: Number(parts[1] ?? 0) }
  }

  const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(aspectRatio)
  if (!match) return null
  const ratioWidth = Number(match[1])
  const ratioHeight = Number(match[2])
  if (!ratioWidth || !ratioHeight) return null

  const shortEdge = quality === '4k' ? 3072 : quality === '2k' ? 2048 : 1024
  const scale = shortEdge / Math.min(ratioWidth, ratioHeight)
  let width = Math.round((ratioWidth * scale) / 16) * 16
  let height = Math.round((ratioHeight * scale) / 16) * 16
  if (width > 3840 || height > 3840) {
    const shrink = 3840 / Math.max(width, height)
    width = Math.floor((width * shrink) / 16) * 16
    height = Math.floor((height * shrink) / 16) * 16
  }
  return { width, height }
}

export const IMAGE_SIZE_MAX_SIDE = 3840
export const IMAGE_SIZE_MAX_PIXELS = 8_294_400
export const IMAGE_SIZE_MIN_PIXELS = 655_360

export function boundedImageSize(
  aspectRatio: string,
  quality: string,
): { width: number; height: number } | null {
  const size = gptImageSize(aspectRatio, quality)
  if (!size) return null
  let width = Math.min(size.width, IMAGE_SIZE_MAX_SIDE)
  let height = Math.min(size.height, IMAGE_SIZE_MAX_SIDE)
  if (width * height > IMAGE_SIZE_MAX_PIXELS) {
    const scale = Math.sqrt(IMAGE_SIZE_MAX_PIXELS / (width * height))
    width = Math.floor((width * scale) / 16) * 16
    height = Math.floor((height * scale) / 16) * 16
  }
  if (width * height < IMAGE_SIZE_MIN_PIXELS) {
    const scale = Math.sqrt(IMAGE_SIZE_MIN_PIXELS / (width * height))
    width = Math.ceil((width * scale) / 16) * 16
    height = Math.ceil((height * scale) / 16) * 16
  }
  const longest = Math.max(width, height)
  const shortest = Math.min(width, height)
  if (longest / shortest > 3) {
    height = Math.floor(height / 16) * 16
    width = Math.floor(width / 16) * 16
  }
  if (width <= 0 || height <= 0) return null
  return { width, height }
}

export function sizeString(size: { width: number; height: number } | null): string | null {
  return size ? `${size.width}x${size.height}` : null
}

export function azureSize(aspectRatio: string, quality: string): string {
  if (!aspectRatio || aspectRatio === 'auto') return 'auto'
  return sizeString(boundedImageSize(aspectRatio, quality)) ?? '1024x1024'
}

export function codexSize(aspectRatio: string, quality: string): string {
  if (!aspectRatio || aspectRatio === 'auto') return 'auto'
  return sizeString(boundedImageSize(aspectRatio, quality)) ?? 'auto'
}
