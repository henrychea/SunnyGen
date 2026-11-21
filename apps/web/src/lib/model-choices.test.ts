import assert from 'node:assert/strict'
import test from 'node:test'
import { LORA_MODEL_ID, getModel } from '@sunnygen/core'
import type { ModelOption } from '../components/model-combobox'
import { sortModelChoices } from './model-choices'

function option(
  overrides: Partial<ModelOption> & Pick<ModelOption, 'key' | 'label' | 'company'>,
): ModelOption {
  return {
    provider: 'sunra',
    providerLabel: 'Sunra',
    kind: 'image',
    price: null,
    sourceId: overrides.key,
    modelId: overrides.key,
    supported: true,
    ...overrides,
  } satisfies ModelOption
}

test('lists models from supported companies before catalog-only ones', () => {
  const choices = [option({ key: 'supported', label: 'Zulu', company: 'Zeta' })]
  const catalogOnly = [
    option({
      key: 'catalog',
      label: 'Alpha',
      company: 'Alpha',
      supported: false,
      modelId: 'catalog',
    }),
  ]

  assert.deepEqual(
    sortModelChoices(choices, catalogOnly).map((entry) => entry.key),
    ['supported', 'catalog'],
  )
})

test('prioritises LoRA models within a company', () => {
  const lora = getModel(LORA_MODEL_ID)
  assert.ok(lora)
  const plain = option({ key: 'plain', label: 'Alpha', company: 'FLUX' })
  const loraOption = option({ key: 'lora', label: 'Zulu', company: 'FLUX', definition: lora })

  assert.deepEqual(
    sortModelChoices([plain, loraOption], []).map((entry) => entry.key),
    ['lora', 'plain'],
  )
})

test('falls back to company then label ordering', () => {
  const options = [
    option({ key: 'beta', label: 'Beta', company: 'Beta Co' }),
    option({ key: 'alpha', label: 'Alpha', company: 'Beta Co' }),
    option({ key: 'zulu', label: 'Zulu', company: 'Alpha Co' }),
  ]

  assert.deepEqual(
    sortModelChoices(options, []).map((entry) => entry.key),
    ['zulu', 'alpha', 'beta'],
  )
})

test('leaves the input lists in place', () => {
  const choices = [option({ key: 'zulu', label: 'Zulu', company: 'Co' })]
  const catalogOnly = [
    option({ key: 'alpha', label: 'Alpha', company: 'Other', supported: false, modelId: 'alpha' }),
  ]

  sortModelChoices(choices, catalogOnly)

  assert.deepEqual(
    choices.map((entry) => entry.key),
    ['zulu'],
  )
  assert.deepEqual(
    catalogOnly.map((entry) => entry.key),
    ['alpha'],
  )
})
