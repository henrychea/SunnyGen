import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_AVATAR_PROFILE,
  DEFAULT_EDIT_PROFILE,
  EDIT_PROMPT_PROFILES,
  avatarModelFamily,
  editProfile,
  editToken,
} from '@sunnygen/core'
import { editReferencePlan } from './avatar-references'
import { buildEditPrompt, orderEditAssets } from './edit-prompt'

const AVATAR = [{ id: 'sheet', assetIds: ['sheet', 'panel'], avatar: true }]

test('the default profile keeps references first and numbers the target after them', () => {
  assert.deepEqual(orderEditAssets([{ id: 'identity' }, { id: 'proportions' }], 'target'), [
    'identity',
    'target',
    'proportions',
  ])
  assert.deepEqual(orderEditAssets([], 'target'), ['target'])
  assert.deepEqual(editProfile('fal:custom/endpoint'), DEFAULT_EDIT_PROFILE)
})

test('flux-2 on fal edits the first image and references the rest with @image tokens', () => {
  const profile = editProfile('fal:fal-ai/flux-2-pro')
  assert.deepEqual(profile, { target: 'first', token: '@image%d' })
  assert.deepEqual(orderEditAssets([...AVATAR, { id: 'pose' }], 'target', profile), [
    'target',
    'sheet',
    'panel',
    'pose',
  ])

  const prompt = buildEditPrompt('', [...AVATAR, { id: 'pose' }], profile)
  assert.match(prompt, /Replace the person in @image1 with the character shown in @image2 and @image3/)
  assert.match(prompt, /hairline from @image2/)
  assert.match(prompt, /Do not keep, blend or invent any identity or body proportions from @image1/)
  assert.match(prompt, /@image4 is a supporting reference only; they must not override images/)
  assert.doesNotMatch(prompt, /<<<|>>>/)
})

test('avatar swaps put the target first for every documented edit family', () => {
  const families = [
    'fal:fal-ai/flux-2-pro',
    'fal:fal-ai/flux-2-max',
    'fal:fal-ai/flux-pro/kontext/multi',
    'fal:fal-ai/nano-banana-pro',
    'fal:google/nano-banana-2.1',
    'fal:fal-ai/bytedance/seedream/v4/edit',
    'fal:openai/gpt-image-2',
    'fal:fal-ai/qwen-image-edit-2509',
    'sunra:bytedance/seedream-5.0-flash',
    'sunra:google/gemini-3-pro-image',
    'sunra:black-forest-labs/flux-3-image',
    'sunra:xai/grok-imagine-image',
    'sunra:openai/gpt-image-2',
    'fal:fal-ai/flux-lora',
  ]
  for (const family of families) {
    const profile = editProfile(family)
    if (family === 'fal:fal-ai/flux-lora') {
      assert.equal(profile, DEFAULT_EDIT_PROFILE, family)
      continue
    }
    assert.equal(profile.target, 'first', family)
    const ordered = orderEditAssets([...AVATAR, { id: 'pose' }], 'target', profile)
    assert.deepEqual(ordered, ['target', 'sheet', 'panel', 'pose'], family)
  }
})

test('prompt numbering follows the asset order for each family', () => {
  for (const family of ['fal:fal-ai/flux-2-pro', 'sunra:google/gemini-3-pro-image', 'fal:custom/endpoint']) {
    const profile = editProfile(family)
    const prompt = buildEditPrompt('', [...AVATAR, { id: 'pose' }], profile)
    const ordered = orderEditAssets([...AVATAR, { id: 'pose' }], 'target', profile)
    const tokens = [...prompt.matchAll(/@image\d+|image \d+/g)].map((match) => match[0])
    assert.ok(tokens.length > 0, family)
    const targetToken = profile.token.replace('%d', String(ordered.indexOf('target') + 1))
    const sheetToken = profile.token.replace('%d', String(ordered.indexOf('sheet') + 1))
    assert.ok(tokens.includes(targetToken), `${family} target ${targetToken}`)
    assert.ok(tokens.includes(sheetToken), `${family} sheet ${sheetToken}`)
  }
})

