import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_EDIT_PROFILE, editProfile, editToken } from '@sunnygen/core'
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

import { DEFAULT_AVATAR_PROFILE } from '@sunnygen/core'

const CROP_REFS = [
  { id: 'face-front', avatar: true, profile: DEFAULT_AVATAR_PROFILE, role: 'front face' },
  { id: 'face-3q', avatar: true, profile: DEFAULT_AVATAR_PROFILE, role: 'three-quarter face' },
  { id: 'body', avatar: true, profile: DEFAULT_AVATAR_PROFILE, role: 'full body' },
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
    assert.match(prompt, /\(front face\)/)
    assert.match(prompt, /\(three-quarter face\)/)
    assert.match(prompt, /\(full body\)/)
    assert.match(prompt, /soft oval face/)
    assert.match(prompt, /slender arched brows/)
    assert.match(prompt, /pose, clothing, hair unless changed, background, lighting and camera/)
    assert.match(prompt, /Do not slim, widen or beautify the body\./)
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
  assert.doesNotMatch(qwen, /black high heels/)
  assert.match(nano, /black high heels/)

  const dense = buildEditPrompt('x'.repeat(400), CROP_REFS, editProfile('fal:fal-ai/qwen-image-edit-2509'), {
    modelId: 'fal:fal-ai/qwen-image-edit-2509',
  })
  assert.ok(dense.length < 800, `${dense.length}`)
  assert.match(dense, /Additional instructions:\nxxxx/)
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
