import { STUDIO_ANGLES, type GarmentSlot, type GarmentSource, type StudioAngle } from './domain'

export const STUDIO_ANGLE_LABELS: Record<StudioAngle, string> = {
  front: 'Front',
  'three-quarter': 'Three-quarter',
  left: 'Left side',
  right: 'Right side',
  back: 'Back',
  top: 'Top-down',
  under: 'Underside',
}

export const STUDIO_ANGLE_CAMERA: Record<StudioAngle, string> = {
  front: 'Straight-on camera at eye level, shoulder-width framing.',
  'three-quarter': 'Turn the subject 45 degrees to their left, keeping the face and outfit readable.',
  left: 'Full left profile, 90 degrees, with the same garments and silhouette.',
  right: 'Full right profile, 90 degrees, with the same garments and silhouette.',
  back: 'From behind, 180 degrees. Keep the same garments visible from the back; never invent a different print, colour, or construction.',
  top: 'Overhead camera looking straight down, showing the top of the head, shoulders, hands, and the top surfaces of the outfit.',
  under:
    'Low camera near the floor looking up at the subject, showing the underside of each garment, the soles of the shoes, and the lining where it shows.',
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

/** Lowercase label, ready for a prompt ("left side view", "top-down view"). */
export function anglePhrase(angle: StudioAngle): string {
  return STUDIO_ANGLE_LABELS[angle].toLowerCase()
}

/** Order a shot asks for a view in, most faithful first. */
const VIEW_PREFERENCE: Record<StudioAngle, StudioAngle[]> = {
  front: ['front', 'three-quarter', 'left', 'right', 'back', 'top', 'under'],
  'three-quarter': ['three-quarter', 'front', 'left', 'right', 'back', 'top', 'under'],
  left: ['left', 'three-quarter', 'front', 'right', 'back', 'top', 'under'],
  right: ['right', 'three-quarter', 'front', 'left', 'back', 'top', 'under'],
  back: ['back', 'front', 'left', 'right', 'three-quarter', 'top', 'under'],
  top: ['top', 'front', 'back', 'three-quarter', 'left', 'right', 'under'],
  under: ['under', 'front', 'back', 'three-quarter', 'left', 'right', 'top'],
}

export interface GarmentView {
  angle: StudioAngle
  assetId: string
  cleanAssetId: string | null
}

export interface GarmentViewSource {
  assetId: string | null
  cleanAssetId: string | null
  data: Record<string, unknown>
}

/**
 * A garment keeps its front photo in `assetId`/`cleanAssetId` and every other
 * angle in `data.views`. Reading both here keeps older garments working and
 * gives every caller one ordered list.
 */
export function parseGarmentViews(item: GarmentViewSource): GarmentView[] {
  const views = new Map<StudioAngle, GarmentView>()
  for (const raw of Array.isArray(item.data.views) ? item.data.views : []) {
    if (!raw || typeof raw !== 'object') continue
    const entry = raw as Record<string, unknown>
    const angle = entry.angle as StudioAngle
    const assetId = entry.assetId
    if (!STUDIO_ANGLES.includes(angle) || views.has(angle)) continue
    if (typeof assetId !== 'string' || !assetId) continue
    views.set(angle, {
      angle,
      assetId,
      cleanAssetId: typeof entry.cleanAssetId === 'string' && entry.cleanAssetId ? entry.cleanAssetId : null,
    })
  }
  if (item.assetId) {
    views.set('front', { angle: 'front', assetId: item.assetId, cleanAssetId: item.cleanAssetId })
  }
  return STUDIO_ANGLES.flatMap((angle) => views.get(angle) ?? [])
}

/** The view of a garment that best answers a shot angle. */
export function pickGarmentView(views: GarmentView[], angle: StudioAngle): GarmentView | null {
  for (const candidate of VIEW_PREFERENCE[angle]) {
    const view = views.find((entry) => entry.angle === candidate)
    if (view) return view
  }
  return views[0] ?? null
}

/** Warn only where a garment was tagged with several views but not the one being shot. */
export function missingViewWarnings(
  garments: Array<{ name: string; views: StudioAngle[] }>,
  angles: StudioAngle[],
): string[] {
  const warnings: string[] = []
  for (const garment of garments) {
    if (garment.views.length < 2) continue
    for (const angle of new Set(angles)) {
      if (garment.views.includes(angle)) continue
      const fallback = VIEW_PREFERENCE[angle].find((candidate) => garment.views.includes(candidate))
      warnings.push(
        fallback
          ? `${garment.name} has no ${anglePhrase(angle)} view; its ${anglePhrase(fallback)} view is used.`
          : `${garment.name} has no ${anglePhrase(angle)} view.`,
      )
    }
  }
  return warnings
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
  garments: Array<StudioGarmentInput & { imageIndex: number; view?: StudioAngle }>
  hasPose: boolean
  poseImageIndex: number | null
  hasSceneImage: boolean
  sceneImageIndex: number | null
  angle: StudioAngle
  notes?: string
  identityImageCount?: number
  identity?: string
}

export function buildStudioPrompt(input: StudioPromptInput): string {
  const lines: string[] = []
  const identityCount = Math.max(1, input.identityImageCount ?? 1)
  const identityRefs = identityCount > 1 ? `images 1 to ${identityCount}` : 'image 1'

  lines.push(
    `Full-body fashion photograph of the character in ${identityRefs}, the attached identity reference${identityCount > 1 ? 's' : ' sheet'}.`,
  )
  lines.push(
    identityCount > 1
      ? `Use ${identityRefs} only for identity: face shape, features, skin tone, hair, and body proportions. Do not use them as the base photo, and do not copy their grid layout, panel poses, backgrounds, or sheet clothing.`
      : 'Use image 1 only for identity: face shape, features, skin tone, hair, and body proportions. Do not use it as the base photo, and do not copy its grid layout, panel poses, backgrounds, or sheet clothing.',
  )
  if (input.identity?.trim()) lines.push(`Identity anchors: ${input.identity.trim()}.`)
  lines.push('Wear exactly these garments, one per slot, in this order:')
  for (const [position, garment] of input.garments.entries()) {
    const details = garment.notes?.trim() ? ` Details: ${garment.notes.trim()}` : ''
    const view = garment.view ? `, shown from the ${anglePhrase(garment.view)} view` : ''
    lines.push(
      `${position + 1}. Image ${garment.imageIndex}: "${garment.name}" (${garment.slot}${view}).${details}`,
    )
  }
  lines.push(
    'Preserve colour, fabric, print, hardware, stitching, and cut exactly. Do not invent, substitute, or remove any piece of clothing.',
  )

  if (input.hasPose && input.poseImageIndex !== null) {
    lines.push(
      `Use image ${input.poseImageIndex} only as a body-pose guide: match limb placement, weight shift, torso angle, and stance. Do not copy its line-art style, simplified anatomy, background, clothing, or face.`,
    )
  } else {
    lines.push('Use a relaxed, natural full-body stance facing the camera.')
  }

  if (input.hasSceneImage && input.sceneImageIndex !== null) {
    lines.push(
      `Place the subject in the scene in image ${input.sceneImageIndex}. Match its light direction, colour temperature, perspective, and depth of field. Do not copy any person, garment, or text from it.`,
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

export function garmentPrepPrompt(
  name: string,
  slot: GarmentSlot,
  notes?: string,
  view: StudioAngle = 'front',
): string {
  const details = notes?.trim() ? ` Details to keep: ${notes.trim()}` : ''
  return [
    'E-commerce product reference of the garment in image 1.',
    `Show exactly one garment, ${anglePhrase(view)} view, centred, the whole garment in frame, on a plain white background.`,
    'Remove any person, mannequin, hanger, props, and background.',
    'Preserve colour, fabric, print, logos, buttons, stitching, and cut exactly. Never restyle, recolour, shorten, or add detail.',
    'No text, borders, watermarks, models, or extra garments. Realistic product photography with even, soft lighting and sharp focus.',
    `Garment: ${name}. Slot: ${slot}.${details}`,
  ].join(' ')
}