test('edit prompt without references edits the only image', () => {
  const prompt = buildEditPrompt('Make the jacket red.', [])
  assert.match(prompt, /Edit the person in image 1/)
  assert.doesNotMatch(prompt, /image 2/)
  assert.match(prompt, /Additional instructions:\nMake the jacket red\./)
})

test('one identity reference comes first only for the default profile', () => {
  const kept = buildEditPrompt('', [{ id: 'identity' }])
  assert.match(kept, /image 1 — the attached character reference sheet/)
  assert.match(kept, /Replace the person in image 2/)

  const flipped = buildEditPrompt('', [{ id: 'identity' }], editProfile('sunra:google/gemini-3-pro-image'))
  assert.match(flipped, /image 2 — the attached character reference sheet/)
  assert.match(flipped, /Replace the person in image 1 with the character shown in image 2/)
})

test('body proportions reference stays on the third image', () => {
  const prompt = buildEditPrompt('Keep the smile.', [{ id: 'identity' }, { id: 'proportions' }])
  assert.match(prompt, /image 3 — the full-body proportions photo/)
  assert.match(prompt, /image 3 only overrides body proportions/)
  assert.match(prompt, /Additional instructions:\nKeep the smile\./)

  const flipped = buildEditPrompt(
    '',
    [{ id: 'identity' }, { id: 'proportions' }],
    editProfile('fal:openai/gpt-image-2'),
  )
  assert.match(flipped, /Replace the person in image 1/)
  assert.match(flipped, /Use image 2 — the attached character reference sheet/)
  assert.match(flipped, /Use image 3 — the full-body proportions photo/)
})

test('extra references stay subordinate to the images that define the character', () => {
  const prompt = buildEditPrompt('', [{ id: 'identity' }, { id: 'proportions' }, { id: 'extra' }])
  assert.match(prompt, /Images image 4 onwards are supporting references only/)

  const avatar = buildEditPrompt('', [...AVATAR, { id: 'pose' }, { id: 'extra' }])
  assert.match(avatar, /image 4–image 5 are supporting references only/)
  assert.match(avatar, /they must not override images image 1–image 3/)
})

test('three or more avatar sheets keep the panel as the body source', () => {
  const prompt = buildEditPrompt(
    '',
    [{ id: 'sheet', assetIds: ['sheet', 'panel', 'side'], avatar: true }],
    editProfile('fal:fal-ai/flux-2-pro'),
  )
  assert.match(prompt, /Additional avatar images @image4 are supporting references only/)
  assert.match(prompt, /@image2 and @image3 remain the source of truth/)
})

// Fixtures follow the production crop plan: the body crop rides second, behind the frontal face.
const CROP_REFS = [
  { id: 'face-front', avatar: true, profile: DEFAULT_AVATAR_PROFILE, role: 'front face' },
  { id: 'body', avatar: true, profile: DEFAULT_AVATAR_PROFILE, role: 'full body' },
  { id: 'face-3q', avatar: true, profile: DEFAULT_AVATAR_PROFILE, role: 'three-quarter face' },
]

const FAMILIES = [
  'fal:fal-ai/qwen-image-edit-2509',
  'fal:fal-ai/nano-banana-pro',
  'sunra:bytedance/seedream-5.0-pro',
  'fal:fal-ai/flux-2-pro',
  'fal:openai/gpt-image-2',
]

