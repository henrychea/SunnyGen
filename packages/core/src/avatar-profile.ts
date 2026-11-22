export const SHEET_SECTION_IDS = [
  'basic',
  'body-angles',
  'face-angles',
  'expressions',
  'hair',
  'hands',
  'features',
  'skin',
  'body-details',
  'outfits',
] as const

export type SheetSectionId = (typeof SHEET_SECTION_IDS)[number]

export interface SheetSectionDefinition {
  id: SheetSectionId
  label: string
  title: string
  items: readonly string[]
}

export const SHEET_SECTIONS: readonly SheetSectionDefinition[] = [
  { id: 'basic', label: 'Basic profile', title: 'Basic Settings / Basic Profile', items: [] },
  {
    id: 'body-angles',
    label: 'Full-body angles',
    title: 'Full-Body Angles',
    items: ['Front', 'Side', 'Back', 'Diagonal Front', 'Diagonal Back'],
  },
  {
    id: 'face-angles',
    label: 'Face angles',
    title: 'Face Angles',
    items: ['Front', '45 Degrees', 'Side Profile', 'Diagonal Upper', 'Diagonal Lower'],
  },
  {
    id: 'expressions',
    label: 'Expressions',
    title: 'Expressions',
    items: ['Neutral', 'Natural Smile', 'Serious', 'Surprised', 'Troubled'],
  },
  { id: 'hair', label: 'Hair details', title: 'Hair Details', items: ['Front', 'Side', 'Back'] },
  { id: 'hands', label: 'Hands', title: 'Hands', items: ['Rest', 'Side', 'Palm'] },
  {
    id: 'features',
    label: 'Facial features',
    title: 'Facial Features',
    items: ['Eyes', 'Eyebrows', 'Nose', 'Mouth', 'Ears'],
  },
  { id: 'skin', label: 'Skin texture', title: 'Skin Texture', items: ['Facial Skin', 'Body Skin'] },
  {
    id: 'body-details',
    label: 'Body details',
    title: 'Body Details',
    items: ['Shoulders', 'Abdomen', 'Back', 'Legs', 'Hands'],
  },
  {
    id: 'outfits',
    label: 'Outfit examples',
    title: 'Everyday Outfit & Scene Examples',
    items: ['Loungewear', 'Casual Wear', 'Coffee Shop', 'Work/School', 'Travel'],
  },
]

export const LIKENESS_KEEP_TRAITS = [
  'ethnicity',
  'ageRange',
  'skinTone',
  'hairColorTexture',
  'faceShapeFamily',
  'bodyProportions',
] as const

export type LikenessKeepTrait = (typeof LIKENESS_KEEP_TRAITS)[number]

export const LIKENESS_CHANGE_TRAITS = [
  'eyeShapeCrease',
  'noseBridgeTip',
  'lipContour',
  'jawChin',
  'cheekbones',
  'eyebrowShape',
  'earShape',
  'facialProportions',
  'makeup',
] as const

export type LikenessChangeTrait = (typeof LIKENESS_CHANGE_TRAITS)[number]

export const LIKENESS_KEEP_LABELS: Record<LikenessKeepTrait, string> = {
  ethnicity: 'ethnicity',
  ageRange: 'age range',
  skinTone: 'skin tone',
  hairColorTexture: 'hair color and texture',
  faceShapeFamily: 'general face-shape family',
  bodyProportions: 'body proportions',
}

export const LIKENESS_CHANGE_LABELS: Record<LikenessChangeTrait, string> = {
  eyeShapeCrease: 'eye shape and eyelid crease',
  noseBridgeTip: 'nose bridge and tip',
  lipContour: 'lip contour',
  jawChin: 'jawline and chin',
  cheekbones: 'cheekbones',
  eyebrowShape: 'eyebrow shape',
  earShape: 'ear shape',
  facialProportions: 'facial proportions',
  makeup: 'makeup',
}

