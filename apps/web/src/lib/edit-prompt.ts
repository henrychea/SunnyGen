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
  bodyIndex: number | undefined,
  detail: BodyDetail,
  negatives: EditPromptProfile['negatives'],
  ref: (index: number) => string,
): string {
  const base = `Replace ${ref(targetIndex)}'s body with the avatar's: ${bodyFacts(avatarProfile)}.`
  if (detail === 'facts') return base
  const source = bodyIndex ? `${ref(bodyIndex)} (full body)` : 'the avatar reference images'
  if (detail === 'compact') return `${base} Take the body proportions from ${source}.`
  const features = `Take shoulder width, chest, waist, hips and thigh width from ${source}.`
  // Gemini reads "the body belongs to the avatar" better than "the target's hips must not survive".
  if (negatives === 'avoid') {
    return `${base} ${features} The body, proportions and figure belong to the avatar; the pose, clothing, framing, lighting and camera belong to ${ref(targetIndex)}.`
  }
  return `${base} ${features} ${ref(targetIndex)}'s own hips, thighs and waist must not survive.`
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
  const bodyIndex = (identityAvatars.length > 0 ? identityAvatars : avatars).find(
    (slot) => slot.role === 'full body',
  )?.index

  const roles = identityAvatars.map((slot) => `${ref(slot.index)} (${slot.role})`).join(', ')
  const identity = (clause: string) =>
    identityAvatars.length === 0
      ? `Use the avatar as the new identity: ${clause}.`
      : identityAvatars.length === 1
        ? `${roles} is the avatar identity reference: ${clause}.`
        : `${roles} are identity references of the same avatar: ${clause}.`
  const keep = `Keep ${ref(target.index)}'s pose, clothing, hair unless changed, background, lighting and camera.`
  const restate = `The result keeps ${ref(target.index)}'s pose and the avatar's body proportions.`
  const supportingIds = [...demoted, ...extras].map((slot) => ref(slot.index)).join(' ')
  const supporting = supportingIds
    ? `${supportingIds} ${demoted.length + extras.length === 1 ? 'is a supporting reference' : 'are supporting references'} only.`
    : ''

  const compose = (tier: { supporting: boolean; bodyDetail: BodyDetail }, clause: string): string => {
    const body = bodyDirective(
      avatarProfile,
      target.index,
      bodyIndex,
      tier.bodyDetail,
      promptProfile.negatives,
      ref,
    )
    const head = [
      `${ref(target.index)} is the target photo.`,
      identity(clause),
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
