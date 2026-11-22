import {
  DEFAULT_EDIT_PROFILE,
  IDENTITY_CLAUSE_BUDGETS,
  avatarModelFamily,
  editToken,
  identityClause,
  type AvatarModelFamily,
  type AvatarProfile,
  type EditProfile,
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

const QWEN_PROMPT_LIMIT = 800

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
  const detail = prompt.trim()
  const avatarIds = references.filter((reference) => reference.avatar).flatMap(referenceAssets)
  const otherIds = references.filter((reference) => !reference.avatar).flatMap(referenceAssets)
  const avatarProfile = references.find((reference) => reference.avatar && reference.profile)?.profile
  if (avatarProfile) return buildKeywordEditPrompt(detail, references, profile, options, avatarProfile)
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
    const exact = `The face and body must match the avatar references 100%. Copy the exact face shape, facial features, eyes, eyebrows, nose, mouth, skin tone, hair colour, hairstyle and hairline from ${ref(sheet)}.${hasPanel ? ` Use ${ref(panel)} for side and back angles, expressions, hair details, hands, skin texture and the full-body proportions.` : ''} Copy the exact body proportions: height, overall build, shoulder width, chest, waist width, hip width, torso length and leg length. Do not slim, widen, shorten, idealise or otherwise change the body. Do not keep, blend or invent any identity or body proportions from ${ref(target)}. If the references conflict, ${ref(sheet)} wins the face${hasPanel ? ` and ${ref(panel)} wins the body proportions` : ''}. Keep the pose, clothing, lighting, camera angle and background of ${ref(target)}. Only the person's face, hair and body change to match the avatar exactly.`

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

function buildKeywordEditPrompt(
  detail: string,
  references: EditReference[],
  profile: EditProfile,
  options: EditPromptOptions,
  avatarProfile: AvatarProfile,
): string {
  const family = options.modelFamily ?? avatarModelFamily(options.modelId ?? '')
  const slots = orderedSlots(references, profile)
  const ref = (index: number) => editToken(profile, index)
  const target = slots.find((slot) => slot.role === 'target photo') as EditSlot
  const avatars = slots.filter((slot) => slot.avatar)
  const extras = slots.filter((slot) => !slot.avatar && slot !== target)

  const roles = avatars.map((slot) => `${ref(slot.index)} (${slot.role})`).join(', ')
  const identity =
    avatars.length === 0
      ? `Use the avatar as the new identity: ${'clause'}.`
      : avatars.length === 1
        ? `${roles} is the avatar identity reference: ${'clause'}.`
        : `${roles} are identity references of the same avatar: ${'clause'}.`
  const keep = `Keep ${ref(target.index)}'s pose, clothing, hair unless changed, background, lighting and camera. Do not slim, widen or beautify the body.`
  const supporting =
    extras.length > 0
      ? `${extras.map((slot) => ref(slot.index)).join(' ')} ${extras.length === 1 ? 'is a supporting reference' : 'are supporting references'} only.`
      : ''

  const pieces = [`${ref(target.index)} is the target photo.`, identity, keep, supporting]
  const withoutClause = pieces.filter(Boolean).join('\n').length - 'clause'.length
  const budget =
    family === 'qwen'
      ? Math.min(
          IDENTITY_CLAUSE_BUDGETS.qwen,
          Math.max(0, QWEN_PROMPT_LIMIT - withoutClause - (detail ? detail.length + 28 : 0)),
        )
      : undefined
  const clause = identityClause(avatarProfile, { modelFamily: family, budget })
  const body = pieces
    .filter(Boolean)
    .map((piece) => piece.replace('clause', clause))
    .join('\n')
  return detail ? `${body}\n\nAdditional instructions:\n${detail}` : body
}
