import type { FalImageCapabilities, SunraImageCapabilities } from '@sunnygen/providers'

export const SUNRA_EDIT_OPERATIONS = ['image-editing', 'image-to-image', 'reference-images-to-image']

const FAL_COMPATIBLE_OUTPUTS: Record<string, true> = { Image: true, Video: true }

export interface CatalogCapabilities {
  supportsImages: boolean
  supportsText: boolean
  maxImages: number
  editSourceId: string | null
  available: boolean
  limitation: string | null
}

export function sunraEditOperation(endpoints: string[]): string | null {
  return SUNRA_EDIT_OPERATIONS.find((operation) => endpoints.includes(operation)) ?? null
}

export function sunraModelCapabilities(
  endpoints: string[],
  schema: SunraImageCapabilities | null,
  alias: string,
): CatalogCapabilities {
  const edit = sunraEditOperation(endpoints)
  const text = endpoints.includes('text-to-image')
  const capabilities = schema
  const supportsImages = Boolean(edit) && (capabilities ? capabilities.supportsImages : true)
  const maxImages = supportsImages ? (capabilities?.maxImages ?? 1) : 0
  const supported: CatalogCapabilities = {
    supportsImages,
    supportsText: text,
    maxImages,
    editSourceId: supportsImages && edit ? `${alias}/${edit}` : null,
    available: true,
    limitation: null,
  }
  if (!text && !supportsImages) {
    return {
      ...supported,
      available: false,
      limitation:
        endpoints.length > 0 ? `Requires ${endpoints[0]?.replaceAll('-', ' ')}` : 'Unsupported input flow',
    }
  }
  if (!text) return { ...supported, limitation: 'Needs a reference image' }
  return supported
}

export function falAvailability(
  inputs: string[],
  outputs: string[],
  required: string[] = [],
): { available: boolean; limitation: string | null } {
  if (outputs.length > 0 && !outputs.some((output) => FAL_COMPATIBLE_OUTPUTS[output])) {
    return { available: false, limitation: 'No image or video output' }
  }
  if (required.length > 0) {
    const unsupported = required.find((field) => /(video|audio|pdf|mask|mesh|3d|depth)/i.test(field))
    if (unsupported) {
      return { available: false, limitation: `Requires ${unsupported.replaceAll('_', ' ')} input` }
    }
    const unknown = required.find(
      (field) =>
        field !== 'prompt' &&
        field !== 'num_images' &&
        field !== 'output_format' &&
        field !== 'aspect_ratio' &&
        !/image|photo|frame|reference/i.test(field),
    )
    if (unknown) {
      return { available: false, limitation: `Requires ${unknown.replaceAll('_', ' ')} input` }
    }
    return { available: true, limitation: null }
  }
  const unsupportedInput = inputs.find((input) => input === 'Audio' || input === 'Video' || input === '3D')
  if (unsupportedInput) {
    return { available: false, limitation: `Requires ${unsupportedInput.toLowerCase()} input` }
  }
  return { available: true, limitation: null }
}

export function falModelCapabilities(input: {
  endpoint: string
  base: FalImageCapabilities | null
  edit: FalImageCapabilities | null
  required: string[]
  docsInputs: string[]
  docsOutputs: string[]
}): CatalogCapabilities {
  const availability = falAvailability(input.docsInputs, input.docsOutputs, input.required)
  const editCapable = Boolean(input.edit?.supportsImages)
  const baseCapable = Boolean(input.base?.supportsImages)
  const supportsImages = editCapable || baseCapable
  const maxImages = input.edit?.maxImages ?? input.base?.maxImages ?? 0
  const supportsText = Boolean(input.base?.supportsText)
  const limitation =
    availability.limitation ??
    (supportsText ? null : supportsImages ? 'Needs a reference image' : 'Requires an image input')
  return {
    supportsImages,
    supportsText,
    maxImages: supportsImages ? Math.max(1, maxImages) : 0,
    editSourceId: editCapable ? `${input.endpoint}/edit` : null,
    available: availability.available && (supportsText || supportsImages),
    limitation,
  }
}
