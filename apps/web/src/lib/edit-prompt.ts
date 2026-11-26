import {
  DEFAULT_EDIT_PROFILE,
  EDIT_PROMPT_PROFILES,
  avatarModelFamily,
  editToken,
  identityClause,
  type AvatarModelFamily,
  type AvatarProfile,
  type EditProfile,
  type EditPromptProfile,
} from '@sunnygen/core'

export interface EditReference {
  id: string
  assetIds?: string[]
  avatar?: boolean
  profile?: AvatarProfile | null
  role?: string
}

export interface EditPromptOptions {
  modelId?: string
  modelFamily?: AvatarModelFamily
}

const INSTRUCTIONS_HEADER = '\n\nAdditional instructions:\n'

export interface EditPromptOverflow {
  overBy: number
  maxChars: number
}

export interface EditPromptResult {
  prompt: string
  overflow: EditPromptOverflow | null
}

function referenceAssets(reference: EditReference): string[] {
  return reference.assetIds && reference.assetIds.length > 0 ? reference.assetIds : [reference.id]
}

export function orderEditAssets(
  references: EditReference[],
  targetId: string,
  profile: EditProfile = DEFAULT_EDIT_PROFILE,
): string[] {
  const avatarIds = references.filter((reference) => reference.avatar).flatMap(referenceAssets)
  const otherIds = references.filter((reference) => !reference.avatar).flatMap(referenceAssets)
  if (profile.target === 'first') return [targetId, ...avatarIds, ...otherIds]
  if (avatarIds.length > 0) return [...avatarIds, targetId, ...otherIds]
  if (otherIds.length === 0) return [targetId]
  return [otherIds[0] as string, targetId, ...otherIds.slice(1)]
}

export function buildEditPrompt(
  prompt: string,
  references: EditReference[],
  profile: EditProfile = DEFAULT_EDIT_PROFILE,
  options: EditPromptOptions = {},
): string {
  return buildEditPromptResult(prompt, references, profile, options).prompt
}

export function buildEditPromptResult(
  prompt: string,
  references: EditReference[],
  profile: EditProfile = DEFAULT_EDIT_PROFILE,
  options: EditPromptOptions = {},
): EditPromptResult {
  const detail = prompt.trim()
  const avatarIds = references.filter((reference) => reference.avatar).flatMap(referenceAssets)
  const otherIds = references.filter((reference) => !reference.avatar).flatMap(referenceAssets)
  const avatarProfile = references.find((reference) => reference.avatar && reference.profile)?.profile
  if (avatarProfile) return buildKeywordEditPrompt(detail, references, profile, options, avatarProfile)
  return { prompt: buildLegacyEditPrompt(detail, profile, avatarIds, otherIds), overflow: null }
}