export type AvatarGender = 'female' | 'male'
export type SheetBackground = 'white' | 'light-beige'
export type SheetLabelMode = 'section-names' | 'none'

export interface AvatarSourceSettings {
  portraitAssetId?: string
  likenessPercent: number
  keep: LikenessKeepTrait[]
  change: LikenessChangeTrait[]
}

export interface AvatarIdentity {
  gender: AvatarGender
  age: number
  ethnicity: string
  heightCm: number
  weightKg?: number
}

export interface AvatarFace {
  faceShape: string
  jawline: string
  chin: string
  eyeSize: string
  eyeShape: string
  eyebrows: string
  noseBridge: string
  noseTip: string
  lips: string
  skinTone: string
}

export interface AvatarHair {
  color: string
  length: string
  texture: string
  parting: string
}

export interface AvatarBody {
  build: string
  legs: string
  bust: string
}

export interface AvatarOutfit {
  top: string
  legwear: string
  shoes: string
}

export interface AvatarStyle {
  photo: boolean
  naturalLight: boolean
  realSkin: boolean
  realHair: boolean
  realProportions: boolean
  banAnime: boolean
  banCg: boolean
  banSmoothing: boolean
}

export interface AvatarSheetSettings {
  sections: Record<SheetSectionId, boolean>
  background: SheetBackground
  ratio: string
  resolution: string
  labels: SheetLabelMode
  borders: boolean
  footerText: boolean
}

export interface AvatarPanelSettings {
  views: number
  expressions: number
  poses: number
  detailCrops: number
  resolution: string
  text: boolean
  borders: boolean
}

export interface AvatarProfile {
  source: AvatarSourceSettings
  identity: AvatarIdentity
  face: AvatarFace
  hair: AvatarHair
  body: AvatarBody
  outfit: AvatarOutfit
  style: AvatarStyle
  sheet: AvatarSheetSettings
  panel: AvatarPanelSettings
}

export const AVATAR_PRESETS = {
  gender: ['female', 'male'],
  ethnicity: [
    'East Asian',
    'Southeast Asian',
    'South Asian',
    'White',
    'Black',
    'Latina',
    'Middle Eastern',
    'Mixed',
  ],
  faceShape: ['soft oval', 'oval', 'round', 'heart', 'square', 'long', 'diamond', 'oblong'],
  jawline: ['slender', 'soft', 'defined', 'square', 'narrow', 'rounded'],
  chin: ['petite', 'rounded', 'pointed', 'soft', 'square'],
  eyeSize: ['small', 'medium', 'large', 'very large'],
  eyeShape: [
    'natural almond-shaped',
    'almond-shaped',
    'round',
    'monolid',
    'hooded',
    'upturned',
    'downturned',
  ],
  eyebrows: [
    'slender naturally arched',
    'straight',
    'soft arched',
    'thick straight',
    'high arched',
    'rounded',
  ],
  noseBridge: ['slim', 'straight', 'narrow', 'wide', 'high', 'low'],
  noseTip: ['dainty', 'rounded', 'button', 'pointed', 'broad'],
  lips: ['soft and full', 'full', 'medium', 'thin', 'heart-shaped', 'wide'],
  skinTone: ['fair and natural', 'fair', 'light olive', 'medium', 'tan', 'deep', 'rich brown'],
  hairColor: ['dark brown near-black', 'black', 'dark brown', 'medium brown', 'auburn', 'blonde', 'platinum'],
  hairLength: ['long', 'waist-length', 'shoulder-length', 'short', 'bob', 'pixie'],
  hairTexture: ['slightly wavy', 'straight', 'wavy', 'loose waves', 'curly', 'coily'],
  hairParting: [
    'natural center-parted fringe',
    'center part',
    'side part',
    'no parting',
    'slicked back',
    'blunt fringe',
  ],
  bodyBuild: [
    'very slim and hourglass',
    'slim',
    'athletic',
    'curvy hourglass',
    'toned',
    'soft',
    'full figure',
  ],
  bodyLegs: ['long', 'average', 'short', 'toned'],
  bust: ['flat', 'slight', 'medium', 'full', 'large'],
  outfitTop: [
    'Black fitted long-sleeved square-neck short skirt',
    'White oversized cotton tee',
    'Beige linen shirt',
    'Black fitted turtleneck',
    'Cream knit sweater',
    'Denim jacket over a white top',
    'Silk slip dress',
  ],
  legwear: [
    'black stockings',
    'bare legs',
    'black tights',
    'blue jeans',
    'black tailored trousers',
    'white trousers',
    'pleated skirt',
  ],
  shoes: ['black high heels', 'white sneakers', 'black ankle boots', 'brown loafers', 'ballet flats'],
  sheetRatio: ['4:3', '3:4', '16:9', '1:1'],
  sheetResolution: ['4K', '2K', '1080p'],
  panelResolution: ['4K', '2K', '1K'],
} as const satisfies Record<string, readonly string[]>

