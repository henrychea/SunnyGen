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

const FACE_PANEL =
  'face panel: top-left front, top-right three-quarter, bottom-left side profile, bottom-right hands'
const BODY_PANEL =
  'body panel: top-left front, top-right side profile, bottom-left back, bottom-right three-quarter'
const SHEET =
  'character reference sheet: expressions, hair, hands, skin texture, facial features and body details'

/** A two-panel avatar: face panel, body panel, sheet, all stored whole. */
const THREE_IMAGES = {
  id: 'sheet',
  assetIds: ['face-panel', 'body-panel', 'sheet'],
  sheetAssetId: 'sheet',
  facePanelAssetId: 'face-panel',
  bodyPanelAssetId: 'body-panel',
  avatar: true,
  profile: DEFAULT_AVATAR_PROFILE,
}

test('an avatar sends its three whole images, each named for what it holds', () => {
  assert.deepEqual(avatarAssetSlots(THREE_IMAGES, 'fal:fal-ai/nano-banana-pro'), [
    { id: 'face-panel', role: FACE_PANEL },
    { id: 'body-panel', role: BODY_PANEL },
    { id: 'sheet', role: SHEET },
  ])
})

test('avatars without a face panel keep the sheet and the old panel, each labelled for what it is', () => {
  assert.deepEqual(
    avatarAssetSlots(
      { id: 'sheet', assetIds: ['sheet', 'panel'], sheetAssetId: 'sheet', avatar: true },
      'fal:fal-ai/nano-banana-pro',
    ),
    [
      { id: 'sheet', role: 'reference sheet' },
      { id: 'panel', role: '4x4 panel' },
    ],
  )
  assert.deepEqual(
    avatarAssetSlots({ id: 'panel', assetIds: ['panel'], avatar: true }, 'fal:fal-ai/flux-2-pro'),
    [{ id: 'panel', role: '4x4 panel' }],
  )
})

test('qwen names two avatar images, so it takes the two panels', () => {
  assert.deepEqual(avatarReferenceAssets(THREE_IMAGES, 'fal:fal-ai/qwen-image-edit-2509'), [
    'face-panel',
    'body-panel',
  ])
})

test('edit plans flatten each avatar into one profiled reference per whole image', () => {
  const plan = editReferencePlan(
    [THREE_IMAGES, { id: 'pose', assetIds: ['pose'], avatar: false }],
    'fal:fal-ai/nano-banana-pro',
  )
  assert.deepEqual(
    plan.map((reference) => [reference.id, reference.avatar, reference.role]),
    [
      ['face-panel', true, FACE_PANEL],
      ['body-panel', true, BODY_PANEL],
      ['sheet', true, SHEET],
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
        { id: 'sheet', assetIds: ['sheet', 'panel'], sheetAssetId: 'sheet', avatar: true },
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
  const identity = referenceIdentity([{ id: 'upload' }, THREE_IMAGES])
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