function buildLegacyEditPrompt(
  detail: string,
  profile: EditProfile,
  avatarIds: string[],
  otherIds: string[],
): string {
  const ref = (index: number) => editToken(profile, index)
  const target =
    profile.target === 'second' && (avatarIds.length > 0 || otherIds.length > 0)
      ? Math.max(2, avatarIds.length + 1)
      : 1
  const sheet = profile.target === 'first' ? 2 : 1
  const panel = sheet + 1

  if (avatarIds.length > 0) {
    const lastAvatar = sheet + avatarIds.length - 1
    const protectedEnd = Math.max(target, lastAvatar)
    const hasPanel = avatarIds.length >= 2
    const sheetText = hasPanel
      ? `Use ${ref(sheet)} — the attached character reference sheet — and ${ref(panel)} — the attached 4x4 character panel — as the ONLY identity and body references.`
      : `Use ${ref(sheet)} — the attached character reference sheet — as the ONLY identity and body reference.`
    const source = hasPanel ? `${ref(sheet)} and ${ref(panel)}` : ref(sheet)
    const identity = `${sheetText} Replace the person in ${ref(target)} with the character shown in ${source}.`
    const exact = `The face and body must match the avatar references 100%. Copy the exact face shape, facial features, eyes, eyebrows, nose, mouth, skin tone, hair colour, hairstyle and hairline from ${ref(sheet)}.${hasPanel ? ` Use ${ref(panel)} for side and back angles, expressions, hair details, hands, skin texture and the full-body proportions.` : ''} Copy the exact body proportions: height, overall build, shoulder width, chest, waist width, hip width, torso length and leg length. Do not slim, widen or idealise those proportions. Do not keep, blend or invent any identity or body proportions from ${ref(target)}. If the references conflict, ${ref(sheet)} wins the face${hasPanel ? ` and ${ref(panel)} wins the body proportions` : ''}. Keep the pose, clothing, lighting, camera angle and background of ${ref(target)}. Only the person's face, hair and body change to match the avatar exactly.`

    const additionalAvatars =
      avatarIds.length > 2
        ? `\n\nAdditional avatar images ${ref(sheet + 2)}${avatarIds.length > 3 ? `–${ref(lastAvatar)}` : ''} are supporting references only; ${ref(sheet)} and ${ref(panel)} remain the source of truth for face and body.`
        : ''

    const extraStart = protectedEnd + 1
    const extraEnd = extraStart + otherIds.length - 1
    const extras =
      otherIds.length > 0
        ? `\n\n${ref(extraStart)}${extraEnd > extraStart ? `–${ref(extraEnd)}` : ''} ${otherIds.length === 1 ? 'is a supporting reference' : 'are supporting references'} only; they must not override images ${ref(1)}–${ref(protectedEnd)}.`
        : ''

    return `${identity}\n\n${exact}${additionalAvatars}${extras}${detail ? `\n\nAdditional instructions:\n${detail}` : ''}`
  }

  if (otherIds.length === 0) {
    const lead = `Edit the person in ${ref(target)}. Keep the original pose, clothing, lighting, camera angle and background. Change only what the additional instructions request.`
    return detail ? `${lead}\n\nAdditional instructions:\n${detail}` : lead
  }

  const identityIndex = profile.target === 'first' ? 2 : 1
  const proportionsIndex = 3
  const identity = `Use ${ref(identityIndex)} — the attached character reference sheet — as the ONLY identity reference. Replace the person in ${ref(target)} with the character shown in ${ref(identityIndex)}. Strictly copy that character's face shape, facial features, eyes, eyebrows, nose, mouth, skin tone, hair colour, hairstyle and body proportions. Do not keep, blend or invent any identity from ${ref(target)}. Keep the pose, clothing, lighting, camera angle and background of ${ref(target)}. Only the person's face, hair and body change to match the character exactly.`

  const proportions =
    otherIds.length >= 2
      ? `\n\nUse ${ref(proportionsIndex)} — the full-body proportions photo — as reference data for body proportions ONLY. ${ref(proportionsIndex)} is not a target and must never be used as the base photo. Never copy ${ref(proportionsIndex)}'s pose, framing, crop, zoom, camera angle, lighting, background, clothing, hairstyle or scene. Apply its shoulder width, torso length, waist width, hip width and leg length only to the body visible in ${ref(target)}, scaled to the framing of ${ref(target)}. If ${ref(target)} is cropped above the legs, keep that crop: do not zoom out, extend the canvas, add legs or feet, or turn the shot into a full-body photo. Do not keep the target's height, build or limb length where ${ref(proportionsIndex)} disagrees. If the references conflict, ${ref(target)} wins on composition, framing, pose, camera angle, lighting, background and clothing; ${ref(proportionsIndex)} only overrides body proportions.`
      : ''

  const extra =
    otherIds.length > 2
      ? `\n\nImages ${ref(proportionsIndex + 1)} onwards are supporting references only; they must not override images ${ref(1)}–${ref(proportionsIndex)}.`
      : ''

  return `${identity}${proportions}${extra}${detail ? `\n\nAdditional instructions:\n${detail}` : ''}`
}

interface EditSlot {
  index: number
  role: string
  avatar: boolean
}

function referenceSlots(references: EditReference[], avatar: boolean): EditSlot[] {
  return references.flatMap((reference) =>
    referenceAssets(reference).map(() => ({
      index: 0,
      role: reference.role ?? (avatar ? 'identity reference' : 'supporting reference'),
      avatar,
    })),
  )
}

function orderedSlots(references: EditReference[], profile: EditProfile): EditSlot[] {
  const avatars = referenceSlots(
    references.filter((reference) => reference.avatar),
    true,
  )
  const others = referenceSlots(
    references.filter((reference) => !reference.avatar),
    false,
  )
  const target: EditSlot = { index: 0, role: 'target photo', avatar: false }
  const ordered =
    profile.target === 'first'
      ? [target, ...avatars, ...others]
      : avatars.length > 0
        ? [...avatars, target, ...others]
        : others.length === 0
          ? [target]
          : [others[0] as EditSlot, target, ...others.slice(1)]
  return ordered.map((slot, position) => ({ ...slot, index: position + 1 }))
}

