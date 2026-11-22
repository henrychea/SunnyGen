import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AVATAR_CROP_ROLES,
  avatarCropPlan,
  avatarReferenceLimit,
  parseAvatarCrops,
  plannedAvatarAssets,
  qualifyAvatarCrops,
} from './avatar-references'

const CROPS = [
  { role: 'face-front' as const, assetId: 'face-front', width: 1200, height: 1200 },
  { role: 'face-three-quarter' as const, assetId: 'face-3q', width: 1200, height: 1200 },
  { role: 'body-front' as const, assetId: 'body', width: 1200, height: 1600 },
]

test('Qwen takes the frontal face and the full body, other families take every crop', () => {
  assert.deepEqual(avatarCropPlan('qwen'), ['face-front', 'body-front'])
  // The body crop leads the second face so the body reference is the second image of an edit.
  assert.deepEqual(avatarCropPlan('nano-banana'), ['face-front', 'body-front', 'face-three-quarter'])
  assert.equal(avatarReferenceLimit('qwen'), 2)
  assert.equal(avatarReferenceLimit('seedream'), 4)
  for (const crop of avatarCropPlan('nano-banana')) {
    assert.ok(AVATAR_CROP_ROLES.includes(crop))
  }
})

test('planned assets follow the plan, not the stored order', () => {
  assert.deepEqual(plannedAvatarAssets(CROPS, 'nano-banana'), ['face-front', 'body', 'face-3q'])
  assert.deepEqual(plannedAvatarAssets([...CROPS].reverse(), 'qwen'), ['face-front', 'body'])
  assert.deepEqual(plannedAvatarAssets([CROPS[0]!], 'nano-banana'), ['face-front'])
})

test('crops under 1024px are dropped in favour of the sheet', () => {
  const small = CROPS.map((crop) => ({ ...crop, width: 400, height: 400 }))
  assert.deepEqual(qualifyAvatarCrops(CROPS), CROPS)
  assert.deepEqual(qualifyAvatarCrops(small), [])
  assert.deepEqual(
    qualifyAvatarCrops([CROPS[0]!, ...small.slice(1)]).map((crop) => crop.role),
    ['face-front'],
  )
})

test('stored crops parse defensively', () => {
  assert.equal(parseAvatarCrops(undefined), undefined)
  assert.deepEqual(parseAvatarCrops(CROPS), CROPS)
  assert.deepEqual(parseAvatarCrops([{ role: 'unknown', assetId: 'x' }, { role: 'face-front' }]), [])
})
