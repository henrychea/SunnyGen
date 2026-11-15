export interface EditReference {
  id: string
  assetIds?: string[]
  avatar?: boolean
}

function referenceAssets(reference: EditReference): string[] {
  return reference.assetIds && reference.assetIds.length > 0 ? reference.assetIds : [reference.id]
}

export function orderEditAssets(references: EditReference[], targetId: string): string[] {
  const avatarIds = references.filter((reference) => reference.avatar).flatMap(referenceAssets)
  const otherIds = references.filter((reference) => !reference.avatar).flatMap(referenceAssets)
  if (avatarIds.length > 0) return [...avatarIds, targetId, ...otherIds]
  if (otherIds.length === 0) return [targetId]
  return [otherIds[0] as string, targetId, ...otherIds.slice(1)]
}

export function buildEditPrompt(prompt: string, references: EditReference[]): string {
  const detail = prompt.trim()
  const avatarIds = references.filter((reference) => reference.avatar).flatMap(referenceAssets)
  const otherIds = references.filter((reference) => !reference.avatar).flatMap(referenceAssets)

  if (avatarIds.length > 0) {
    const target = avatarIds.length + 1
    const hasPanel = avatarIds.length >= 2
    const sheet = hasPanel
      ? 'Use <<<image 1>>> — the attached character reference sheet — and <<<image 2>>> — the attached 4x4 character panel — as the ONLY identity and body references.'
      : 'Use <<<image 1>>> — the attached character reference sheet — as the ONLY identity and body reference.'
    const source = hasPanel ? '<<<image 1>>> and <<<image 2>>>' : '<<<image 1>>>'
    const identity = `${sheet} Replace the person in <<<image ${target}>>> with the character shown in ${source}.`
    const exact = `The face and body must match the avatar references 100%. Copy the exact face shape, facial features, eyes, eyebrows, nose, mouth, skin tone, hair colour, hairstyle and hairline from <<<image 1>>>.${hasPanel ? ' Use <<<image 2>>> for side and back angles, expressions, hair details, hands, skin texture and the full-body proportions.' : ''} Copy the exact body proportions: height, overall build, shoulder width, chest, waist width, hip width, torso length and leg length. Do not slim, widen, shorten, idealise or otherwise change the body. Do not keep, blend or invent any identity or body proportions from <<<image ${target}>>>. If the references conflict, <<<image 1>>> wins the face${hasPanel ? ' and <<<image 2>>> wins the body proportions' : ''}. Keep the pose, clothing, lighting, camera angle and background of <<<image ${target}>>>. Only the person's face, hair and body change to match the avatar exactly.`

    const additionalAvatars =
      avatarIds.length > 2
        ? `\n\nAdditional avatar images <<<image 3>>>${avatarIds.length > 3 ? `–<<<image ${avatarIds.length}>>>` : ''} are supporting references only; <<<image 1>>> and <<<image 2>>> remain the source of truth for face and body.`
        : ''

    const extraStart = target + 1
    const extraEnd = target + otherIds.length
    const extras =
      otherIds.length > 0
        ? `\n\n<<<image ${extraStart}>>>${extraEnd > extraStart ? `–<<<image ${extraEnd}>>>` : ''} ${otherIds.length === 1 ? 'is a supporting reference' : 'are supporting references'} only; they must not override images 1–${target}.`
        : ''

    return `${identity}\n\n${exact}${additionalAvatars}${extras}${detail ? `\n\nAdditional instructions:\n${detail}` : ''}`
  }

  if (otherIds.length === 0) {
    const lead =
      'Edit the person in <<<image 1>>>. Keep the original pose, clothing, lighting, camera angle and background. Change only what the additional instructions request.'
    return detail ? `${lead}\n\nAdditional instructions:\n${detail}` : lead
  }

  const identity = `Use <<<image 1>>> — the attached character reference sheet — as the ONLY identity reference. Replace the person in <<<image 2>>> with the character shown in <<<image 1>>>. Strictly copy that character's face shape, facial features, eyes, eyebrows, nose, mouth, skin tone, hair colour, hairstyle and body proportions. Do not keep, blend or invent any identity from <<<image 2>>>. Keep the pose, clothing, lighting, camera angle and background of <<<image 2>>>. Only the person's face, hair and body change to match the character exactly.`

  const proportions =
    otherIds.length >= 2
      ? `\n\nUse <<<image 3>>> — the full-body proportions photo — as reference data for body proportions ONLY. Image 3 is not a target and must never be used as the base photo. Never copy <<<image 3>>>'s pose, framing, crop, zoom, camera angle, lighting, background, clothing, hairstyle or scene. Apply its shoulder width, torso length, waist width, hip width and leg length only to the body visible in <<<image 2>>>, scaled to image 2's framing. If <<<image 2>>> is cropped above the legs, keep that crop: do not zoom out, extend the canvas, add legs or feet, or turn the shot into a full-body photo. Do not keep the target's height, build or limb length where image 3 disagrees. If the references conflict, <<<image 2>>> wins on composition, framing, pose, camera angle, lighting, background and clothing; image 3 only overrides body proportions.`
      : ''

  const extra =
    otherIds.length > 2
      ? '\n\nAny additional attached images are supporting references only; they must not override images 1–3.'
      : ''

  return `${identity}${proportions}${extra}${detail ? `\n\nAdditional instructions:\n${detail}` : ''}`
}
