import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildStudioPrompt,
  normalizeAngles,
  orderStudioGarments,
  validateStudioLook,
  type StudioGarmentInput,
} from './studio'

const jacket: StudioGarmentInput = {
  id: 'g1',
  name: 'Jacket',
  slot: 'outerwear',
  sourceKind: 'flat-lay',
  hasCleanReference: true,
}
const top: StudioGarmentInput = {
  id: 'g2',
  name: 'Tee',
  slot: 'top',
  sourceKind: 'flat-lay',
  hasCleanReference: false,
}
const dress: StudioGarmentInput = {
  id: 'g3',
  name: 'Dress',
  slot: 'dress',
  sourceKind: 'flat-lay',
  hasCleanReference: true,
}

test('garments order by slot rank, then name', () => {
  const ordered = orderStudioGarments([jacket, top, dress])
  assert.deepEqual(
    ordered.map((item) => item.slot),
    ['dress', 'top', 'outerwear'],
  )
})

test('validation blocks on-model pieces without a clean reference', () => {
  const result = validateStudioLook([{ ...top, sourceKind: 'on-model', hasCleanReference: false }])
  assert.ok(result.blocking.includes('Tee needs prep before it can be used.'))
})

test('validation warns for unprepared flat lays, dress layering, and slot caps', () => {
  const result = validateStudioLook([
    dress,
    top,
    { ...jacket, slot: 'accessory' },
    { ...jacket, id: 'g4', name: 'Belt', slot: 'accessory' },
    { ...jacket, id: 'g5', name: 'Scarf', slot: 'accessory' },
  ])
  assert.ok(result.warnings.some((warning) => warning.includes('no prepared reference')))
  assert.ok(result.warnings.includes('A dress with a top or bottom may layer incorrectly.'))
  assert.ok(result.warnings.includes('Only 2 accessory pieces allowed.'))
})

test('prompt indices follow the reference list exactly', () => {
  const prompt = buildStudioPrompt({
    garments: [
      { ...dress, imageIndex: 2 },
      { ...top, hasCleanReference: true, imageIndex: 3 },
    ],
    hasPose: true,
    poseImageIndex: 4,
    hasSceneImage: true,
    sceneImageIndex: 5,
    angle: 'side',
    notes: 'Keep the sleeves rolled.',
  })
  assert.match(prompt, /<<<image 1>>>/)
  assert.match(prompt, /<<<image 2>>> — "Dress"/)
  assert.match(prompt, /<<<image 3>>> — "Tee"/)
  assert.match(prompt, /<<<image 4>>> only as a body-pose guide/)
  assert.match(prompt, /<<<image 5>>>/)
  assert.match(prompt, /Full left profile/)
  assert.match(prompt, /Additional direction: Keep the sleeves rolled\./)
})

test('prompt omits the scene index when the background is the white studio', () => {
  const prompt = buildStudioPrompt({
    garments: [{ ...jacket, imageIndex: 2 }],
    hasPose: false,
    poseImageIndex: null,
    hasSceneImage: false,
    sceneImageIndex: null,
    angle: 'front',
  })
  assert.match(prompt, /seamless white studio background/)
  assert.doesNotMatch(prompt, /<<<image 3>>>/)
})

test('angle normalization keeps order and never returns an empty set', () => {
  assert.deepEqual(normalizeAngles(['back', 'front']), ['front', 'back'])
  assert.deepEqual(normalizeAngles([]), ['front'])
})
