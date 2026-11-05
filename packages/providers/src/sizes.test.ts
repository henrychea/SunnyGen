import assert from 'node:assert/strict'
import test from 'node:test'
import { IMAGE_MODELS, VIDEO_MODELS } from '@sunnygen/core'
import { FAL_IMAGE_SPECS, SUNRA_IMAGE_SPECS, SUNRA_VIDEO_SPECS } from './models'
import { azureSize, gptImageSize } from './sizes'

test('gptImageSize keeps exact tiers and caps the long edge', () => {
  assert.deepEqual(gptImageSize('1:1', '1k'), { width: 1024, height: 1024 })
  assert.deepEqual(gptImageSize('16:9', '4k'), { width: 3840, height: 2160 })
  assert.deepEqual(gptImageSize('21:9', '2k'), { width: 3840, height: 1648 })
  assert.deepEqual(gptImageSize('1:1', '4k'), { width: 3072, height: 3072 })
  assert.equal(gptImageSize('auto', '1k'), null)
})

test('azureSize maps ratios for every tier', () => {
  assert.equal(azureSize('1:1', '1k'), '1024x1024')
  assert.equal(azureSize('16:9', '4k'), '3840x2160')
  assert.equal(azureSize('unknown', '2k'), '1024x1024')
})

test('every model that lists a provider has a wire spec', () => {
  for (const model of IMAGE_MODELS) {
    if (model.providers.includes('sunra')) {
      assert.ok(SUNRA_IMAGE_SPECS[model.id], `missing Sunra spec for ${model.id}`)
    }
    if (model.providers.includes('fal')) {
      assert.ok(FAL_IMAGE_SPECS[model.id], `missing fal spec for ${model.id}`)
    }
  }
  for (const model of VIDEO_MODELS) {
    if (model.providers.includes('sunra')) {
      assert.ok(SUNRA_VIDEO_SPECS[model.id], `missing Sunra video spec for ${model.id}`)
    }
  }
})