type BodyDetail = EditPromptProfile['detail'] | 'facts'

function bodyFacts(avatarProfile: AvatarProfile): string {
  return [
    `${avatarProfile.identity.heightCm} cm`,
    avatarProfile.identity.weightKg ? `${avatarProfile.identity.weightKg} kg` : '',
    `${avatarProfile.body.build} build`,
    `${avatarProfile.body.bust} bust`,
    `${avatarProfile.body.legs} legs`,
  ]
    .filter(Boolean)
    .join(', ')
}

function bodyDirective(
  avatarProfile: AvatarProfile,
  targetIndex: number,
  detail: BodyDetail,
  negatives: EditPromptProfile['negatives'],
  ref: (index: number) => string,
): string {
  const base = `Replace ${ref(targetIndex)}'s body with the avatar's: ${bodyFacts(avatarProfile)}.`
  if (detail === 'facts') return base
  if (detail === 'compact') return `${base} Take the body proportions from the avatar reference images.`
  const features = 'Take shoulder width, chest, waist, hips and thigh width from the avatar reference images.'
  // Gemini reads "the body belongs to the avatar" better than "the target's hips must not survive".
  if (negatives === 'avoid') {
    return `${base} ${features} The body, proportions and figure belong to the avatar; the pose, clothing, framing, lighting and camera belong to ${ref(targetIndex)}.`
  }
  return `${base} ${features} ${ref(targetIndex)}'s own hips, thighs and waist must not survive.`
}

// The panel path writes the prompt as short labelled sections, task first: a generic "swap the
// identity" line was not enough to move the face and body, and the integration step was missing.
type PanelTier = {
  supporting: boolean
  integrate: 'full' | 'short'
  body: 'full' | 'core'
  features: 'full' | 'core'
  /** Last resort under a hard cap: shorten scaffolding, never the task or the face swap. */
  compact: boolean
}

/** Everything a family template needs. Templates differ in shape, never in facts. */
interface PanelFacts {
  target: string
  face?: { token: string; role: string }
  body?: { token: string; role: string }
  sheet?: { token: string; role: string }
  supporting: string[]
  positives: boolean
  bodyEarly: boolean
  restate: boolean
  faceFull: string
  faceCore: string
  hair: string
  bodyFull: string
  bodyCore: string
  keepFull: string
  keepCompact: string
  integrateFull: string
  integrateShort: string
}

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function section(label: string, text: string): string {
  return `${label}: ${text}`
}

function humanList(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}

function faceFeatures(profile: AvatarProfile, level: PanelTier['features']): string {
  const face = profile.face
  const eye = [face.eyeSize, face.eyeShape].filter(Boolean).join(' ')
  if (level === 'core') {
    return [
      `${face.faceShape} face shape`,
      `${face.jawline} jawline`,
      `${eye} eyes`,
      `${face.eyebrows} eyebrows`,
      `${face.noseBridge} bridge and ${face.noseTip} tip`,
      `${face.lips} lips`,
      `${face.skinTone} skin`,
    ].join(', ')
  }
  return [
    `${face.faceShape} face shape`,
    `${face.jawline} jawline`,
    `${face.chin} chin`,
    'the same cheekbones, forehead and hairline',
    `${face.eyeSize} ${face.eyeShape} eyes, the same eye spacing and eyelids`,
    `${face.eyebrows} eyebrows`,
    `${face.noseBridge} nose bridge and ${face.noseTip} nose tip`,
    `${face.lips} lips`,
    'the same ears',
    `${face.skinTone} skin tone and texture`,
    'the same moles',
  ].join(', ')
}

function hairFeatures(profile: AvatarProfile): string {
  return [`${profile.hair.color} ${profile.hair.length} hair`, profile.hair.texture, profile.hair.parting]
    .filter(Boolean)
    .join(', ')
}

function bodyFeatures(profile: AvatarProfile, level: PanelTier['body']): string {
  const identity = profile.identity
  const base = [
    `${identity.heightCm} cm`,
    identity.weightKg ? `${identity.weightKg} kg` : '',
    `${profile.body.build} build`,
    `${profile.body.bust} bust`,
    `${profile.body.legs} legs`,
  ].filter(Boolean)
  if (level === 'core') return base.join(', ')
  return [
    ...base,
    'the same shoulder width, chest, waist, hips, buttocks, thigh width, leg length and arm thickness',
  ].join(', ')
}

