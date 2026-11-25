import assert from 'node:assert/strict'
import { test } from 'node:test'
import { referenceAvatar } from './reference-avatar'

test('a two-panel avatar carries its three whole images, face panel and body panel first', () => {
  assert.deepEqual(
    referenceAvatar({
      id: 'studio-item-id',
      name: 'Mina',
      assetId: 'body-panel-asset-id',
      data: {
        characterSheetAssetId: 'sheet-asset-id',
        facePanelAssetId: 'face-panel-asset-id',
      },
    }),
    {
      id: 'sheet-asset-id',
      avatarId: 'studio-item-id',
      name: 'Mina',
      assetIds: ['face-panel-asset-id', 'body-panel-asset-id', 'sheet-asset-id'],
      sheetAssetId: 'sheet-asset-id',
      facePanelAssetId: 'face-panel-asset-id',
      bodyPanelAssetId: 'body-panel-asset-id',
      lora: null,
      profile: null,
    },
  )
})

test('a legacy avatar carries the clean sheet and its 4x4 panel whole', () => {
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
      assetIds: ['panel-asset-id', 'sheet-asset-id'],
      sheetAssetId: 'sheet-asset-id',
      facePanelAssetId: null,
      bodyPanelAssetId: 'panel-asset-id',
      lora: null,
      profile: null,
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
      sheetAssetId: 'sheet-asset-id',
      facePanelAssetId: null,
      bodyPanelAssetId: 'sheet-asset-id',
      lora: null,
      profile: null,
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
      sheetAssetId: null,
      facePanelAssetId: null,
      bodyPanelAssetId: 'panel-asset-id',
      lora: null,
      profile: null,
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

test('a stored profile travels with the reference', () => {
  const reference = referenceAvatar({
    id: 'studio-item-id',
    name: 'Mina',
    assetId: 'panel-asset-id',
    data: {
      characterSheetAssetId: 'sheet-asset-id',
      avatarProfile: { identity: { age: 29, ethnicity: 'Black' } },
    },
  })
  assert.equal(reference?.profile?.identity.age, 29)
  assert.equal(reference?.profile?.identity.ethnicity, 'Black')
})

test('avatars without assets yield no reference', () => {
  assert.equal(referenceAvatar({ id: 'studio-item-id', name: 'Mina', assetId: null, data: {} }), null)
})
