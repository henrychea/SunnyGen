import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_AVATAR_PROFILE,
  DEFAULT_EDIT_PROFILE,
  editProfile,
  type AvatarModelFamily,
} from '@sunnygen/core'
import { editReferencePlan } from './avatar-references'
import { buildEditPrompt, orderEditAssets } from './edit-prompt'

/** One board avatar prompt per family, built from the same inputs. */
const BOARDS = [
  { role: 'face' as const, assetId: 'face-board', width: 4096, height: 4096 },
  { role: 'body' as const, assetId: 'body-board', width: 4096, height: 4096 },
  { role: 'details' as const, assetId: 'details-board', width: 4095, height: 2738 },
]

const MODELS: Record<AvatarModelFamily, string> = {
  'nano-banana': 'fal:fal-ai/nano-banana-pro',
  'gpt-image': 'fal:openai/gpt-image-2',
  flux: 'fal:fal-ai/flux-2-pro',
  seedream: 'sunra:bytedance/seedream-5.5',
  qwen: 'fal:fal-ai/qwen-image-edit-2509',
  wan: 'fal:fal-ai/wan/v2.7/image-edit',
  grok: 'sunra:xai/grok-imagine-image',
  generic: 'fal:custom/endpoint',
}

function boardPrompt(family: AvatarModelFamily): string {
  const modelId = MODELS[family]
  const avatar = editReferencePlan(
    [{ id: 'face-board', assetIds: [], avatar: true, profile: DEFAULT_AVATAR_PROFILE, boards: BOARDS }],
    modelId,
  )
  return buildEditPrompt(
    '',
    [{ id: 'target', assetIds: ['target'], avatar: false, role: 'target photo' }, ...avatar],
    DEFAULT_EDIT_PROFILE,
    { modelId },
  )
}

// Task-first where the vendor guide recommends it: Google, OpenAI, Seedream, Qwen, Wan and the
// generic fallback lead with the instruction; FLUX and Grok lead with a narrated sentence.
const TASK_FIRST: AvatarModelFamily[] = ['nano-banana', 'gpt-image', 'seedream', 'qwen', 'wan', 'generic']

