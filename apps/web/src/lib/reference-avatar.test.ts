import assert from 'node:assert/strict'
import { test } from 'node:test'
import { referenceAvatar } from './reference-avatar'

test('avatar references send both the clean sheet and the 4x4 panel', () => {
  assert.deepEqual(
    referenceAvatar({
      id: 'studio-item-id',
      name: 'Mina',
      assetId: 'panel-asset-id',
      data: { characterSheetAssetId: 'sheet-asset-id' },
    }),
    {
      id: 'sheet-asset-id',
      avatarId: 'studio-item-id',
      name: 'Mina',
      assetIds: ['sheet-asset-id', 'panel-asset-id'],
      lora: null,
    },
  )
})

test('avatar references dedupe the sheet and panel when they are the same asset', () => {
  assert.deepEqual(
    referenceAvatar({
      id: 'studio-item-id',
      name: 'Mina',
      assetId: 'sheet-asset-id',
      data: { characterSheetAssetId: 'sheet-asset-id' },
    }),
    {
      id: 'sheet-asset-id',
      avatarId: 'studio-item-id',
      name: 'Mina',
      assetIds: ['sheet-asset-id'],
      lora: null,
    },
  )
})

test('avatar references fall back to the uploaded asset id', () => {
  assert.deepEqual(
    referenceAvatar({
      id: 'studio-item-id',
      name: 'Mina',
      assetId: 'panel-asset-id',
      data: {},
    }),
    {
      id: 'panel-asset-id',
      avatarId: 'studio-item-id',
      name: 'Mina',
      assetIds: ['panel-asset-id'],
      lora: null,
    },
  )
})

test('a trained avatar carries its LoRA', () => {
  const reference = referenceAvatar({
    id: 'studio-item-id',
    name: 'Mina',
    assetId: 'panel-asset-id',
    data: {
      lora: {
        assetId: 'lora-asset-id',
        remoteUrl: 'https://cdn.test/lora.safetensors',
        triggerWord: 'mina',
        baseModel: 'flux-lora',
        scale: 1,
        generationId: 'gen-1',
        trainedAt: 10,
        version: 2,
      },
    },
  })
  assert.equal(reference?.lora?.triggerWord, 'mina')
  assert.equal(reference?.lora?.version, 2)
  assert.equal(reference?.avatarId, 'studio-item-id')
})

test('avatars without assets yield no reference', () => {
  assert.equal(referenceAvatar({ id: 'studio-item-id', name: 'Mina', assetId: null, data: {} }), null)
})