type AvatarRealismFlag = 'photo' | 'naturalLight' | 'realSkin' | 'realHair' | 'realProportions'
type AvatarStyleBan = 'banAnime' | 'banCg' | 'banSmoothing'

const REALISM_FLAGS: ReadonlyArray<{ key: AvatarRealismFlag; label: string }> = [
  { key: 'photo', label: 'Realistic Photography Feel' },
  { key: 'naturalLight', label: 'Natural Light' },
  { key: 'realSkin', label: 'Realistic Skin Texture' },
  { key: 'realHair', label: 'Realistic Hair Strands' },
  { key: 'realProportions', label: 'Realistic Human Proportions' },
]

const STYLE_BANS: ReadonlyArray<{ key: AvatarStyleBan; label: string }> = [
  { key: 'banAnime', label: 'do not stylize as anime' },
  { key: 'banCg', label: 'do not add a CG feel' },
  { key: 'banSmoothing', label: 'do not overdo skin smoothing' },
]

export const DEFAULT_AVATAR_PROFILE: AvatarProfile = {
  source: {
    likenessPercent: 70,
    keep: [...LIKENESS_KEEP_TRAITS],
    change: [...LIKENESS_CHANGE_TRAITS],
  },
  identity: { gender: 'female', age: 26, ethnicity: 'East Asian', heightCm: 168 },
  face: {
    faceShape: 'soft oval',
    jawline: 'slender',
    chin: 'petite',
    eyeSize: 'large',
    eyeShape: 'natural almond-shaped',
    eyebrows: 'slender naturally arched',
    noseBridge: 'slim',
    noseTip: 'dainty',
    lips: 'soft and full',
    skinTone: 'fair and natural',
  },
  hair: {
    color: 'dark brown near-black',
    length: 'long',
    texture: 'slightly wavy',
    parting: 'natural center-parted fringe',
  },
  body: { build: 'very slim and hourglass', legs: 'long', bust: 'large' },
  outfit: {
    top: 'Black fitted long-sleeved square-neck short skirt',
    legwear: 'black stockings',
    shoes: 'black high heels',
  },
  style: {
    photo: true,
    naturalLight: true,
    realSkin: true,
    realHair: true,
    realProportions: true,
    banAnime: true,
    banCg: true,
    banSmoothing: true,
  },
  sheet: {
    sections: Object.fromEntries(SHEET_SECTION_IDS.map((id) => [id, true])) as Record<
      SheetSectionId,
      boolean
    >,
    background: 'light-beige',
    ratio: '4:3',
    resolution: '4K',
    labels: 'section-names',
    borders: false,
    footerText: false,
  },
  panel: {
    views: 4,
    expressions: 4,
    poses: 4,
    detailCrops: 4,
    resolution: '4K',
    text: false,
    borders: false,
  },
}

export const MIN_AVATAR_AGE = 18
export const MAX_AVATAR_AGE = 99

