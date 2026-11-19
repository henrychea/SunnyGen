import assert from 'node:assert/strict'
import test from 'node:test'
import {
  LORA_STEP_PRESETS,
  LORA_TRAINER_MODEL,
  getModel,
  isLoraStepCount,
  loraTrainingCost,
  loraTriggerWord,
  parseAvatarLora,
  withLoraTriggerWord,
} from './index'

test('trains at two dollars per thousand steps', () => {
  assert.equal(loraTrainingCost(500), 1)
  assert.equal(loraTrainingCost(1000), 2)
  assert.equal(loraTrainingCost(2000), 4)
  assert.equal(loraTrainingCost(750), 1.5)
  assert.equal(loraTrainingCost(Number.NaN), 0)
  assert.equal(loraTrainingCost(-10), 0)
  for (const preset of LORA_STEP_PRESETS) {
    assert.equal(loraTrainingCost(preset.steps), (preset.steps / 1000) * 2)
  }
})

test('step presets are the accepted values', () => {
  assert.deepEqual(
    LORA_STEP_PRESETS.map((preset) => preset.steps),
    [500, 1000, 2000],
  )
  assert.equal(isLoraStepCount(1000), true)
  assert.equal(isLoraStepCount(1234), false)
})

test('trigger words slug the avatar name', () => {
  assert.equal(loraTriggerWord('Aria Bloom'), 'aria_bloom')
  assert.equal(loraTriggerWord('  Zoë   Chen '), 'zoe_chen')
  assert.equal(loraTriggerWord('!!!'), 'subject')
  assert.equal(loraTriggerWord('Ava — character sheet'), 'ava')
})

test('the trigger word is only prefixed once', () => {
  assert.equal(withLoraTriggerWord('a portrait', 'aria'), 'aria a portrait')
  assert.equal(withLoraTriggerWord('Aria, a portrait', 'aria'), 'Aria, a portrait')
  assert.equal(withLoraTriggerWord('a portrait', '  '), 'a portrait')
})

test('the trainer resolves as a model, the avatar LoRA payload round-trips', () => {
  assert.equal(getModel(LORA_TRAINER_MODEL.id)?.id, LORA_TRAINER_MODEL.id)
  assert.equal(getModel('flux-lora')?.supportsLora, true)
  const parsed = parseAvatarLora({
    assetId: 'a1',
    remoteUrl: 'https://cdn.test/lora.safetensors',
    triggerWord: 'aria',
    baseModel: 'flux-lora',
    scale: 1,
    generationId: 'g1',
    trainedAt: 1,
    version: 2,
  })
  assert.equal(parsed?.version, 2)
  assert.equal(parseAvatarLora({ assetId: 'a1' }), null)
  assert.equal(parseAvatarLora(null), null)
})