test('a profiled avatar is described by roles and identity anchors', () => {
  for (const modelId of FAMILIES) {
    const prompt = buildEditPrompt('', CROP_REFS, editProfile(modelId), { modelId })
    const profile = EDIT_PROMPT_PROFILES[avatarModelFamily(modelId)]
    assert.match(prompt, /\(front face\)/)
    // Qwen takes two references, so its third crop is a supporting reference, not an identity source.
    if (profile.maxRefs >= 3) assert.match(prompt, /\(three-quarter face\)/)
    else assert.doesNotMatch(prompt, /identity references of the same avatar: [^\n]*three-quarter/)
    assert.match(prompt, /\(full body\)/)
    assert.match(prompt, /soft oval face/)
    assert.match(prompt, /slender arched brows/)
    assert.match(prompt, /pose, clothing, background, lighting and camera/)
    assert.match(prompt, /with the avatar's: 168 cm, very slim and hourglass build/)
    assert.match(prompt, /from @?image ?3 \(full body\)/)
    assert.doesNotMatch(prompt, /Do not slim, widen or beautify/)
    assert.doesNotMatch(prompt, /Copy the exact face shape/)
    assert.doesNotMatch(prompt, /100%/)
  }
})

test('the target leads for flux and gpt image and closes the list otherwise', () => {
  const leading = buildEditPrompt('', CROP_REFS, editProfile('fal:fal-ai/flux-2-pro'), {
    modelId: 'fal:fal-ai/flux-2-pro',
  })
  assert.match(leading, /^@image1 is the target photo\./)
  assert.match(leading, /@image2 \(front face\)/)

  const trailing = buildEditPrompt('', CROP_REFS, editProfile('fal:custom/endpoint'), {
    modelId: 'fal:custom/endpoint',
  })
  assert.match(trailing, /image 4 is the target photo\./)
  assert.match(trailing, /image 1 \(front face\)/)

  const qwen = buildEditPrompt('', CROP_REFS, editProfile('fal:fal-ai/qwen-image-edit-2509'), {
    modelId: 'fal:fal-ai/qwen-image-edit-2509',
  })
  assert.match(qwen, /image 1 is the target photo\./)
  assert.match(qwen, /image 2 \(front face\)/)
})

test('Qwen stays under 800 characters and the wider families keep more anchors', () => {
  const qwen = buildEditPrompt('', CROP_REFS, editProfile('fal:fal-ai/qwen-image-edit-2509'), {
    modelId: 'fal:fal-ai/qwen-image-edit-2509',
  })
  const nano = buildEditPrompt('', CROP_REFS, editProfile('fal:fal-ai/nano-banana-pro'), {
    modelId: 'fal:fal-ai/nano-banana-pro',
  })
  assert.ok(qwen.length < 800, `${qwen.length}`)
  assert.ok(nano.length > qwen.length)
  // Qwen names two references and drops the compact body detail; Gemini names three and restates.
  assert.doesNotMatch(qwen, /three-quarter face/)
  assert.match(nano, /three-quarter face/)
  assert.match(nano, /The result keeps image 1's pose and the avatar's body proportions\./)
  assert.doesNotMatch(qwen, /The result keeps/)
  assert.match(qwen, /Take the body proportions from/)
  assert.match(nano, /shoulder width, chest, waist, hips and thigh width/)

  // The instruction is never cut: budget pressure trims the clause back to its shorter form instead.
  const dense = buildEditPrompt('x'.repeat(300), CROP_REFS, editProfile('fal:fal-ai/qwen-image-edit-2509'), {
    modelId: 'fal:fal-ai/qwen-image-edit-2509',
  })
  assert.ok(dense.endsWith(`Additional instructions:\n${'x'.repeat(300)}`), `${dense.length}`)
  assert.ok(dense.length <= 800, `${dense.length}`)
  const clause = (prompt: string) => prompt.match(/same avatar: (.*)\.\n/)?.[1] ?? ''
  assert.ok(clause(dense).length < clause(qwen).length, clause(dense))
})

test('every family tells the model to swap the face and none asks it to keep the hair', () => {
  const swap =
    /Replace the person in @?image ?\d+ with the avatar: copy the face, facial features, skin tone and hair from /
  for (const modelId of ['sunra:google/gemini-nano-banana-2.1', 'fal:fal-ai/qwen-image-edit-2509']) {
    const prompt = buildEditPrompt('', CROP_REFS, editProfile(modelId), { modelId })
    assert.match(prompt, swap, modelId)
    assert.doesNotMatch(prompt, /hair unless changed/, modelId)
  }
})

test('an avatar reference without a profile keeps the legacy prompt', () => {
  const prompt = buildEditPrompt('', [{ id: 'sheet', assetIds: ['sheet'], avatar: true }])
  assert.match(prompt, /Copy the exact face shape/)
})

const EDIT_FAMILIES = [
  'fal:fal-ai/flux-2-pro',
  'fal:fal-ai/flux-2-max',
  'fal:fal-ai/flux-pro/kontext/multi',
  'fal:fal-ai/nano-banana-pro',
  'fal:google/nano-banana-2.1',
  'fal:fal-ai/bytedance/seedream/v4/edit',
  'fal:openai/gpt-image-2',
  'fal:fal-ai/qwen-image-edit-2509',
  'sunra:bytedance/seedream-5.0-flash',
  'sunra:google/gemini-3-pro-image',
  'sunra:black-forest-labs/flux-3-image',
  'sunra:xai/grok-imagine-image',
  'sunra:openai/gpt-image-2',
]

function escapeToken(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

for (const modelId of EDIT_FAMILIES) {
  test(`the profiled target leads for ${modelId}`, () => {
    const profile = editProfile(modelId)
    assert.equal(profile.target, 'first', modelId)
    const prompt = buildEditPrompt('', CROP_REFS, profile, { modelId })
    const first = escapeToken(editToken(profile, 1))
    const second = escapeToken(editToken(profile, 2))
    assert.match(prompt, new RegExp(`^${first} is the target photo\\.`), modelId)
    assert.match(prompt, new RegExp(`${second} \\(front face\\)`), modelId)
  })
}

test('the default profile still closes the list with the target', () => {
  const profile = DEFAULT_EDIT_PROFILE
  const prompt = buildEditPrompt('', CROP_REFS, profile, { modelId: 'fal:custom/endpoint' })
  assert.match(prompt, /^image 4 is the target photo\./)
  assert.match(prompt, /image 1 \(front face\)/)
})

const K4_PROFILE = {
  ...DEFAULT_AVATAR_PROFILE,
  identity: { gender: 'female' as const, age: 24, ethnicity: 'East Asian', heightCm: 165, weightKg: 49 },
  body: { build: 'slim', legs: 'long', bust: 'slight' },
}

const BODY_CROPS = [
  { role: 'face-front' as const, assetId: 'face-front', width: 1200, height: 1200 },
  { role: 'face-three-quarter' as const, assetId: 'face-3q', width: 1200, height: 1200 },
  { role: 'body-front' as const, assetId: 'body', width: 1200, height: 1600 },
]

const BODY_FAMILIES = [
  'fal:google/nano-banana-2.1',
  'sunra:google/gemini-nano-banana-2.1',
  'sunra:qwen/qwen-image-2.1',
  'sunra:bytedance/seedream-5.5',
  'sunra:black-forest-labs/flux-3-image',
  'gpt-image-2',
]

for (const modelId of BODY_FAMILIES) {
  test(`the avatar body replaces the target body for ${modelId}`, () => {
    const profile = editProfile(modelId)
    const references = editReferencePlan(
      [{ id: 'avatar', avatar: true, profile: K4_PROFILE, crops: BODY_CROPS }],
      modelId,
    )
    const ordered = orderEditAssets(references, 'target', profile)
    const bodyIndex = ordered.indexOf('body') + 1
    const body = escapeToken(editToken(profile, bodyIndex))
    const target = escapeToken(editToken(profile, 1))
    const prompt = buildEditPrompt('', references, profile, { modelId })

    // The full-body crop rides second, behind the target, so the body outranks the second face.
    assert.equal(bodyIndex, 3, modelId)
    if (ordered.includes('face-3q')) assert.ok(ordered.indexOf('body') < ordered.indexOf('face-3q'), modelId)
    assert.match(
      prompt,
      new RegExp(
        `Replace ${target}'s body with the avatar's: 165 cm, 49 kg, slim build, slight bust, long legs\\.`,
      ),
      modelId,
    )
    assert.match(
      prompt,
      new RegExp(
        EDIT_PROMPT_PROFILES[avatarModelFamily(modelId)].detail === 'compact'
          ? `Take the body proportions from ${body} \\(full body\\)`
          : `Take shoulder width, chest, waist, hips and thigh width from ${body} \\(full body\\)`,
      ),
      modelId,
    )
    assert.doesNotMatch(prompt, /Do not slim, widen or beautify/, modelId)
    if (avatarModelFamily(modelId) === 'qwen') {
      assert.ok(prompt.length <= 800, `${modelId} ${prompt.length}`)
      // A 300-character instruction still fits once the clause is down to its subject.
      const typed = 'x'.repeat(300)
      const busy = buildEditPrompt(typed, references, profile, { modelId })
      assert.ok(busy.endsWith(typed), `${modelId} ${busy.length}`)
      assert.ok(busy.length <= 800, `${modelId} ${busy.length}`)
    }
  })
}

test('board references name their tiles and the body board supplies the curves sentence', () => {
  const boards = [
    { role: 'face' as const, assetId: 'face-board', width: 4096, height: 4096 },
    { role: 'body' as const, assetId: 'body-board', width: 4096, height: 4096 },
    { role: 'details' as const, assetId: 'details-board', width: 4096, height: 1200 },
  ]
  const avatar = editReferencePlan(
    [{ id: 'face-board', assetIds: [], avatar: true, profile: DEFAULT_AVATAR_PROFILE, boards }],
    'fal:fal-ai/nano-banana-pro',
  )
  const prompt = buildEditPrompt(
    '',
    [{ id: 'target', assetIds: ['target'], avatar: false, role: 'target photo' }, ...avatar],
    editProfile('fal:fal-ai/nano-banana-pro'),
    { modelId: 'fal:fal-ai/nano-banana-pro' },
  )

  assert.match(
    prompt,
    /\(face board: top-left front, top-right three-quarter, bottom-left side profile, bottom-right expressions\)/,
  )
  assert.match(
    prompt,
    /\(body board: top-left front, top-right side profile, bottom-left back, bottom-right three-quarter\)/,
  )
  assert.match(
    prompt,
    /\(details board: top row hands, skin, hair; bottom row facial features, body details\)/,
  )
  assert.match(prompt, /bust, waist, hip, buttock and leg curves/)
  assert.match(prompt, /body board\)\)?/)
})

test('qwen names the face and body boards and drops the details board', () => {
  const boards = [
    { role: 'face' as const, assetId: 'face-board', width: 4096, height: 4096 },
    { role: 'body' as const, assetId: 'body-board', width: 4096, height: 4096 },
    { role: 'details' as const, assetId: 'details-board', width: 4096, height: 1200 },
  ]
  const avatar = editReferencePlan(
    [{ id: 'face-board', assetIds: [], avatar: true, profile: DEFAULT_AVATAR_PROFILE, boards }],
    'fal:fal-ai/qwen-image-edit-2509',
  )
  const prompt = buildEditPrompt(
    '',
    [{ id: 'target', assetIds: ['target'], avatar: false, role: 'target photo' }, ...avatar],
    editProfile('fal:fal-ai/qwen-image-edit-2509'),
    { modelId: 'fal:fal-ai/qwen-image-edit-2509' },
  )

  assert.match(prompt, /face board/)
  assert.match(prompt, /body board/)
  assert.doesNotMatch(prompt, /details board/)
  assert.ok(prompt.length <= 800, `qwen prompt is ${prompt.length} chars`)
})