export function isAdultAge(age: number): boolean {
  return Number.isInteger(age) && age >= MIN_AVATAR_AGE && age <= MAX_AVATAR_AGE
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

function count(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

// Optional numbers drop out of range rather than clamp, so a typo cannot invent a value.
function optionalCount(value: unknown, min: number, max: number): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return undefined
  const rounded = Math.round(parsed)
  return rounded < min || rounded > max ? undefined : rounded
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function traits<T extends string>(value: unknown, allowed: readonly T[], fallback: readonly T[]): T[] {
  if (!Array.isArray(value)) return [...fallback]
  const picked = value.filter((entry): entry is T => allowed.includes(entry as T))
  return [...new Set(picked)]
}

function sections(value: unknown): Record<SheetSectionId, boolean> {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return Object.fromEntries(
    SHEET_SECTION_IDS.map((id) => [id, flag(record[id], DEFAULT_AVATAR_PROFILE.sheet.sections[id])]),
  ) as Record<SheetSectionId, boolean>
}

function group(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

export function parseAvatarProfile(value: unknown): AvatarProfile | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const identity = group(record.identity)
  const face = group(record.face)
  const hair = group(record.hair)
  const body = group(record.body)
  const outfit = group(record.outfit)
  const style = group(record.style)
  const sheet = group(record.sheet)
  const panel = group(record.panel)
  const source = group(record.source)
  const defaults = DEFAULT_AVATAR_PROFILE

  const age = Number(identity.age)
  const resolvedAge = Number.isFinite(age) ? Math.round(age) : defaults.identity.age
  if (!isAdultAge(resolvedAge)) return null
  const weightKg = optionalCount(identity.weightKg, 30, 200)

  return {
    source: {
      portraitAssetId: text(source.portraitAssetId, '') || undefined,
      likenessPercent: count(source.likenessPercent, defaults.source.likenessPercent, 20, 95),
      keep: traits(source.keep, LIKENESS_KEEP_TRAITS, defaults.source.keep),
      change: traits(source.change, LIKENESS_CHANGE_TRAITS, defaults.source.change),
    },
    identity: {
      gender: identity.gender === 'male' ? 'male' : 'female',
      age: resolvedAge,
      ethnicity: text(identity.ethnicity, defaults.identity.ethnicity),
      heightCm: count(identity.heightCm, defaults.identity.heightCm, 140, 210),
      ...(weightKg === undefined ? {} : { weightKg }),
    },
    face: {
      faceShape: text(face.faceShape, defaults.face.faceShape),
      jawline: text(face.jawline, defaults.face.jawline),
      chin: text(face.chin, defaults.face.chin),
      eyeSize: text(face.eyeSize, defaults.face.eyeSize),
      eyeShape: text(face.eyeShape, defaults.face.eyeShape),
      eyebrows: text(face.eyebrows, defaults.face.eyebrows),
      noseBridge: text(face.noseBridge, defaults.face.noseBridge),
      noseTip: text(face.noseTip, defaults.face.noseTip),
      lips: text(face.lips, defaults.face.lips),
      skinTone: text(face.skinTone, defaults.face.skinTone),
    },
    hair: {
      color: text(hair.color, defaults.hair.color),
      length: text(hair.length, defaults.hair.length),
      texture: text(hair.texture, defaults.hair.texture),
      parting: text(hair.parting, defaults.hair.parting),
    },
    body: {
      build: text(body.build, defaults.body.build),
      legs: text(body.legs, defaults.body.legs),
      bust: text(body.bust, defaults.body.bust),
    },
    outfit: {
      top: text(outfit.top, defaults.outfit.top),
      legwear: text(outfit.legwear, defaults.outfit.legwear),
      shoes: text(outfit.shoes, defaults.outfit.shoes),
    },
    style: {
      photo: flag(style.photo, defaults.style.photo),
      naturalLight: flag(style.naturalLight, defaults.style.naturalLight),
      realSkin: flag(style.realSkin, defaults.style.realSkin),
      realHair: flag(style.realHair, defaults.style.realHair),
      realProportions: flag(style.realProportions, defaults.style.realProportions),
      banAnime: flag(style.banAnime, defaults.style.banAnime),
      banCg: flag(style.banCg, defaults.style.banCg),
      banSmoothing: flag(style.banSmoothing, defaults.style.banSmoothing),
    },
    sheet: {
      sections: sections(sheet.sections),
      background: sheet.background === 'white' ? 'white' : defaults.sheet.background,
      ratio: text(sheet.ratio, defaults.sheet.ratio),
      resolution: text(sheet.resolution, defaults.sheet.resolution),
      labels: sheet.labels === 'none' ? 'none' : defaults.sheet.labels,
      borders: flag(sheet.borders, defaults.sheet.borders),
      footerText: flag(sheet.footerText, defaults.sheet.footerText),
    },
    panel: {
      views: count(panel.views, defaults.panel.views, 1, 6),
      expressions: count(panel.expressions, defaults.panel.expressions, 0, 8),
      poses: count(panel.poses, defaults.panel.poses, 0, 8),
      detailCrops: count(panel.detailCrops, defaults.panel.detailCrops, 0, 8),
      resolution: text(panel.resolution, defaults.panel.resolution),
      text: flag(panel.text, defaults.panel.text),
      borders: flag(panel.borders, defaults.panel.borders),
    },
  }
}

function joinAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

function genderNoun(profile: AvatarProfile): string {
  return profile.identity.gender === 'female' ? 'woman' : 'man'
}

function genderAdjective(profile: AvatarProfile): string {
  return profile.identity.gender === 'female' ? 'female' : 'male'
}

function likenessRule(profile: AvatarProfile): string {
  const percent = profile.source.likenessPercent
  const keep = profile.source.keep.map((trait) => LIKENESS_KEEP_LABELS[trait])
  const change = profile.source.change.map((trait) => LIKENESS_CHANGE_LABELS[trait])
  return [
    `Likeness rule: The finished character must read as a different person with a strong family resemblance to the reference — about ${percent}% similar.`,
    keep.length > 0 ? `Keep the ${joinAnd(keep)}.` : '',
    change.length > 0 ? `Change the specific identity features: ${joinAnd(change)}.` : '',
    "Do not copy, trace, face-swap, or reproduce the reference person's exact face, expression, pose, lighting, or facial geometry.",
    'The result must be an original face, not a clone.',
    'Side by side, they should look like close relatives, not the same person.',
  ]
    .filter(Boolean)
    .join(' ')
}

function styleLine(profile: AvatarProfile): string {
  const flags = REALISM_FLAGS.filter((entry) => profile.style[entry.key]).map((entry) => entry.label)
  return `Overall Style: ${[...flags, 'High-Quality Character Consistency Reference Table'].join(', ')}.`
}

function bansClause(profile: AvatarProfile): string {
  const bans = STYLE_BANS.filter((entry) => profile.style[entry.key]).map((entry) => entry.label)
  return bans.length > 0 ? `, ${bans.join(', ')}` : ''
}

function layoutLine(profile: AvatarProfile): string {
  const background =
    profile.sheet.background === 'white'
      ? 'Plain white clean background'
      : 'White to light beige clean background'
  const labels =
    profile.sheet.labels === 'section-names'
      ? 'English annotations: content section and section names only'
      : 'no text annotations'
  return `Layout: ${background}, professional reference sheet, grid layout, ${labels}, clear and easy to read.`
}

function sectionLines(profile: AvatarProfile): string[] {
  const enabled = SHEET_SECTIONS.filter((section) => profile.sheet.sections[section.id])
  return enabled.map((section, index) =>
    section.items.length > 0
      ? `${index + 1}. ${section.title}: ${section.items.join(', ')}`
      : `${index + 1}. ${section.title}`,
  )
}

function sheetSettingsLine(profile: AvatarProfile): string {
  const parts = [`${profile.sheet.resolution} res with Ratio ${profile.sheet.ratio}.`]
  if (profile.sheet.labels === 'section-names') {
    parts.push('Remove the profile text and keep only the category ones.')
  }
  parts.push(
    profile.sheet.background === 'white'
      ? 'Keep the background plain white.'
      : 'Remove the background so it is plain white.',
  )
  parts.push(profile.sheet.borders ? 'Keep thin box outlines.' : 'No box outlines.')
  parts.push(profile.sheet.footerText ? 'Add the section names at the bottom.' : 'No text at the bottom.')
  return parts.join(' ')
}

export function buildReferenceSheetPrompt(profile: AvatarProfile): string {
  const hasPortrait = Boolean(profile.source.portraitAssetId)
  const lines: string[] = []

  lines.push(
    hasPortrait
      ? `Create a professional-grade original character reference sheet. Use the uploaded portrait only as a ${profile.source.likenessPercent}% likeness guide, not as an identity to copy.`
      : 'Create a professional-grade original character reference sheet.',
  )
  if (hasPortrait) lines.push('', likenessRule(profile))

  lines.push(
    '',
    `Core Requirements: All images in the entire sheet must depict the same original adult ${profile.identity.ethnicity} ${genderNoun(profile)}, maintaining consistent face shape, facial feature proportions, eyes, eyebrows, nose, mouth, skin tone, hair color, hairstyle, and body type—do not swap faces between panels${bansClause(profile)}.`,
  )

  const features = [
    `Adult ${profile.identity.ethnicity} ${genderAdjective(profile)}`,
    `${profile.identity.heightCm} cm tall`,
    ...(profile.identity.weightKg ? [`${profile.identity.weightKg} kg`] : []),
    `${profile.face.faceShape} face`,
    `${profile.face.jawline} jawline`,
    `${profile.face.chin} chin`,
    `${profile.face.eyeSize} and ${profile.face.eyeShape} eyes`,
    `${profile.face.eyebrows} eyebrows`,
    `${profile.face.noseBridge} nose bridge`,
    `${profile.face.noseTip} nose tip`,
    `${profile.face.lips} lip shape`,
    `${profile.face.skinTone} skin tone`,
    `${profile.hair.color} ${profile.hair.length} hair`,
    profile.hair.texture,
    profile.hair.parting,
    `${profile.body.build} figure`,
    `${profile.body.legs} legs`,
    `${profile.body.bust} bust`,
  ]
  lines.push('', `Character Features: ${features.join(', ')}.`)
  lines.push('', `Basic Attire: ${profile.outfit.top}, ${profile.outfit.legwear}, ${profile.outfit.shoes}.`)
  lines.push('', layoutLine(profile))
  lines.push('', 'Content Sections:', ...sectionLines(profile))
  lines.push('', styleLine(profile))

  const lock = [
    'Identity lock for every panel: same new face, same body, same hair, same outfit.',
    hasPortrait ? "Do not revert to the uploaded portrait's face in any panel." : '',
    sheetSettingsLine(profile),
  ]
    .filter(Boolean)
    .join(' ')
  lines.push('', lock)

  return lines.join('\n')
}

const NUMBER_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty',
] as const

export function numberWord(value: number): string {
  return NUMBER_WORDS[value] ?? String(value)
}

function viewPhrase(views: number): string {
  return views === 4 ? 'front, back, sides' : `${numberWord(views)} views`
}

export function buildPanelSheetPrompt(profile: AvatarProfile): string {
  const panel = profile.panel
  const panels = panel.views + panel.expressions + panel.poses + panel.detailCrops
  const text =
    panel.text && panel.borders
      ? 'with text and borders'
      : panel.text
        ? 'with text, no borders'
        : panel.borders
          ? 'no text, with borders'
          : 'no text and borders'
  return [
    `Reference the sheet and make a 4 by 4 reference sheet, ${numberWord(panels)} panels of the same original character,`,
    `${viewPhrase(panel.views)}, ${numberWord(panel.expressions)} expressions, ${numberWord(panel.poses)} poses, ${numberWord(panel.detailCrops)} detail crops,`,
    `flat white background. ${panel.resolution} quality, ${text}.`,
  ].join(' ')
}

export type AvatarModelFamily = 'qwen' | 'nano-banana' | 'seedream' | 'flux' | 'gpt-image' | 'generic'

const FAMILY_PATTERNS: ReadonlyArray<[RegExp, AvatarModelFamily]> = [
  [/qwen/i, 'qwen'],
  [/nano-banana|gemini/i, 'nano-banana'],
  [/seedream/i, 'seedream'],
  [/gpt-image/i, 'gpt-image'],
  [/flux/i, 'flux'],
]

export function avatarModelFamily(modelId: string): AvatarModelFamily {
  for (const [pattern, family] of FAMILY_PATTERNS) {
    if (pattern.test(modelId)) return family
  }
  return 'generic'
}

export const IDENTITY_CLAUSE_BUDGETS: Record<AvatarModelFamily, number> = {
  qwen: 250,
  'nano-banana': 600,
  seedream: 600,
  flux: 600,
  'gpt-image': 600,
  generic: 600,
}

export interface AvatarIdentityKeywords {
  face: string[]
  hair: string[]
  body: string[]
  outfit: string[]
}

type KeywordGroup = keyof AvatarIdentityKeywords

const EYE_SHAPE_SHORT: Record<string, string> = {
  'natural almond-shaped': 'almond',
  'almond-shaped': 'almond',
  monolid: 'monolid',
  hooded: 'hooded',
  round: 'round',
  upturned: 'upturned',
  downturned: 'downturned',
}

const EYELID_BY_SHAPE: Record<string, string> = {
  'natural almond-shaped': 'visible crease',
  'almond-shaped': 'visible crease',
  round: 'visible crease',
  monolid: 'monolid',
  hooded: 'hooded',
  upturned: 'tapered crease',
  downturned: 'soft crease',
}

const BROW_SHORT: Record<string, string> = {
  'slender naturally arched': 'slender arched brows',
  straight: 'straight brows',
  'soft arched': 'soft arched brows',
  'thick straight': 'thick straight brows',
  'high arched': 'high arched brows',
  rounded: 'rounded brows',
}

const LIP_SHORT: Record<string, string> = {
  'soft and full': 'full lips',
  full: 'full lips',
  medium: 'medium lips',
  thin: 'thin lips',
  'heart-shaped': 'heart-shaped lips',
  wide: 'wide lips',
}

const SKIN_SHORT: Record<string, string> = {
  'fair and natural': 'fair skin',
  fair: 'fair skin',
  'light olive': 'light olive skin',
  medium: 'medium skin',
  tan: 'tan skin',
  deep: 'deep skin',
  'rich brown': 'rich brown skin',
}

const BUILD_SHORT: Record<string, string> = {
  'very slim and hourglass': 'slim hourglass',
  slim: 'slim',
  athletic: 'athletic',
  'curvy hourglass': 'curvy hourglass',
  toned: 'toned',
  soft: 'soft build',
  'full figure': 'full figure',
}

interface Anchor {
  group: KeywordGroup
  text: string
  priority: number
}

const PRIORITY_FACE_GEOMETRY = 0
const PRIORITY_EYES_BROWS = 1
const PRIORITY_BODY = 2
const PRIORITY_HAIR = 3
const PRIORITY_OUTFIT = 4

function keywordsFrom(profile: AvatarProfile): Anchor[] {
  const face = profile.face
  const eye = [face.eyeSize, EYE_SHAPE_SHORT[face.eyeShape] ?? face.eyeShape].filter(Boolean).join(' ')
  const eyelid = EYELID_BY_SHAPE[face.eyeShape]
  return [
    { group: 'face', text: `${face.faceShape} face`, priority: PRIORITY_FACE_GEOMETRY },
    { group: 'face', text: `${face.jawline} jaw`, priority: PRIORITY_FACE_GEOMETRY },
    { group: 'face', text: `${face.chin} chin`, priority: PRIORITY_FACE_GEOMETRY },
    { group: 'face', text: `${face.noseBridge} bridge`, priority: PRIORITY_FACE_GEOMETRY },
    { group: 'face', text: `${face.noseTip} tip`, priority: PRIORITY_FACE_GEOMETRY },
    { group: 'face', text: LIP_SHORT[face.lips] ?? `${face.lips} lips`, priority: PRIORITY_FACE_GEOMETRY },
    { group: 'face', text: `${eye} eyes`, priority: PRIORITY_EYES_BROWS },
    ...(eyelid && !eye.includes(eyelid.split(' ')[0] ?? '')
      ? [{ group: 'face' as const, text: eyelid, priority: PRIORITY_EYES_BROWS }]
      : []),
    {
      group: 'face',
      text: BROW_SHORT[face.eyebrows] ?? `${face.eyebrows} brows`,
      priority: PRIORITY_EYES_BROWS,
    },
    {
      group: 'face',
      text: SKIN_SHORT[face.skinTone] ?? `${face.skinTone} skin`,
      priority: PRIORITY_EYES_BROWS,
    },
    {
      group: 'body',
      text: BUILD_SHORT[profile.body.build] ?? `${profile.body.build} build`,
      priority: PRIORITY_BODY,
    },
    { group: 'body', text: `${profile.body.legs} legs`, priority: PRIORITY_BODY },
    { group: 'body', text: `${profile.body.bust} bust`, priority: PRIORITY_BODY },
    { group: 'body', text: `${profile.identity.heightCm} cm`, priority: PRIORITY_BODY },
    ...(profile.identity.weightKg
      ? [{ group: 'body' as const, text: `${profile.identity.weightKg} kg`, priority: PRIORITY_BODY }]
      : []),
    {
      group: 'hair',
      text: `${profile.hair.color} ${profile.hair.length} hair`,
      priority: PRIORITY_HAIR,
    },
    { group: 'hair', text: profile.hair.texture, priority: PRIORITY_HAIR },
    { group: 'hair', text: profile.hair.parting, priority: PRIORITY_HAIR },
    { group: 'outfit', text: profile.outfit.top, priority: PRIORITY_OUTFIT },
    { group: 'outfit', text: profile.outfit.legwear, priority: PRIORITY_OUTFIT },
    { group: 'outfit', text: profile.outfit.shoes, priority: PRIORITY_OUTFIT },
  ]
}

export function identityKeywords(profile: AvatarProfile): AvatarIdentityKeywords {
  const keywords: AvatarIdentityKeywords = { face: [], hair: [], body: [], outfit: [] }
  for (const anchor of keywordsFrom(profile)) keywords[anchor.group].push(anchor.text)
  return keywords
}

export function identitySubject(profile: AvatarProfile): string {
  return `${profile.identity.age}yo ${profile.identity.ethnicity} ${genderNoun(profile)}`
}

export function identityClause(
  profile: AvatarProfile,
  options: { modelFamily?: AvatarModelFamily; budget?: number } = {},
): string {
  const family = options.modelFamily ?? 'generic'
  const budget = options.budget ?? IDENTITY_CLAUSE_BUDGETS[family]
  const tokens = [identitySubject(profile)]
  const ranked = keywordsFrom(profile)
    .map((anchor, index) => ({ ...anchor, index }))
    .sort((left, right) => left.priority - right.priority || left.index - right.index)
  for (const anchor of ranked) {
    const next = [...tokens, anchor.text].join(', ')
    if (next.length <= budget) tokens.push(anchor.text)
  }
  const clause = tokens.join(', ')
  return clause.length <= budget ? clause : clause.slice(0, budget).trimEnd()
}
