import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AVATAR_PROFILE } from '@sunnygen/core'
import {
  avatarAssetSlots,
  avatarReferenceAssets,
  editReferencePlan,
  flattenReferenceAssets,
  referenceIdentity,
  withIdentityClause,
} from './avatar-references'

const CROPS = [
  { role: 'face-front' as const, assetId: 'face-front', width: 1200, height: 1200 },
  { role: 'face-three-quarter' as const, assetId: 'face-3q', width: 1200, height: 1200 },
  { role: 'body-front' as const, assetId: 'body', width: 1200, height: 1600 },
]

const PROFILED = {
  id: 'sheet',
  assetIds: ['sheet', 'panel'],
  sheetAssetId: 'sheet',
  avatar: true,
  profile: DEFAULT_AVATAR_PROFILE,
  crops: CROPS,
}

test('crops replace the collage sheets and are labelled by role', () => {
  assert.deepEqual(avatarAssetSlots(PROFILED, 'fal:fal-ai/nano-banana-pro'), [
    { id: 'face-front', role: 'front face' },
    { id: 'body', role: 'full body' },
    { id: 'face-3q', role: 'three-quarter face' },
  ])
  assert.deepEqual(avatarReferenceAssets(PROFILED, 'fal:fal-ai/qwen-image-edit-2509'), ['face-front', 'body'])
})

test('avatars without crops keep the sheet and the panel, each labelled for what it is', () => {
  assert.deepEqual(avatarAssetSlots({ ...PROFILED, crops: [] }, 'fal:fal-ai/qwen-image-edit-2509'), [
    { id: 'sheet', role: 'reference sheet' },
    { id: 'panel', role: '4x4 panel' },
  ])
  assert.deepEqual(avatarAssetSlots({ ...PROFILED, crops: undefined }, 'fal:fal-ai/flux-2-pro'), [
    { id: 'sheet', role: 'reference sheet' },
    { id: 'panel', role: '4x4 panel' },
  ])
})

test('edit plans flatten each avatar into one profiled reference per crop', () => {
  const plan = editReferencePlan(
    [PROFILED, { id: 'pose', assetIds: ['pose'], avatar: false }],
    'fal:fal-ai/nano-banana-pro',
  )
  assert.deepEqual(
    plan.map((reference) => [reference.id, reference.avatar, reference.role]),
    [
      ['face-front', true, 'front face'],
      ['body', true, 'full body'],
      ['face-3q', true, 'three-quarter face'],
      ['pose', false, undefined],
    ],
  )
  for (const reference of plan.slice(0, 3)) {
    assert.equal(reference.profile?.identity.age, DEFAULT_AVATAR_PROFILE.identity.age)
    assert.deepEqual(reference.assetIds, [reference.id])
  }
  assert.equal(plan[3]?.profile, undefined)
})

test('generation assets flatten avatars and plain references together', () => {
  assert.deepEqual(
    flattenReferenceAssets(
      [
        { ...PROFILED, crops: [] },
        { id: 'upload', avatar: false },
      ],
      'fal:fal-ai/nano-banana-pro',
    ),
    ['sheet', 'panel', 'upload'],
  )
  assert.deepEqual(flattenReferenceAssets([{ id: 'upload', avatar: false }], 'fal:fal-ai/nano-banana-pro'), [
    'upload',
  ])
})

test('the first profiled avatar supplies the identity clause', () => {
  const identity = referenceIdentity([{ id: 'upload' }, PROFILED])
  assert.equal(identity?.face.faceShape, 'soft oval')
  assert.equal(referenceIdentity([{ id: 'upload' }]), null)
})

test('identity clauses respect the model family and never touch a bare prompt', () => {
  const qwen = withIdentityClause(
    'A coffee shop portrait.',
    DEFAULT_AVATAR_PROFILE,
    'fal:fal-ai/qwen-image-edit-2509',
  )
  const nano = withIdentityClause(
    'A coffee shop portrait.',
    DEFAULT_AVATAR_PROFILE,
    'fal:fal-ai/nano-banana-pro',
  )
  assert.match(qwen, /^A coffee shop portrait\.\n\nAvatar identity: 26yo East Asian woman/)
  assert.ok(nano.length > qwen.length)
  assert.equal(
    withIdentityClause('A coffee shop portrait.', null, 'fal:fal-ai/nano-banana-pro'),
    'A coffee shop portrait.',
  )
})

const BOARDS = [
  { role: 'details' as const, assetId: 'details-board', width: 4096, height: 1100 },
  { role: 'body' as const, assetId: 'body-board', width: 4096, height: 4096 },
  { role: 'face' as const, assetId: 'face-board', width: 4096, height: 4096 },
]

test('boards replace crops and reach the model identity first, each naming its tiles', () => {
  const withBoards = { ...PROFILED, boards: BOARDS }
  assert.deepEqual(avatarAssetSlots(withBoards, 'fal:fal-ai/nano-banana-pro'), [
    { id: 'face-board', role: 'face board: front, three-quarter, side profile, expressions' },
    { id: 'body-board', role: 'body board: front, side profile, back, three-quarter' },
    { id: 'details-board', role: 'details board: hands, skin, hair, facial features, body details' },
  ])
  // qwen names two avatar references, so it gets the face board and the body board only.
  assert.deepEqual(avatarAssetSlots(withBoards, 'fal:fal-ai/qwen-image-edit-2509'), [
    { id: 'face-board', role: 'face board: front, three-quarter, side profile, expressions' },
    { id: 'body-board', role: 'body board: front, side profile, back, three-quarter' },
  ])
  assert.deepEqual(flattenReferenceAssets([withBoards], 'fal:fal-ai/flux-2-pro'), [
    'face-board',
    'body-board',
    'details-board',
  ])
})

test('stored crops still drive avatars that have no boards', () => {
  assert.deepEqual(avatarAssetSlots({ ...PROFILED, boards: [] }, 'fal:fal-ai/nano-banana-pro'), [
    { id: 'face-front', role: 'front face' },
    { id: 'body', role: 'full body' },
    { id: 'face-3q', role: 'three-quarter face' },
  ])
})
