import { DEFAULT_IMAGE_LIMITS, isOversizedImage, type ImageLimits } from '@sunnygen/core'
import type { ReferenceItem } from './reference-images'

export function referenceIsOversized(
  item: ReferenceItem,
  limits: ImageLimits = DEFAULT_IMAGE_LIMITS,
): boolean {
  if (item.byteSize === undefined) return false
  return isOversizedImage(
    { bytes: item.byteSize, width: item.width ?? null, height: item.height ?? null },
    limits,
  )
}

export function oversizedReferences(
  items: ReferenceItem[],
  limits: ImageLimits = DEFAULT_IMAGE_LIMITS,
): ReferenceItem[] {
  return items.filter((item) => referenceIsOversized(item, limits))
}

export function shouldConfirmResize(
  items: ReferenceItem[],
  options: { suppressed: boolean },
  limits: ImageLimits = DEFAULT_IMAGE_LIMITS,
): boolean {
  if (options.suppressed) return false
  return items.some((item) => referenceIsOversized(item, limits))
}
