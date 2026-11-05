import { STUDIO_ANGLES, type GarmentSlot, type GarmentSource, type StudioAngle } from './domain'

export const STUDIO_ANGLE_LABELS: Record<StudioAngle, string> = {
  front: 'Front',
  'three-quarter': 'Three-quarter',
  side: 'Side',
  back: 'Back',
}

export const STUDIO_ANGLE_CAMERA: Record<StudioAngle, string> = {
  front: 'Straight-on camera at eye level, shoulder-width framing.',
  'three-quarter': 'Turn the subject 45 degrees to their left, keeping the face and outfit readable.',
  side: 'Full left profile, 90 degrees, with the same garments and silhouette.',
  back: 'From behind, 180 degrees. Keep the same garments visible from the back; never invent a different print, colour, or construction.',
}

export const SLOT_LABELS: Record<GarmentSlot, string> = {
  top: 'Top',
  bottom: 'Bottom',
  dress: 'Dress',
  outerwear: 'Outerwear',
  shoes: 'Shoes',
  bag: 'Bag',
  accessory: 'Accessory',
}

export const SOURCE_LABELS: Record<GarmentSource, string> = {
  'flat-lay': 'Flat lay',
  'on-model': 'On model',
  supplier: 'Supplier photo',
}

const SLOT_RANK: Record<GarmentSlot, number> = {
  dress: 0,
  top: 1,
  bottom: 2,
  outerwear: 3,
  shoes: 4,
  bag: 5,
  accessory: 6,
}

export interface StudioGarmentInput {
  id: string
  name: string
  slot: GarmentSlot
  sourceKind: GarmentSource
  hasCleanReference: boolean
  notes?: string
}

export interface StudioLookValidation {
  blocking: string[]
  warnings: string[]
}

export function orderStudioGarments<T extends { slot: GarmentSlot; name: string }>(garments: T[]): T[] {
  return [...garments].sort((left, right) => {
    const rank = SLOT_RANK[left.slot] - SLOT_RANK[right.slot]
    return rank !== 0 ? rank : left.name.localeCompare(right.name)
  })
}

export function validateStudioLook(garments: StudioGarmentInput[]): StudioLookValidation {
  const blocking: string[] = []
  const warnings: string[] = []
  const ordered = orderStudioGarments(garments)

  if (ordered.length > 6) blocking.push('6 pieces max per look.')

  for (const garment of ordered) {
    const needsPrep = garment.sourceKind === 'on-model' || garment.sourceKind === 'supplier'
    if (needsPrep && !garment.hasCleanReference) {
      blocking.push(`${garment.name} needs prep before it can be used.`)
    } else if (garment.sourceKind === 'flat-lay' && !garment.hasCleanReference) {
      warnings.push(`${garment.name} has no prepared reference; fidelity may drop.`)
    }
  }

  const slots = new Set(ordered.map((garment) => garment.slot))
  if (slots.has('dress') && (slots.has('top') || slots.has('bottom'))) {
    warnings.push('A dress with a top or bottom may layer incorrectly.')
  }

  const counts = new Map<GarmentSlot, number>()
  for (const garment of ordered) counts.set(garment.slot, (counts.get(garment.slot) ?? 0) + 1)
  for (const [slot, count] of counts) {
    const cap = slot === 'accessory' ? 2 : 1
    if (count > cap) {
      warnings.push(`Only ${cap} ${SLOT_LABELS[slot].toLowerCase()} piece${cap === 1 ? '' : 's'} allowed.`)
    }
  }

  return { blocking, warnings }
}

export function normalizeAngles(angles: StudioAngle[]): StudioAngle[] {
  const unique = new Set(angles)
  const ordered = STUDIO_ANGLES.filter((angle) => unique.has(angle))
  return ordered.length > 0 ? ordered : ['front']
}

export interface StudioPromptInput {
  garments: Array<StudioGarmentInput & { imageIndex: number }>
  hasPose: boolean
  poseImageIndex: number | null
  hasSceneImage: boolean
  sceneImageIndex: number | null
  angle: StudioAngle
  notes?: string
}

export function buildStudioPrompt(input: StudioPromptInput): string {
  const lines: string[] = []

  lines.push(
    'Full-body fashion photograph of the character in <<<image 1>>>, the attached identity reference sheet.',
  )
  lines.push(
    'Use image 1 only for identity: face shape, features, skin tone, hair, and body proportions. Do not use it as the base photo, and do not copy its grid layout, panel poses, backgrounds, or sheet clothing.',
  )
  lines.push('Wear exactly these garments, one per slot, in this order:')
  for (const [position, garment] of input.garments.entries()) {
    const details = garment.notes?.trim() ? ` Details: ${garment.notes.trim()}` : ''
    lines.push(
      `${position + 1}. <<<image ${garment.imageIndex}>>> — "${garment.name}" (${garment.slot}).${details}`,
    )
  }
  lines.push(
    'Preserve colour, fabric, print, hardware, stitching, and cut exactly. Do not invent, substitute, or remove any piece of clothing.',
  )

  if (input.hasPose && input.poseImageIndex !== null) {
    lines.push(
      `Use <<<image ${input.poseImageIndex}>>> only as a body-pose guide: match limb placement, weight shift, torso angle, and stance. Do not copy its line-art style, simplified anatomy, background, clothing, or face.`,
    )
  } else {
    lines.push('Use a relaxed, natural full-body stance facing the camera.')
  }

  if (input.hasSceneImage && input.sceneImageIndex !== null) {
    lines.push(
      `Place the subject in the scene in <<<image ${input.sceneImageIndex}>>>. Match its light direction, colour temperature, perspective, and depth of field. Do not copy any person, garment, or text from it.`,
    )
  } else {
    lines.push('Use a seamless white studio background with soft, even product lighting.')
  }

  lines.push(STUDIO_ANGLE_CAMERA[input.angle])
  if (input.notes?.trim()) lines.push(`Additional direction: ${input.notes.trim()}`)
  lines.push(
    'Realistic photography, natural skin texture, correct hands and fingers, one person only, no text, no watermark, no borders, no collage or grid.',
  )

  return lines.join('\n')
}

export function garmentPrepPrompt(name: string, slot: GarmentSlot, notes?: string): string {
  const details = notes?.trim() ? ` Details to keep: ${notes.trim()}` : ''
  return [
    'E-commerce product reference of the garment in <<<image 1>>>.',
    'Show exactly one garment, front view, centred, the whole garment in frame, on a plain white background.',
    'Remove any person, mannequin, hanger, props, and background.',
    'Preserve colour, fabric, print, logos, buttons, stitching, and cut exactly. Never restyle, recolour, shorten, or add detail.',
    'No text, borders, watermarks, models, or extra garments. Realistic product photography with even, soft lighting and sharp focus.',
    `Garment: ${name}. Slot: ${slot}.${details}`,
  ].join(' ')
}