const SNAPSHOTS: Record<AvatarModelFamily, string> = {
  'nano-banana': [
    'Task: Edit image 4 into a new photo of the avatar. Output one single photo, not a board or collage.',
    'References: image 1 is the face board: top-left front, top-right three-quarter, bottom-left side profile, bottom-right expressions. image 2 is the body board: top-left front, top-right side profile, bottom-left back, bottom-right three-quarter. image 3 is the details board: top row hands, skin, hair; bottom row facial features, body details. image 5 is a supporting reference only.',
    "Face: Replace the face completely with the avatar's from image 1: soft oval face shape, slender jawline, petite chin, the same cheekbones, forehead and hairline, large natural almond-shaped eyes, the same eye spacing and eyelids, slender naturally arched eyebrows, slim nose bridge and dainty nose tip, soft and full lips, the same ears, fair and natural skin tone and texture, the same moles. Every facial feature comes from image 1.",
    "Hair: Replace the hair with the avatar's from image 1 and image 3: dark brown near-black long hair, slightly wavy, natural center-parted fringe, restyled to fit the scene (wind, pose).",
    "Body: Replace the body with the avatar's from image 2: 168 cm, very slim and hourglass build, large bust, long legs, the same shoulder width, chest, waist, hips, buttocks, thigh width, leg length and arm thickness. Take the widths from the front tile and the curves from the side profile tile. The clothing is refitted to the new body, same garment.",
    'Keep from image 4: pose, gesture, expression type, clothing design, background, camera angle, framing and crop, focal length, depth of field.',
    "Integrate: Relight the avatar to image 4's light (direction, softness, colour temperature, shadows and highlights on skin and clothes), then match image 4's colour grading, white balance, noise or grain and sharpness. Ignore the white studio background, flat lighting and layout of the boards.",
    "The result is one photo that keeps image 4's pose and the avatar's body proportions.",
  ].join('\n'),
  'gpt-image': [
    'Task: Edit image 4.',
    '1. Replace the person in image 4 with the avatar. Output one single photo, not a board or collage.',
    '2. References: image 1 is the face board: top-left front, top-right three-quarter, bottom-left side profile, bottom-right expressions. image 2 is the body board: top-left front, top-right side profile, bottom-left back, bottom-right three-quarter. image 3 is the details board: top row hands, skin, hair; bottom row facial features, body details. image 5 is a supporting reference only.',
    "3. Face: Replace the face completely with the avatar's from image 1: soft oval face shape, slender jawline, petite chin, the same cheekbones, forehead and hairline, large natural almond-shaped eyes, the same eye spacing and eyelids, slender naturally arched eyebrows, slim nose bridge and dainty nose tip, soft and full lips, the same ears, fair and natural skin tone and texture, the same moles. None of image 4's facial structure may remain.",
    "4. Hair: Replace the hair with the avatar's from image 1 and image 3: dark brown near-black long hair, slightly wavy, natural center-parted fringe, restyled to fit the scene (wind, pose).",
    "5. Body: Replace the body with the avatar's from image 2: 168 cm, very slim and hourglass build, large bust, long legs, the same shoulder width, chest, waist, hips, buttocks, thigh width, leg length and arm thickness. Take the widths from the front tile and the curves from the side profile tile. The clothing is refitted to the new body, same garment.",
    '6. Keep from image 4: pose, gesture, expression type, clothing design, background, camera angle, framing and crop, focal length, depth of field.',
    "7. Integrate: Relight the avatar to image 4's light (direction, softness, colour temperature, shadows and highlights on skin and clothes), then match image 4's colour grading, white balance, noise or grain and sharpness. Ignore the white studio background, flat lighting and layout of the boards.",
  ].join('\n'),
  flux: [
    "A photorealistic photo of the avatar from image 1, replacing the person in image 4. Output one single photo, not a board or collage. The face comes entirely from image 1: soft oval face shape, slender jawline, petite chin, the same cheekbones, forehead and hairline, large natural almond-shaped eyes, the same eye spacing and eyelids, slender naturally arched eyebrows, slim nose bridge and dainty nose tip, soft and full lips, the same ears, fair and natural skin tone and texture, the same moles. The hair is the avatar's: dark brown near-black long hair, slightly wavy, natural center-parted fringe, restyled for the scene. The body is the avatar's from image 2: 168 cm, very slim and hourglass build, large bust, long legs, the same shoulder width, chest, waist, hips, buttocks, thigh width, leg length and arm thickness, widths from the front tile, curves from the side profile tile, the same garment refitted. Keep image 4's pose, gesture, expression type, clothing design, background, camera angle, framing and crop, focal length, depth of field. Light and grade it like image 4: Relight the avatar to image 4's light and match its colour grading and grain.",
  ].join('\n'),
  seedream: [
    'Task: Edit image 4 into one single new photo of the avatar, not a board or collage.',
    'References: image 1 is the face board: top-left front, top-right three-quarter, bottom-left side profile, bottom-right expressions. image 2 is the body board: top-left front, top-right side profile, bottom-left back, bottom-right three-quarter. image 3 is the details board: top row hands, skin, hair; bottom row facial features, body details. image 5 is a supporting reference only.',
    'Change:',
    "Face: Replace the face completely with the avatar's from image 1: soft oval face shape, slender jawline, petite chin, the same cheekbones, forehead and hairline, large natural almond-shaped eyes, the same eye spacing and eyelids, slender naturally arched eyebrows, slim nose bridge and dainty nose tip, soft and full lips, the same ears, fair and natural skin tone and texture, the same moles. None of image 4's facial structure may remain.",
    "Hair: Replace the hair with the avatar's from image 1 and image 3: dark brown near-black long hair, slightly wavy, natural center-parted fringe, restyled to fit the scene (wind, pose).",
    "Body: Replace the body with the avatar's from image 2: 168 cm, very slim and hourglass build, large bust, long legs, the same shoulder width, chest, waist, hips, buttocks, thigh width, leg length and arm thickness. Take the widths from the front tile and the curves from the side profile tile. The clothing is refitted to the new body, same garment.",
    'Keep fixed:',
    'Keep from image 4: pose, gesture, expression type, clothing design, background, camera angle, framing and crop, focal length, depth of field.',
    "Integrate: Relight the avatar to image 4's light (direction, softness, colour temperature, shadows and highlights on skin and clothes), then match image 4's colour grading, white balance, noise or grain and sharpness. Ignore the white studio background, flat lighting and layout of the boards.",
  ].join('\n'),
  qwen: [
    "Edit image 3 into one photo of the avatar. image 1 is the face board, image 2 the body board. Face from image 1: soft oval face shape, slender jawline, petite chin, the same cheekbones, forehead and hairline, large natural almond-shaped eyes, the same eye spacing and eyelids, slender naturally arched eyebrows, slim nose bridge and dainty nose tip, soft and full lips, the same ears, fair and natural skin tone and texture, the same moles. Hair: dark brown near-black long hair, slightly wavy, natural center-parted fringe. Body: 168 cm, very slim and hourglass build, large bust, long legs. Keep pose, gesture, expression type, clothing design, background, camera angle, framing and crop, focal length, depth of field. Relight to image 3's light, match its grade and grain.",
  ].join('\n'),
  wan: [
    "Edit image 4 into a photo of the avatar. Output one single photo, not a board or collage. Use image 1 for the face and hair, image 2 for the body. Face: soft oval face shape, slender jawline, petite chin, the same cheekbones, forehead and hairline, large natural almond-shaped eyes, the same eye spacing and eyelids, slender naturally arched eyebrows, slim nose bridge and dainty nose tip, soft and full lips, the same ears, fair and natural skin tone and texture, the same moles. Body: 168 cm, very slim and hourglass build, large bust, long legs, the same shoulder width, chest, waist, hips, buttocks, thigh width, leg length and arm thickness. Keep pose, gesture, expression type, clothing design, background, camera angle, framing and crop, focal length, depth of field. Relight to image 4's light and grade.",
  ].join('\n'),
  grok: [
    "Edit image 4 into a photo of the avatar from image 1. Output one single photo, not a board or collage. Face and hair from image 1: soft oval face shape, slender jawline, petite chin, the same cheekbones, forehead and hairline, large natural almond-shaped eyes, the same eye spacing and eyelids, slender naturally arched eyebrows, slim nose bridge and dainty nose tip, soft and full lips, the same ears, fair and natural skin tone and texture, the same moles; dark brown near-black long hair, slightly wavy, natural center-parted fringe. Body from image 2: 168 cm, very slim and hourglass build, large bust, long legs, the same shoulder width, chest, waist, hips, buttocks, thigh width, leg length and arm thickness. Keep pose, gesture, expression type, clothing design, background, camera angle, framing and crop, focal length, depth of field. Relight the avatar to image 4's light and match its colour grading and grain.",
  ].join('\n'),
  generic: [
    'Task: Edit image 4 into a new photo of the avatar. Output one single photo, not a board or collage.',
    'References: image 1 is the face board: top-left front, top-right three-quarter, bottom-left side profile, bottom-right expressions. image 2 is the body board: top-left front, top-right side profile, bottom-left back, bottom-right three-quarter. image 3 is the details board: top row hands, skin, hair; bottom row facial features, body details. image 5 is a supporting reference only.',
    "Face: Replace the face completely with the avatar's from image 1: soft oval face shape, slender jawline, petite chin, the same cheekbones, forehead and hairline, large natural almond-shaped eyes, the same eye spacing and eyelids, slender naturally arched eyebrows, slim nose bridge and dainty nose tip, soft and full lips, the same ears, fair and natural skin tone and texture, the same moles. None of image 4's facial structure may remain.",
    "Hair: Replace the hair with the avatar's from image 1 and image 3: dark brown near-black long hair, slightly wavy, natural center-parted fringe, restyled to fit the scene (wind, pose).",
    'Keep from image 4: pose, gesture, expression type, clothing design, background, camera angle, framing and crop, focal length, depth of field.',
    "Body: Replace the body with the avatar's from image 2: 168 cm, very slim and hourglass build, large bust, long legs, the same shoulder width, chest, waist, hips, buttocks, thigh width, leg length and arm thickness. Take the widths from the front tile and the curves from the side profile tile. The clothing is refitted to the new body, same garment.",
    "Integrate: Relight the avatar to image 4's light (direction, softness, colour temperature, shadows and highlights on skin and clothes), then match image 4's colour grading, white balance, noise or grain and sharpness. Ignore the white studio background, flat lighting and layout of the boards.",
  ].join('\n'),
}

