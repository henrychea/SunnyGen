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
    { id: 'sheet-asset-id', name: 'Mina', assetIds: ['sheet-asset-id', 'panel-asset-id'] },
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
    { id: 'sheet-asset-id', name: 'Mina', assetIds: ['sheet-asset-id'] },
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
    { id: 'panel-asset-id', name: 'Mina', assetIds: ['panel-asset-id'] },
  )
})

test('avatars without assets yield no reference', () => {
  assert.equal(referenceAvatar({ id: 'studio-item-id', name: 'Mina', assetId: null, data: {} }), null)
})
