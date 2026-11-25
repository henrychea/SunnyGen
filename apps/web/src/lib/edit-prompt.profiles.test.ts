import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_AVATAR_PROFILE,
  EDIT_PROMPT_PROFILES,
  avatarModelFamily,
  editProfile,
  type AvatarModelFamily,
  type AvatarProfile,
} from '@sunnygen/core'
import { editReferencePlan } from './avatar-references'
import { buildEditPrompt, buildEditPromptResult, orderEditAssets } from './edit-prompt'

// A K4-style avatar: 165 cm, 49 kg, slim, slight bust, long legs.
const K4: AvatarProfile = {
  ...DEFAULT_AVATAR_PROFILE,
  identity: { gender: 'female', age: 24, ethnicity: 'East Asian', heightCm: 165, weightKg: 49 },
  body: { build: 'slim', legs: 'long', bust: 'slight' },
}

// An avatar with no face panel keeps the legacy prompt: the sheet and the old 4x4 panel, whole.
const LEGACY = {
  id: 'sheet',
  assetIds: ['sheet', 'panel'],
  sheetAssetId: 'sheet',
  avatar: true,
  profile: K4,
}

const INSTRUCTION = 'keep the same expression and make the light warmer and softer'

/** Every documented edit model in the repo catalog, one per documented family and provider. */
const EDIT_MODELS = [
  'sunra:nano-banana-2',
  'sunra:nano-banana-pro',
  'fal:fal-ai/nano-banana-pro',
  'fal:google/nano-banana-2.1',
  'sunra:google/gemini-3-pro-image',
  'sunra:google/gemini-nano-banana-2.1',
  'sunra:qwen/qwen-image-2.1',
  'fal:fal-ai/wan/v2.7/image-edit',
  'fal:fal-ai/qwen-image-edit-2509',
  'sunra:bytedance/seedream-5-lite',
  'sunra:bytedance/seedream-5-pro',
  'sunra:bytedance/seedream-5.0-flash',
  'sunra:bytedance/seedream-5.5',
  'fal:fal-ai/bytedance/seedream/v4/edit',
  'sunra:black-forest-labs/flux-3-image',
  'fal:fal-ai/flux-2-pro',
  'fal:fal-ai/flux-2-max',
  'fal:fal-ai/flux-pro/kontext/multi',
  'sunra:gpt-image-2',
  'sunra:openai/gpt-image-2',
  'fal:openai/gpt-image-2',
  'sunra:grok-imagine-image',
  'sunra:xai/grok-imagine-image',
] as const

const CANONICAL: Record<AvatarModelFamily, string> = {
  'nano-banana': 'sunra:nano-banana-pro',
  qwen: 'fal:fal-ai/qwen-image-edit-2509',
  flux: 'sunra:black-forest-labs/flux-3-image',
  seedream: 'sunra:bytedance/seedream-5.5',
  'gpt-image': 'sunra:openai/gpt-image-2',
  grok: 'sunra:xai/grok-imagine-image',
  wan: 'fal:fal-ai/wan/v2.7/image-edit',
  generic: 'fal:custom/endpoint',
}

