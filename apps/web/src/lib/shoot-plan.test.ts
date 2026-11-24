import assert from 'node:assert/strict'
import test from 'node:test'
import { shootCombinations } from './shoot-plan'

const base = {
  avatarId: 'avatar-1',
  garmentIds: ['top-1', 'dress-1'],
  sceneIds: ['scene-1', 'scene-2'],
  poseIds: ['pose-1'],
  max: 8,
}

test('counts every avatar x garment x scene x pose combination', () => {
  const plan = shootCombinations({ ...base, poseIds: ['pose-1', 'pose-2'] })
  assert.equal(plan.total, 8)
  assert.equal(plan.cells.length, 8)
  assert.equal(plan.dropped, 0)
})

test('orders garments outermost and poses innermost', () => {
  const plan = shootCombinations({
    ...base,
    garmentIds: ['top-1', 'dress-1'],
    sceneIds: ['scene-1', 'scene-2'],
    poseIds: ['pose-1', 'pose-2'],
  })
  assert.deepEqual(
    plan.cells.map((cell) => `${cell.garmentId}/${cell.sceneId}/${cell.poseId}`),
    [
      'top-1/scene-1/pose-1',
      'top-1/scene-1/pose-2',
      'top-1/scene-2/pose-1',
      'top-1/scene-2/pose-2',
      'dress-1/scene-1/pose-1',
      'dress-1/scene-1/pose-2',
      'dress-1/scene-2/pose-1',
      'dress-1/scene-2/pose-2',
    ],
  )
})

test('caps at max and reports the dropped combinations', () => {
  const plan = shootCombinations({ ...base, poseIds: ['pose-1', 'pose-2'], max: 3 })
  assert.equal(plan.total, 8)
  assert.equal(plan.cells.length, 3)
  assert.equal(plan.dropped, 5)
  assert.deepEqual(
    plan.cells.map((cell) => cell.key),
    ['top-1|scene-1|pose-1', 'top-1|scene-1|pose-2', 'top-1|scene-2|pose-1'],
  )
})

test('treats a skipped scene or pose step as a single empty choice', () => {
  const plan = shootCombinations({ ...base, garmentIds: ['top-1'], sceneIds: [], poseIds: [], max: 8 })
  assert.equal(plan.total, 1)
  assert.deepEqual(
    plan.cells.map((cell) => [cell.sceneId, cell.poseId]),
    [[null, null]],
  )
})

test('needs an avatar and at least one garment', () => {
  assert.equal(shootCombinations({ ...base, avatarId: null }).total, 0)
  assert.equal(shootCombinations({ ...base, garmentIds: [] }).cells.length, 0)
})