for (const family of Object.keys(MODELS) as AvatarModelFamily[]) {
  test(`the ${family} board prompt is locked`, () => {
    assert.equal(boardPrompt(family), SNAPSHOTS[family])
  })
}

test('every family carries the face replacement and the integration step', () => {
  for (const family of Object.keys(MODELS) as AvatarModelFamily[]) {
    const prompt = boardPrompt(family)
    assert.match(prompt, /soft oval face shape/, `${family} face list`)
    assert.match(prompt, /relight|Light and grade|Relight/, `${family} integrate`)
    assert.match(prompt, /one (single )?(new )?photo/i, `${family} single photo`)
    assert.match(prompt, /168 cm/, `${family} body facts`)
    assert.match(prompt, /dark brown near-black long hair|face and hair|hair/i, `${family} hair`)
  }
})

for (const family of TASK_FIRST) {
  test(`the ${family} board prompt leads with the task`, () => {
    assert.match(boardPrompt(family), /^(Task:|Edit image \d+)/, family)
  })
}

test('qwen stays inside its documented 800 character cap', () => {
  const prompt = boardPrompt('qwen')
  assert.ok(prompt.length <= 800, `qwen prompt is ${prompt.length} chars`)
  // The task and the face replacement survive the trimming.
  assert.match(prompt, /Edit image \d+ into one photo of the avatar/)
  assert.match(prompt, /Face from image \d+/)
})

