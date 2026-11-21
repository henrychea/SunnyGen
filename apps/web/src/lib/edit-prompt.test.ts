import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_EDIT_PROFILE, editProfile } from '@sunnygen/core'
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
  assert.match(
    prompt,
    /Replace the person in <<<@image1>>> with the character shown in <<<@image2>>> and <<<@image3>>>/,
  )
  assert.match(prompt, /hairline from <<<@image2>>>/)
  assert.match(prompt, /Do not keep, blend or invent any identity or body proportions from <<<@image1>>>/)
  assert.match(prompt, /<<<@image4>>> is a supporting reference only; they must not override images/)
  assert.doesNotMatch(prompt, /<<<image \d+>>>/)
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
    const tokens = [...prompt.matchAll(/<<<([^>]+)>>>/g)].map((match) => match[1] as string)
    assert.ok(tokens.length > 0, family)
    const targetToken = profile.token.replace('%d', String(ordered.indexOf('target') + 1))
    const sheetToken = profile.token.replace('%d', String(ordered.indexOf('sheet') + 1))
    assert.ok(tokens.includes(targetToken), `${family} target ${targetToken}`)
    assert.ok(tokens.includes(sheetToken), `${family} sheet ${sheetToken}`)
  }
})

test('edit prompt without references edits the only image', () => {
  const prompt = buildEditPrompt('Make the jacket red.', [])
  assert.match(prompt, /Edit the person in <<<image 1>>>/)
  assert.doesNotMatch(prompt, /image 2/)
  assert.match(prompt, /Additional instructions:\nMake the jacket red\./)
})

test('one identity reference comes first only for the default profile', () => {
  const kept = buildEditPrompt('', [{ id: 'identity' }])
  assert.match(kept, /<<<image 1>>> — the attached character reference sheet/)
  assert.match(kept, /Replace the person in <<<image 2>>>/)

  const flipped = buildEditPrompt('', [{ id: 'identity' }], editProfile('sunra:google/gemini-3-pro-image'))
  assert.match(flipped, /<<<image 2>>> — the attached character reference sheet/)
  assert.match(flipped, /Replace the person in <<<image 1>>> with the character shown in <<<image 2>>>/)
})

test('body proportions reference stays on the third image', () => {
  const prompt = buildEditPrompt('Keep the smile.', [{ id: 'identity' }, { id: 'proportions' }])
  assert.match(prompt, /<<<image 3>>> — the full-body proportions photo/)
  assert.match(prompt, /<<<image 3>>> only overrides body proportions/)
  assert.match(prompt, /Additional instructions:\nKeep the smile\./)

  const flipped = buildEditPrompt(
    '',
    [{ id: 'identity' }, { id: 'proportions' }],
    editProfile('fal:openai/gpt-image-2'),
  )
  assert.match(flipped, /Replace the person in <<<image 1>>>/)
  assert.match(flipped, /Use <<<image 2>>> — the attached character reference sheet/)
  assert.match(flipped, /Use <<<image 3>>> — the full-body proportions photo/)
})

test('extra references stay subordinate to the images that define the character', () => {
  const prompt = buildEditPrompt('', [{ id: 'identity' }, { id: 'proportions' }, { id: 'extra' }])
  assert.match(prompt, /Images <<<image 4>>> onwards are supporting references only/)

  const avatar = buildEditPrompt('', [...AVATAR, { id: 'pose' }, { id: 'extra' }])
  assert.match(avatar, /<<<image 4>>>–<<<image 5>>> are supporting references only/)
  assert.match(avatar, /they must not override images <<<image 1>>>–<<<image 3>>>/)
})

test('three or more avatar sheets keep the panel as the body source', () => {
  const prompt = buildEditPrompt(
    '',
    [{ id: 'sheet', assetIds: ['sheet', 'panel', 'side'], avatar: true }],
    editProfile('fal:fal-ai/flux-2-pro'),
  )
  assert.match(prompt, /Additional avatar images <<<@image4>>> are supporting references only/)
  assert.match(prompt, /<<<@image2>>> and <<<@image3>>> remain the source of truth/)
})
