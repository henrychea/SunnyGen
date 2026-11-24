import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildStudioPrompt,
  missingViewWarnings,
  normalizeAngles,
  orderStudioGarments,
  parseGarmentViews,
  pickGarmentView,
  scenePrepPrompt,
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
    angle: 'left',
    notes: 'Keep the sleeves rolled.',
  })
  assert.match(prompt, /image 1/)
  assert.match(prompt, /1\. Image 2: "Dress"/)
  assert.match(prompt, /2\. Image 3: "Tee"/)
  assert.match(prompt, /image 4 only as a body-pose guide/)
  assert.match(prompt, /image 5/)
  assert.match(prompt, /Full left profile/)
  assert.match(prompt, /Additional direction: Keep the sleeves rolled\./)
})

test('prompt names the garment view it was handed', () => {
  const prompt = buildStudioPrompt({
    garments: [{ ...jacket, imageIndex: 2, view: 'back' }],
    hasPose: false,
    poseImageIndex: null,
    hasSceneImage: false,
    sceneImageIndex: null,
    angle: 'back',
  })
  assert.match(prompt, /1\. Image 2: "Jacket" \(outerwear, shown from the back view\)/)
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
  assert.doesNotMatch(prompt, /image 3/)
})

test('angle normalization keeps order and never returns an empty set', () => {
  assert.deepEqual(normalizeAngles(['back', 'front']), ['front', 'back'])
  assert.deepEqual(normalizeAngles(['under', 'left', 'front']), ['front', 'left', 'under'])
  assert.deepEqual(normalizeAngles([]), ['front'])
})

test('garment views read the front photo plus the tagged angles', () => {
  const views = parseGarmentViews({
    assetId: 'front-photo',
    cleanAssetId: 'front-clean',
    data: {
      views: [
        { angle: 'back', assetId: 'back-photo', cleanAssetId: 'back-clean' },
        { angle: 'back', assetId: 'duplicate' },
        { angle: 'diagonal', assetId: 'bogus' },
        { angle: 'left', assetId: '' },
        { angle: 'top', assetId: 'top-photo' },
        { angle: 'front', assetId: 'stale-front' },
      ],
    },
  })
  assert.deepEqual(
    views.map((view) => [view.angle, view.assetId]),
    [
      ['front', 'front-photo'],
      ['back', 'back-photo'],
      ['top', 'top-photo'],
    ],
  )
  assert.equal(views[0]?.cleanAssetId, 'front-clean')
  assert.equal(views[1]?.cleanAssetId, 'back-clean')
})

test('a shot angle picks the closest garment view it can', () => {
  const views = parseGarmentViews({
    assetId: 'front-photo',
    cleanAssetId: null,
    data: { views: [{ angle: 'left', assetId: 'left-photo' }] },
  })
  assert.equal(pickGarmentView(views, 'left')?.assetId, 'left-photo')
  assert.equal(pickGarmentView(views, 'right')?.angle, 'front')
  assert.equal(pickGarmentView(views, 'back')?.angle, 'front')
  assert.equal(pickGarmentView([], 'front'), null)
})

test('missing views only warn for garments tagged with more than one angle', () => {
  const warnings = missingViewWarnings(
    [
      { name: 'Jacket', views: ['front', 'back'] },
      { name: 'Tee', views: ['front'] },
    ],
    ['back', 'left'],
  )
  assert.deepEqual(warnings, ['Jacket has no left side view; its front view is used.'])
})

test('an avatar identity clause rides with the sheet reference', () => {
  const prompt = buildStudioPrompt({
    garments: [{ ...jacket, imageIndex: 4 }],
    hasPose: false,
    poseImageIndex: null,
    hasSceneImage: false,
    sceneImageIndex: null,
    angle: 'front',
    identityImageCount: 3,
    identity: '26yo East Asian woman, soft oval face',
  })
  assert.match(prompt, /character in images 1 to 3, the attached identity references/)
  assert.match(prompt, /Use images 1 to 3 only for identity/)
  assert.match(prompt, /Identity anchors: 26yo East Asian woman, soft oval face\./)
  assert.match(prompt, /1\. Image 4: "Jacket"/)
})

test('the single sheet reference keeps the original opening', () => {
  const prompt = buildStudioPrompt({
    garments: [{ ...jacket, imageIndex: 2 }],
    hasPose: false,
    poseImageIndex: null,
    hasSceneImage: false,
    sceneImageIndex: null,
    angle: 'front',
  })
  assert.match(prompt, /the attached identity reference sheet\./)
  assert.doesNotMatch(prompt, /Identity anchors/)
})

test('the scene prep prompt keeps the location and strips everything people brought', () => {
  const prompt = scenePrepPrompt('Loft', '  wood floor  ')
  assert.match(prompt, /background plate of the location in image 1/)
  assert.match(prompt, /Remove every person, mannequin, and temporary clutter/)
  assert.match(prompt, /lighting, shadows, perspective, and camera angle exactly unchanged/)
  assert.match(prompt, /Do not add, move, restyle, or remove any fixed object/)
  assert.match(prompt, /Scene: Loft\. Details to keep: wood floor$/)
  const bare = scenePrepPrompt('Loft')
  assert.doesNotMatch(bare, /Details to keep/)
  assert.match(bare, /Scene: Loft\.$/)
})
