import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildEditPrompt, orderEditAssets } from './edit-prompt'

test('edit assets place identity first and the target second without avatars', () => {
  assert.deepEqual(orderEditAssets([{ id: 'identity' }, { id: 'proportions' }], 'target'), [
    'identity',
    'target',
    'proportions',
  ])
  assert.deepEqual(orderEditAssets([], 'target'), ['target'])
})

test('avatar assets send both sheets, then the target, then supporting references', () => {
  assert.deepEqual(
    orderEditAssets(
      [
        { id: 'sheet', assetIds: ['sheet', 'panel'], avatar: true },
        { id: 'pose', assetIds: ['pose'], avatar: false },
      ],
      'target',
    ),
    ['sheet', 'panel', 'target', 'pose'],
  )
})

test('edit prompt without references edits image 1 and appends user text', () => {
  const prompt = buildEditPrompt('Make the jacket red.', [])
  assert.match(prompt, /Edit the person in <<<image 1>>>/)
  assert.doesNotMatch(prompt, /image 2/)
  assert.match(prompt, /Additional instructions:\nMake the jacket red\./)
})

test('edit prompt with one reference uses it for identity', () => {
  const prompt = buildEditPrompt('', [{ id: 'identity' }])
  assert.match(prompt, /<<<image 1>>> — the attached character reference sheet/)
  assert.match(prompt, /Replace the person in <<<image 2>>>/)
  assert.doesNotMatch(prompt, /<<<image 3>>>/)
})

test('edit prompt with two references adds proportions rules', () => {
  const prompt = buildEditPrompt('Keep the smile.', [{ id: 'identity' }, { id: 'proportions' }])
  assert.match(prompt, /<<<image 3>>> — the full-body proportions photo/)
  assert.match(prompt, /image 3 only overrides body proportions/)
  assert.match(prompt, /Additional instructions:\nKeep the smile\./)
})

test('extra references stay subordinate to the first three images', () => {
  const prompt = buildEditPrompt('', [{ id: 'identity' }, { id: 'proportions' }, { id: 'extra' }])
  assert.match(prompt, /additional attached images are supporting references only/)
})

test('avatar prompt uses both the clean sheet and the 4x4 panel', () => {
  const prompt = buildEditPrompt('', [
    { id: 'sheet', assetIds: ['sheet', 'panel'], avatar: true },
  ])
  assert.match(prompt, /<<<image 1>>> — the attached character reference sheet/)
  assert.match(prompt, /<<<image 2>>> — the attached 4x4 character panel/)
  assert.match(prompt, /Replace the person in <<<image 3>>>/)
  assert.match(prompt, /match the avatar references 100%/)
  assert.match(prompt, /exact body proportions/)
  assert.doesNotMatch(prompt, /<<<image 4>>>/)
})

test('avatar references with another image treat it as supporting', () => {
  const prompt = buildEditPrompt('', [
    { id: 'sheet', assetIds: ['sheet', 'panel'], avatar: true },
    { id: 'pose' },
  ])
  assert.match(prompt, /<<<image 4>>> is a supporting reference only/)
})
