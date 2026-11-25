import assert from 'node:assert/strict'
import test from 'node:test'
import { AVATAR_CROP_ROLES, avatarCropPlan, avatarReferenceLimit, panelSizeError } from './avatar-references'

test('Qwen takes two references, the other families take four', () => {
  assert.deepEqual(avatarCropPlan('qwen'), ['face-front', 'body-front'])
  assert.equal(avatarReferenceLimit('qwen'), 2)
  assert.equal(avatarReferenceLimit('seedream'), 4)
  for (const crop of avatarCropPlan('nano-banana')) {
    assert.ok(AVATAR_CROP_ROLES.includes(crop))
  }
})

test('a panel must be 4K before it can be used', () => {
  assert.equal(panelSizeError(4096, 4096), null)
  assert.equal(panelSizeError(5000, 6000), null)
  assert.equal(
    panelSizeError(1254, 1254),
    'The panel must be at least 4096 x 4096 px (this one is 1254 x 1254).',
  )
  assert.match(String(panelSizeError(4096, 3000)), /4096 x 4096 px \(this one is 4096 x 3000\)/)
  assert.match(String(panelSizeError(null, null)), /must be at least 4096 x 4096 px/)
  assert.match(String(panelSizeError(0, 4096)), /must be at least 4096 x 4096 px/)
})