const NEGATIVE = /\b(?:do not|don't|must not|never)\b/i
const BODY_FACTS = "with the avatar's: 165 cm, 49 kg, slim build, slight bust, long legs"

function build(modelId: string, instruction = INSTRUCTION) {
  const references = editReferencePlan([LEGACY], modelId)
  const profile = editProfile(modelId)
  return {
    references,
    profile,
    ordered: orderEditAssets(references, 'target', profile),
    family: avatarModelFamily(modelId),
    spec: EDIT_PROMPT_PROFILES[avatarModelFamily(modelId)],
    ...buildEditPromptResult(instruction, references, profile, { modelId }),
  }
}

function clauseOf(prompt: string): string {
  const match = prompt.match(/identity references? of the same avatar: (.*)\.\n/)
  return match?.[1] ?? ''
}

for (const modelId of EDIT_MODELS) {
  test(`${modelId} builds a prompt that follows its family profile`, () => {
    const { prompt, ordered, family, spec, overflow } = build(modelId)
    const lines = prompt.split('\n')
    assert.equal(family, avatarModelFamily(modelId))
    assert.equal(overflow, null, modelId)

    const bodyLine = lines.findIndex((line) => line.includes(BODY_FACTS))
    const keepLine = lines.findIndex((line) => line.startsWith('Keep '))
    assert.ok(bodyLine >= 0 && keepLine >= 0, modelId)
    if (spec.bodyPlacement === 'early') assert.ok(bodyLine < keepLine, `${modelId} body early`)
    else assert.ok(bodyLine > keepLine, `${modelId} body late`)

    if (spec.detail === 'detailed') {
      assert.match(prompt, /Take shoulder width, chest, waist, hips and thigh width from/, modelId)
    } else {
      assert.match(prompt, /Take the body proportions from/, modelId)
      assert.doesNotMatch(prompt, /shoulder width/, modelId)
    }

    if (spec.negatives === 'avoid') assert.doesNotMatch(prompt, NEGATIVE, modelId)
    if (spec.negatives === 'allow' && spec.detail === 'detailed') {
      assert.match(prompt, /must not survive/, modelId)
    }

    const restate = lines.some((line) =>
      /^The result keeps @?image ?\d+'s pose and the avatar's body proportions\.$/.test(line),
    )
    assert.equal(restate, spec.restateBody, `${modelId} restatement`)

    // The clause stays inside the family budget; the instruction is never part of it.
    assert.ok(clauseOf(prompt).length <= spec.clauseBudget, `${modelId} clause ${clauseOf(prompt).length}`)

    // Every cited index exists in the ordered asset list, and no family cites more avatar refs than it takes.
    for (const match of prompt.matchAll(/@?image ?(\d+)/g)) {
      assert.ok(Number(match[1]) <= ordered.length, `${modelId} cites image ${match[1]} of ${ordered.length}`)
    }
    const cited = lines.find((line) => line.includes('identity reference'))?.match(/@?image ?\d+ \(/g) ?? []
    assert.ok(cited.length <= spec.maxRefs, `${modelId} cites ${cited.length} avatar refs`)

    if (spec.maxChars !== undefined) assert.ok(prompt.length <= spec.maxChars, `${modelId} ${prompt.length}`)
  })
}

test('a 300-character instruction stays whole while the boilerplate shrinks inside the cap', () => {
  const typed = 'warm the light and keep the pose exactly '.repeat(20).slice(0, 300)
  for (const modelId of EDIT_MODELS) {
    const { spec, prompt, overflow } = build(modelId, typed)
    const short = build(modelId)
    assert.equal(overflow, null, modelId)
    assert.ok(prompt.endsWith(typed), `${modelId} keeps the instruction whole`)
    if (spec.maxChars === undefined) continue
    assert.ok(prompt.length <= spec.maxChars, `${modelId} ${prompt.length}`)
    // Boilerplate gives way: the clause is shorter than with the short instruction.
    assert.ok(clauseOf(prompt).length < clauseOf(short.prompt).length, `${modelId} clause shrank`)
  }
})

test('Qwen reports overflow instead of returning an over-limit prompt', () => {
  const typed = 'x'.repeat(900)
  const { prompt, references, profile, ordered, overflow } = build('fal:fal-ai/qwen-image-edit-2509', typed)
  assert.deepEqual(overflow, { overBy: prompt.length - 800, maxChars: 800 })
  assert.ok((overflow?.overBy ?? 0) > 0)
  assert.ok(prompt.length > 800)
  // Nothing was sliced: the instruction is intact and the boilerplate is at its floor.
  assert.ok(prompt.endsWith(typed))
  assert.match(prompt, /same avatar: 24yo East Asian woman\.\n/)
  assert.match(
    prompt,
    new RegExp(
      `Replace ${profile.token.replace('%d', String(ordered.indexOf('target') + 1))}'s body with the avatar's: 165 cm, [^.]+\\.\n`,
    ),
  )
  assert.doesNotMatch(prompt, /Take the body proportions from/)
  // The string wrapper still returns the full attempt so nothing is silently truncated.
  assert.equal(
    buildEditPrompt(typed, references, profile, { modelId: 'fal:fal-ai/qwen-image-edit-2509' }),
    prompt,
  )
})

test('the legacy prompt is unchanged when no avatar profile is attached', () => {
  assert.equal(
    buildEditPrompt('', [{ id: 'sheet', assetIds: ['sheet', 'panel'], avatar: true }]),
    "Use image 1 — the attached character reference sheet — and image 2 — the attached 4x4 character panel — as the ONLY identity and body references. Replace the person in image 3 with the character shown in image 1 and image 2.\n\nThe face and body must match the avatar references 100%. Copy the exact face shape, facial features, eyes, eyebrows, nose, mouth, skin tone, hair colour, hairstyle and hairline from image 1. Use image 2 for side and back angles, expressions, hair details, hands, skin texture and the full-body proportions. Copy the exact body proportions: height, overall build, shoulder width, chest, waist width, hip width, torso length and leg length. Do not slim, widen or idealise those proportions. Do not keep, blend or invent any identity or body proportions from image 3. If the references conflict, image 1 wins the face and image 2 wins the body proportions. Keep the pose, clothing, lighting, camera angle and background of image 3. Only the person's face, hair and body change to match the avatar exactly.",
  )
  assert.equal(
    buildEditPrompt('Make the jacket red.', []),
    'Edit the person in image 1. Keep the original pose, clothing, lighting, camera angle and background. Change only what the additional instructions request.\n\nAdditional instructions:\nMake the jacket red.',
  )
  assert.deepEqual(buildEditPromptResult('Make the jacket red.', []).overflow, null)
})

/**
 * One locked snapshot per family for the legacy two-image avatar: any change to the keyword
 * prompt shape shows up as an exact diff. The panel templates are locked in
 * edit-prompt.panels.test.ts.
 */
const SNAPSHOTS: Record<AvatarModelFamily, string> = {
  'nano-banana': [
    'image 1 is the target photo.',
    'image 2 (reference sheet), image 3 (4x4 panel) are identity references of the same avatar: 24yo East Asian woman, soft oval face, slender jaw, petite chin, slim bridge, dainty tip, full lips, large almond eyes, visible crease, slender arched brows, fair skin, dark brown near-black long hair, slightly wavy, natural center-parted fringe.',
    'Replace the person in image 1 with the avatar: copy the face, facial features, skin tone and hair from image 2, image 3.',
    "Replace image 1's body with the avatar's: 165 cm, 49 kg, slim build, slight bust, long legs. Take shoulder width, chest, waist, hips and thigh width from the avatar reference images. The body, proportions and figure belong to the avatar; the pose, clothing, framing, lighting and camera belong to image 1.",
    "Keep image 1's pose, clothing, background, lighting and camera.",
    "The result keeps image 1's pose and the avatar's body proportions.",
    '',
    'Additional instructions:',
    'keep the same expression and make the light warmer and softer',
  ].join('\n'),
  qwen: [
    'image 1 is the target photo.',
    'image 2 (reference sheet), image 3 (4x4 panel) are identity references of the same avatar: 24yo East Asian woman, soft oval face, slender jaw, petite chin, slim bridge, dainty tip, full lips, large almond eyes, visible crease, slender arched brows, fair skin, dark brown near-black long hair, slightly wavy, natural center-parted fringe.',
    'Replace the person in image 1 with the avatar: copy the face, facial features, skin tone and hair from image 2, image 3.',
    "Replace image 1's body with the avatar's: 165 cm, 49 kg, slim build, slight bust, long legs. Take the body proportions from the avatar reference images.",
    "Keep image 1's pose, clothing, background, lighting and camera.",
    '',
    'Additional instructions:',
    'keep the same expression and make the light warmer and softer',
  ].join('\n'),
  flux: [
    'image 1 is the target photo.',
    'image 2 (reference sheet), image 3 (4x4 panel) are identity references of the same avatar: 24yo East Asian woman, soft oval face, slender jaw, petite chin, slim bridge, dainty tip, full lips, large almond eyes, visible crease, slender arched brows, fair skin, dark brown near-black long hair, slightly wavy, natural center-parted fringe.',
    'Replace the person in image 1 with the avatar: copy the face, facial features, skin tone and hair from image 2, image 3.',
    "Keep image 1's pose, clothing, background, lighting and camera.",
    "Replace image 1's body with the avatar's: 165 cm, 49 kg, slim build, slight bust, long legs. Take shoulder width, chest, waist, hips and thigh width from the avatar reference images. image 1's own hips, thighs and waist must not survive.",
    '',
    'Additional instructions:',
    'keep the same expression and make the light warmer and softer',
  ].join('\n'),
  seedream: [
    'image 1 is the target photo.',
    'image 2 (reference sheet), image 3 (4x4 panel) are identity references of the same avatar: 24yo East Asian woman, soft oval face, slender jaw, petite chin, slim bridge, dainty tip, full lips, large almond eyes, visible crease, slender arched brows, fair skin, dark brown near-black long hair, slightly wavy, natural center-parted fringe.',
    'Replace the person in image 1 with the avatar: copy the face, facial features, skin tone and hair from image 2, image 3.',
    "Keep image 1's pose, clothing, background, lighting and camera.",
    "Replace image 1's body with the avatar's: 165 cm, 49 kg, slim build, slight bust, long legs. Take shoulder width, chest, waist, hips and thigh width from the avatar reference images. image 1's own hips, thighs and waist must not survive.",
    '',
    'Additional instructions:',
    'keep the same expression and make the light warmer and softer',
  ].join('\n'),
  'gpt-image': [
    'image 1 is the target photo.',
    'image 2 (reference sheet), image 3 (4x4 panel) are identity references of the same avatar: 24yo East Asian woman, soft oval face, slender jaw, petite chin, slim bridge, dainty tip, full lips, large almond eyes, visible crease, slender arched brows, fair skin, dark brown near-black long hair, slightly wavy, natural center-parted fringe.',
    'Replace the person in image 1 with the avatar: copy the face, facial features, skin tone and hair from image 2, image 3.',
    "Keep image 1's pose, clothing, background, lighting and camera.",
    "Replace image 1's body with the avatar's: 165 cm, 49 kg, slim build, slight bust, long legs. Take the body proportions from the avatar reference images.",
    '',
    'Additional instructions:',
    'keep the same expression and make the light warmer and softer',
  ].join('\n'),
  grok: [
    'image 1 is the target photo.',
    'image 2 (reference sheet), image 3 (4x4 panel) are identity references of the same avatar: 24yo East Asian woman, soft oval face, slender jaw, petite chin, slim bridge, dainty tip, full lips, large almond eyes, visible crease, slender arched brows, fair skin, dark brown near-black long hair, slightly wavy, natural center-parted fringe.',
    'Replace the person in image 1 with the avatar: copy the face, facial features, skin tone and hair from image 2, image 3.',
    "Replace image 1's body with the avatar's: 165 cm, 49 kg, slim build, slight bust, long legs. Take the body proportions from the avatar reference images.",
    "Keep image 1's pose, clothing, background, lighting and camera.",
    '',
    'Additional instructions:',
    'keep the same expression and make the light warmer and softer',
  ].join('\n'),
  wan: [
    'image 3 is the target photo.',
    'image 1 (reference sheet), image 2 (4x4 panel) are identity references of the same avatar: 24yo East Asian woman, soft oval face, slender jaw, petite chin, slim bridge, dainty tip, full lips, large almond eyes, visible crease, slender arched brows, fair skin, dark brown near-black long hair, slightly wavy, natural center-parted fringe.',
    'Replace the person in image 3 with the avatar: copy the face, facial features, skin tone and hair from image 1, image 2.',
    "Replace image 3's body with the avatar's: 165 cm, 49 kg, slim build, slight bust, long legs. Take the body proportions from the avatar reference images.",
    "Keep image 3's pose, clothing, background, lighting and camera.",
    '',
    'Additional instructions:',
    'keep the same expression and make the light warmer and softer',
  ].join('\n'),
  generic: [
    'image 3 is the target photo.',
    'image 1 (reference sheet), image 2 (4x4 panel) are identity references of the same avatar: 24yo East Asian woman, soft oval face, slender jaw, petite chin, slim bridge, dainty tip, full lips, large almond eyes, visible crease, slender arched brows, fair skin, dark brown near-black long hair, slightly wavy, natural center-parted fringe.',
    'Replace the person in image 3 with the avatar: copy the face, facial features, skin tone and hair from image 1, image 2.',
    "Keep image 3's pose, clothing, background, lighting and camera.",
    "Replace image 3's body with the avatar's: 165 cm, 49 kg, slim build, slight bust, long legs. Take shoulder width, chest, waist, hips and thigh width from the avatar reference images. image 3's own hips, thighs and waist must not survive.",
    '',
    'Additional instructions:',
    'keep the same expression and make the light warmer and softer',
  ].join('\n'),
}

for (const [family, modelId] of Object.entries(CANONICAL) as Array<[AvatarModelFamily, string]>) {
  test(`the ${family} prompt shape is locked`, () => {
    const { prompt, family: resolved } = build(modelId)
    assert.equal(resolved, family)
    assert.equal(prompt, SNAPSHOTS[family])
  })
}
