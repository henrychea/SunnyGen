export interface ImageSize {
  bytes: number
  width: number | null
  height: number | null
}

export interface ImageLimits {
  bytes: number
  side: number
  pixels: number
}

export const DEFAULT_IMAGE_LIMITS: ImageLimits = {
  bytes: 10 * 1024 * 1024,
  side: 4096,
  pixels: 16_800_000,
}

export function isOversizedImage(image: ImageSize, limits: ImageLimits = DEFAULT_IMAGE_LIMITS): boolean {
  if (image.bytes > limits.bytes) return true
  if (image.width === null || image.height === null) return false
  if (image.width <= 0 || image.height <= 0) return false
  return image.width > limits.side || image.height > limits.side || image.width * image.height > limits.pixels
}