function panelFacts(
  promptProfile: EditPromptProfile,
  avatarProfile: AvatarProfile,
  targetIndex: number,
  ref: (index: number) => string,
  panels: { face?: EditSlot; body?: EditSlot; sheet?: EditSlot },
  supportingIds: string[],
): PanelFacts {
  const target = ref(targetIndex)
  const entry = (slot: EditSlot | undefined) =>
    slot ? { token: ref(slot.index), role: slot.role } : undefined
  return {
    target,
    face: entry(panels.face),
    body: entry(panels.body),
    sheet: entry(panels.sheet),
    supporting: supportingIds,
    positives: promptProfile.negatives === 'avoid',
    bodyEarly: promptProfile.bodyPlacement === 'early',
    restate: promptProfile.restateBody,
    faceFull: faceFeatures(avatarProfile, 'full'),
    faceCore: faceFeatures(avatarProfile, 'core'),
    hair: hairFeatures(avatarProfile),
    bodyFull: bodyFeatures(avatarProfile, 'full'),
    bodyCore: bodyFeatures(avatarProfile, 'core'),
    keepFull:
      'pose, gesture, expression type, clothing design, background, camera angle, framing and crop, focal length, depth of field',
    keepCompact: 'pose, gesture, clothing design, background, camera, framing, focal length, depth of field',
    integrateFull: `Relight the avatar to ${target}'s light (direction, softness, colour temperature, shadows and highlights on skin and clothes), then match ${target}'s colour grading, white balance, noise or grain and sharpness`,
    integrateShort: `Relight the avatar to ${target}'s light and match its colour grading and grain`,
  }
}

function faceLine(facts: PanelFacts, tier: PanelTier, label = 'Face'): string {
  const source = facts.face?.token ?? 'the avatar references'
  const rule = facts.positives
    ? `Every facial feature comes from ${source}`
    : `None of ${facts.target}'s facial structure may remain`
  return section(
    label,
    `Replace the face completely with the avatar's from ${source}: ${tier.features === 'core' ? facts.faceCore : facts.faceFull}. ${rule}.`,
  )
}

function hairLine(facts: PanelFacts, tier: PanelTier): string {
  // Hair, skin and hands live on the sheet; without it the face panel is the closest source.
  const source = facts.sheet?.token ?? facts.face?.token ?? 'the avatar'
  const restyle = tier.compact ? '' : ', restyled to fit the scene (wind, pose)'
  const details = facts.sheet ? ` Skin, hands and smaller details come from ${facts.sheet.token} too.` : ''
  return section(
    'Hair',
    `Replace the hair with the avatar's from ${source}: ${facts.hair}${restyle}.${details}`,
  )
}

function bodyLine(facts: PanelFacts, tier: PanelTier): string {
  const source = facts.body?.token ?? 'the avatar'
  const list = tier.body === 'core' ? facts.bodyCore : facts.bodyFull
  if (tier.body === 'core') {
    return section('Body', `Replace the body with the avatar's from ${source}: ${list}.`)
  }
  return section(
    'Body',
    `Replace the body with the avatar's from ${source}: ${list}. Take the widths from the front cell and the curves from its side profile cell. The clothing is refitted to the new body, same garment.`,
  )
}

function keepLine(facts: PanelFacts, tier: PanelTier): string {
  return section(`Keep from ${facts.target}`, `${tier.compact ? facts.keepCompact : facts.keepFull}.`)
}

function integrateLine(facts: PanelFacts, tier: PanelTier): string {
  return section(
    'Integrate',
    tier.integrate === 'short'
      ? `${facts.integrateShort}.`
      : `${facts.integrateFull}. Ignore the white studio background, flat lighting and layout of the panels.`,
  )
}

function referencesLine(facts: PanelFacts, tier: PanelTier): string {
  const refs = [
    facts.face ? `${facts.face.token} is the ${tier.compact ? 'face panel' : facts.face.role}.` : '',
    facts.body ? `${facts.body.token} is the ${tier.compact ? 'body panel' : facts.body.role}.` : '',
    facts.sheet ? `${facts.sheet.token} is the ${tier.compact ? 'reference sheet' : facts.sheet.role}.` : '',
  ].filter(Boolean)
  const supporting =
    tier.supporting && facts.supporting.length
      ? ` ${humanList(facts.supporting)} ${facts.supporting.length === 1 ? 'is a supporting reference' : 'are supporting references'} only.`
      : ''
  return section('References', refs.join(' ') + supporting)
}

