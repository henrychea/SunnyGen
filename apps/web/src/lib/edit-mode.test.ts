import assert from 'node:assert/strict'
import test from 'node:test'
import type { ImageModelDefinition } from '@sunnygen/core'
import { canEditImages, editModeSwitch, type EditCandidate } from './edit-mode'

function image(id: string, label: string, supportsImages: boolean, dynamic = false): ImageModelDefinition {
  return {
    id,
    label,
    kind: 'image',
    providerLabel: 'Test',
    providers: ['sunra'],
    ratios: ['1:1'],
    supportsImages,
    maxImages: supportsImages ? 4 : 0,
    supportsQuality: true,
    qualityOptions: ['1k'],
    defaultQuality: '1k',
    dynamic,
  }
}

function candidate(definition: ImageModelDefinition, selected?: string): EditCandidate {
  return { label: definition.label, modelId: selected ?? definition.id, definition }
}

test('edit mode treats only image models with the capability as editable', () => {
  assert.equal(canEditImages(image('edit', 'Edit Model', true)), true)
  assert.equal(canEditImages(image('plain', 'Plain Model', false)), false)
  assert.equal(canEditImages(undefined), false)
})

test('switches to the first edit-capable model when the current one cannot edit', () => {
  const current = candidate(image('sunra:midjourney/v8.2', 'Midjourney v8.2', false, true))
  const options = [
    candidate(image('sunra:midjourney/v8.2', 'Midjourney v8.2', false, true)),
    candidate(image('sunra:recraft/recraft-v4.1', 'Recraft V4.1', false, true)),
    candidate(image('gpt-image-2', 'GPT Image 2', true)),
    candidate(image('nano-banana-2', 'Nano Banana 2', true)),
  ]
  const result = editModeSwitch(current, options)
  assert.deepEqual(result, {
    modelId: 'gpt-image-2',
    message: "Midjourney v8.2 can't edit images. Switched to GPT Image 2.",
  })
})

test('keeps the current model when it already edits images', () => {
  const current = candidate(image('gpt-image-2', 'GPT Image 2', true))
  assert.equal(editModeSwitch(current, [candidate(image('nano-banana-2', 'Nano Banana 2', true))]), null)
})

test('stays put when no candidate can edit images', () => {
  const current = candidate(image('sunra:midjourney/v8.2', 'Midjourney v8.2', false, true))
  const options = [
    current,
    candidate(image('sunra:recraft/recraft-v4.1', 'Recraft V4.1', false, true)),
    candidate(image('sunra:ideogram/ideogram-vector-1', 'Ideogram Vector 1.0', false, true)),
  ]
  assert.equal(editModeSwitch(current, options), null)
})