test('image references use the token format the model expects', () => {
  for (const family of Object.keys(MODELS) as AvatarModelFamily[]) {
    const prompt = boardPrompt(family)
    assert.match(prompt, /image \d+/, `${family} plain tokens`)
    assert.doesNotMatch(prompt, /@image\d/, `${family} must not use at-tokens by default`)
  }
})

// Real catalog ids, resolved through the same editProfile the composer uses.
const REAL_MODELS: Partial<Record<AvatarModelFamily, string>> = {
  'nano-banana': 'sunra:google/gemini-nano-banana-2.1',
  'gpt-image': 'sunra:openai/gpt-image-2',
  flux: 'fal:fal-ai/flux-2-pro',
  seedream: 'sunra:bytedance/seedream-5.5',
  qwen: 'sunra:qwen/qwen-image-2.1',
  generic: 'fal:custom/endpoint',
}

const TARGET_ID = 'target-asset'

function composerPath(modelId: string) {
  const profile = editProfile(modelId)
  const references = editReferencePlan(
    [
      { id: TARGET_ID, assetIds: [TARGET_ID], avatar: false, role: 'target photo' },
      { id: 'face-board', assetIds: [], avatar: true, profile: DEFAULT_AVATAR_PROFILE, boards: BOARDS },
    ],
    'fal:fal-ai/nano-banana-pro',
  )
  return {
    profile,
    references,
    assets: orderEditAssets(references, TARGET_ID, profile),
    prompt: buildEditPrompt('', references, profile, { modelId }),
  }
}

test('every image number in the prompt names the asset at that position', () => {
  for (const [family, modelId] of Object.entries(REAL_MODELS) as Array<[AvatarModelFamily, string]>) {
    const { assets, prompt } = composerPath(modelId)
    // Every token the prompt uses must exist in the ordered asset list.
    for (const match of prompt.matchAll(/image ?(\d+)/g)) {
      const position = Number(match[1])
      assert.ok(assets[position - 1], `${family}: image ${position} is out of range`)
    }
    // The target and the face board are each named by the number of their own position.
    const targetNumber = assets.indexOf(TARGET_ID) + 1
    const faceNumber = assets.indexOf('face-board') + 1
    const bodyNumber = assets.indexOf('body-board') + 1
    assert.ok(targetNumber > 0 && faceNumber > 0 && bodyNumber > 0, `${family}: assets missing`)
    assert.match(prompt, new RegExp(`image ?${targetNumber}(?!\\d)`), `${family}: target token`)
    assert.match(prompt, new RegExp(`image ?${faceNumber}(?!\\d)`), `${family}: face board token`)
    assert.match(prompt, new RegExp(`image ?${bodyNumber}(?!\\d)`), `${family}: body board token`)
    // When the template opens with the edit instruction, it points at the target.
    const editMatch = prompt.match(/Edit image ?(\d+)/)
    if (editMatch) assert.equal(Number(editMatch[1]), targetNumber, `${family}: task token is the target`)
  }
})

test('the target is image 1 for the real nano-banana composer path', () => {
  const { assets, prompt } = composerPath('sunra:google/gemini-nano-banana-2.1')
  assert.equal(assets[0], TARGET_ID)
  assert.match(prompt, /^Task: Edit image 1 into/)
})

test('no sentence in any family prompt starts lowercase', () => {
  for (const family of Object.keys(MODELS) as AvatarModelFamily[]) {
    const prompt = boardPrompt(family)
    for (const line of prompt.split('\n')) {
      if (!line.trim()) continue
      assert.match(line, /^[A-Z0-9]/, `${family}: line starts lowercase: ${line.slice(0, 40)}`)
      for (const sentence of line.split(/(?<=\.)\s+/).slice(1)) {
        // Image tokens stay lowercase by design; every other sentence must be capitalised.
        if (/^(@?image ?\d+)/.test(sentence)) continue
        assert.match(sentence, /^[A-Z0-9]/, `${family}: sentence starts lowercase: ${sentence.slice(0, 40)}`)
      }
    }
  }
})