const ONE_PHOTO = 'Output one single photo, not a collage or a panel grid.'

// One template per family: same facts, different vendor-recommended shape.

/** Google: detailed, positive framing, integration spelled out. See docs/edit-prompts.md. */
function googleTemplate(facts: PanelFacts, tier: PanelTier): string {
  const lines = [
    section('Task', `Edit ${facts.target} into a new photo of the avatar. ${ONE_PHOTO}`),
    referencesLine(facts, tier),
    faceLine(facts, tier),
    hairLine(facts, tier),
    ...(facts.bodyEarly
      ? [bodyLine(facts, tier), keepLine(facts, tier)]
      : [keepLine(facts, tier), bodyLine(facts, tier)]),
    integrateLine(facts, tier),
    facts.restate
      ? `The result is one photo that keeps ${facts.target}'s pose and the avatar's body proportions.`
      : '',
  ]
  return lines.filter(Boolean).join('\n')
}

/** OpenAI: direct, imperative, numbered requirements and an explicit single-image output. */
function openaiTemplate(facts: PanelFacts, tier: PanelTier): string {
  const steps = [
    `Replace the person in ${facts.target} with the avatar. ${ONE_PHOTO}`,
    referencesLine(facts, tier),
    faceLine(facts, tier),
    hairLine(facts, tier),
    bodyLine(facts, tier),
    keepLine(facts, tier),
    integrateLine(facts, tier),
  ]
  return [
    section('Task', `Edit ${facts.target}.`),
    ...steps.map((line, index) => `${index + 1}. ${line}`),
    facts.restate
      ? `The result is one photo that keeps ${facts.target}'s pose and the avatar's body proportions.`
      : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/** Black Forest Labs: narrative, positive only, no negative prompts. */
function fluxTemplate(facts: PanelFacts, tier: PanelTier): string {
  const source = facts.face?.token ?? 'the avatar references'
  const hairSource = facts.sheet?.token ?? source
  const details = facts.sheet ? ` Skin, hands and smaller details come from ${facts.sheet.token}.` : ''
  return [
    `A photorealistic photo of the avatar from ${source}, replacing the person in ${facts.target}. ${ONE_PHOTO}`,
    `The face comes entirely from ${source}: ${tier.features === 'core' ? facts.faceCore : facts.faceFull}.`,
    `The hair is the avatar's from ${hairSource}: ${facts.hair}${tier.compact ? '' : ', restyled for the scene'}.${details}`,
    `The body is the avatar's from ${facts.body?.token ?? source}: ${tier.body === 'core' ? facts.bodyCore : facts.bodyFull}${tier.body === 'core' ? '' : ', widths from the front cell, curves from the side profile cell, the same garment refitted'}.`,
    `Keep ${facts.target}'s ${tier.compact ? facts.keepCompact : facts.keepFull}.`,
    `Light and grade it like ${facts.target}: ${capitalised(facts.integrateShort)}.`,
    facts.restate ? `One photo, ${facts.target}'s pose, the avatar's body proportions.` : '',
  ]
    .filter(Boolean)
    .join(' ')
}

/** ByteDance Seedream: state the change, then what stays fixed. */
function seedreamTemplate(facts: PanelFacts, tier: PanelTier): string {
  const change = [faceLine(facts, tier), hairLine(facts, tier), bodyLine(facts, tier)]
  const fixed = [keepLine(facts, tier), integrateLine(facts, tier)]
  return [
    section('Task', `Edit ${facts.target} into one single new photo of the avatar, not a collage.`),
    referencesLine(facts, tier),
    'Change:',
    ...change,
    'Keep fixed:',
    ...fixed,
    facts.restate
      ? `The result is one photo that keeps ${facts.target}'s pose and the avatar's body proportions.`
      : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/** Alibaba Qwen-Image-Edit: terse, hard 800 character cap, no wasted words. */
function qwenTemplate(facts: PanelFacts, tier: PanelTier): string {
  const source = facts.face?.token ?? 'the avatar'
  return [
    `Edit ${facts.target} into one photo of the avatar.`,
    `${facts.face ? facts.face.token : source} is the face panel, ${facts.body?.token ?? 'the avatar'} the body panel.`,
    `Face from ${source}: ${tier.features === 'core' ? facts.faceCore : facts.faceFull}.`,
    `Hair: ${facts.hair}.`,
    `Body: ${tier.body === 'core' ? facts.bodyCore : facts.bodyFull}.`,
    `Keep ${tier.compact ? facts.keepCompact : facts.keepFull}.`,
    `Relight to ${facts.target}'s light, match its grade and grain.`,
  ].join(' ')
}

/** Alibaba Wan image edit: short direct instruction, one change per sentence. */
function wanTemplate(facts: PanelFacts, tier: PanelTier): string {
  const face = facts.face?.token ?? 'the avatar'
  const body = facts.body?.token ?? face
  const hair = facts.sheet?.token ?? face
  return [
    `Edit ${facts.target} into a photo of the avatar. ${ONE_PHOTO}`,
    `Use ${face} for the face, ${body} for the body and ${hair} for hair, skin and hands.`,
    `Face: ${tier.features === 'core' ? facts.faceCore : facts.faceFull}.`,
    `Body: ${tier.body === 'core' ? facts.bodyCore : facts.bodyFull}.`,
    `Keep ${tier.compact ? facts.keepCompact : facts.keepFull}.`,
    `Relight to ${facts.target}'s light and grade.`,
  ].join(' ')
}

/** xAI Grok: short and direct, no long lists. */
function grokTemplate(facts: PanelFacts, tier: PanelTier): string {
  const face = facts.face?.token ?? 'the avatar'
  const hair = facts.sheet?.token ?? face
  return [
    `Edit ${facts.target} into a photo of the avatar from ${face}. ${ONE_PHOTO}`,
    `Face from ${face}: ${tier.features === 'core' ? facts.faceCore : facts.faceFull}.`,
    `Hair from ${hair}: ${facts.hair}.`,
    `Body from ${facts.body?.token ?? face}: ${tier.body === 'core' ? facts.bodyCore : facts.bodyFull}.`,
    `Keep ${tier.compact ? facts.keepCompact : facts.keepFull}. ${facts.integrateShort}.`,
  ].join(' ')
}

/** Undocumented endpoints: the Google shape, slightly shorter. */
function genericTemplate(facts: PanelFacts, tier: PanelTier): string {
  return googleTemplate(facts, tier)
}

const PANEL_TEMPLATES: Record<AvatarModelFamily, (facts: PanelFacts, tier: PanelTier) => string> = {
  'nano-banana': googleTemplate,
  'gpt-image': openaiTemplate,
  flux: fluxTemplate,
  seedream: seedreamTemplate,
  qwen: qwenTemplate,
  wan: wanTemplate,
  grok: grokTemplate,
  generic: genericTemplate,
}

const PANEL_TIERS: PanelTier[] = [
  { supporting: true, integrate: 'full', body: 'full', features: 'full', compact: false },
  { supporting: false, integrate: 'full', body: 'full', features: 'full', compact: false },
  { supporting: false, integrate: 'short', body: 'full', features: 'full', compact: false },
  { supporting: false, integrate: 'short', body: 'core', features: 'full', compact: false },
  { supporting: false, integrate: 'short', body: 'core', features: 'core', compact: false },
  { supporting: false, integrate: 'short', body: 'core', features: 'core', compact: true },
]

function buildPanelEditPrompt(
  detail: string,
  promptProfile: EditPromptProfile,
  family: AvatarModelFamily,
  avatarProfile: AvatarProfile,
  targetIndex: number,
  ref: (index: number) => string,
  panels: { face?: EditSlot; body?: EditSlot; sheet?: EditSlot },
  supportingIds: string[],
): EditPromptResult {
  const facts = panelFacts(promptProfile, avatarProfile, targetIndex, ref, panels, supportingIds)
  const template = PANEL_TEMPLATES[family] ?? genericTemplate
  const maxChars = promptProfile.maxChars
  let best = ''
  for (const tier of PANEL_TIERS) {
    const block = template(facts, tier)
    best = detail ? `${block}${INSTRUCTIONS_HEADER}${detail}` : block
    if (maxChars === undefined || best.length <= maxChars) return { prompt: best, overflow: null }
  }
  const overflow = maxChars === undefined ? null : { overBy: best.length - maxChars, maxChars }
  return { prompt: best, overflow }
}

function buildKeywordEditPrompt(
  detail: string,
  references: EditReference[],
  profile: EditProfile,
  options: EditPromptOptions,
  avatarProfile: AvatarProfile,
): EditPromptResult {
  const family = options.modelFamily ?? avatarModelFamily(options.modelId ?? '')
  const promptProfile = EDIT_PROMPT_PROFILES[family]
  const slots = orderedSlots(references, profile)
  const ref = (index: number) => editToken(profile, index)
  const target = slots.find((slot) => slot.role === 'target photo') as EditSlot
  const avatars = slots.filter((slot) => slot.avatar)
  const extras = slots.filter((slot) => !slot.avatar && slot !== target)
  const identityAvatars = avatars.slice(0, promptProfile.maxRefs)
  const demoted = avatars.slice(promptProfile.maxRefs)

  const roles = identityAvatars.map((slot) => `${ref(slot.index)} (${slot.role})`).join(', ')
  const identity = (clause: string) =>
    identityAvatars.length === 0
      ? `Use the avatar as the new identity: ${clause}.`
      : identityAvatars.length === 1
        ? `${roles} is the avatar identity reference: ${clause}.`
        : `${roles} are identity references of the same avatar: ${clause}.`
  // Gemini keeps the target's face unless a swap is spelled out in the first lines. The tokens
  // alone: the identity line above already names what each one holds, and repeating the role
  // text here doubles the prompt.
  const identityTokens = identityAvatars.map((slot) => ref(slot.index)).join(', ')
  const swap = `Replace the person in ${ref(target.index)} with the avatar: copy the face, facial features, skin tone and hair from ${identityAvatars.length === 0 ? 'the avatar description' : identityTokens}.`
  const keep = `Keep ${ref(target.index)}'s pose, clothing, background, lighting and camera.`
  const restate = `The result keeps ${ref(target.index)}'s pose and the avatar's body proportions.`
  const panels = {
    face: identityAvatars.find((slot) => slot.role.startsWith('face panel')),
    body: identityAvatars.find((slot) => slot.role.startsWith('body panel')),
    sheet: identityAvatars.find((slot) => slot.role.startsWith('character reference sheet')),
  }
  if (panels.face || panels.body) {
    return buildPanelEditPrompt(
      detail,
      promptProfile,
      family,
      avatarProfile,
      target.index,
      ref,
      panels,
      [...demoted, ...extras].map((slot) => ref(slot.index)),
    )
  }

  const supportingIds = [...demoted, ...extras].map((slot) => ref(slot.index)).join(' ')
  const supporting = supportingIds
    ? `${supportingIds} ${demoted.length + extras.length === 1 ? 'is a supporting reference' : 'are supporting references'} only.`
    : ''

  const compose = (tier: { supporting: boolean; bodyDetail: BodyDetail }, clause: string): string => {
    const body = bodyDirective(avatarProfile, target.index, tier.bodyDetail, promptProfile.negatives, ref)
    const head = [
      `${ref(target.index)} is the target photo.`,
      identity(clause),
      swap,
      ...(promptProfile.bodyPlacement === 'early' ? [body, keep] : [keep, body]),
    ]
    const lines = [
      ...head,
      tier.supporting ? supporting : '',
      promptProfile.restateBody ? restate : '',
    ].filter(Boolean)
    const block = lines.join('\n')
    return detail ? `${block}${INSTRUCTIONS_HEADER}${detail}` : block
  }

  // Trim order is fixed by the vendors' caps: supporting refs, body detail, then the identity
  // clause down to its subject. The instruction itself is never cut.
  const tiers: Array<{ supporting: boolean; bodyDetail: BodyDetail }> = [
    { supporting: true, bodyDetail: promptProfile.detail },
    { supporting: false, bodyDetail: promptProfile.detail },
    { supporting: false, bodyDetail: 'facts' },
  ]
  const maxChars = promptProfile.maxChars
  let best = ''
  for (const tier of tiers) {
    const overhead = compose(tier, '').length
    const room = maxChars === undefined ? Number.POSITIVE_INFINITY : maxChars - overhead
    const budget = Math.min(promptProfile.clauseBudget, Math.max(0, room))
    const clause = identityClause(avatarProfile, {
      modelFamily: family,
      budget,
      omitBody: true,
      omitOutfit: true,
    })
    best = compose(tier, clause)
    if (maxChars === undefined || best.length <= maxChars) return { prompt: best, overflow: null }
  }
  const overflow = maxChars === undefined ? null : { overBy: best.length - maxChars, maxChars }
  return { prompt: best, overflow }
}
