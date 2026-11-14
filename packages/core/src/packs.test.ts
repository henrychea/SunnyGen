import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MAX_PACK_ITEMS,
  findManifestPath,
  inferKindFromPath,
  packItemName,
  planPack,
  type PackManifest,
} from './packs'

const entries = [
  { path: 'poses/P001-stand.png', size: 100 },
  { path: 'poses/P002-sit.jpg', size: 200 },
  { path: 'notes.txt', size: 10 },
  { path: '.DS_Store', size: 1 },
  { path: '__MACOSX/poses/._P001-stand.png', size: 2 },
  { path: 'sunnygen-pack.json', size: 50 },
]

test('paths normalize and unsupported files are ignored', () => {
  assert.equal(findManifestPath(['./sunnygen-pack.json', 'poses/P001.png']), 'sunnygen-pack.json')
  assert.equal(findManifestPath(['meta.json']), 'meta.json')
  assert.equal(findManifestPath(['a/meta.json']), null)
  const plan = planPack({ entries, fallbackKind: 'pose' })
  assert.deepEqual(
    plan.items.map((item) => item.file),
    ['poses/P001-stand.png', 'poses/P002-sit.jpg'],
  )
  assert.equal(plan.items[0]?.name, 'P001-stand')
})

test('kind resolves from the item, manifest, fallback, then path hints', () => {
  assert.equal(inferKindFromPath('wardrobe/top-01.png'), 'garment')
  assert.equal(inferKindFromPath('poses/P001.png'), 'pose')
  assert.equal(inferKindFromPath('misc/a.png'), null)
  const manifest: PackManifest = { kind: 'scene', items: [{ file: 'misc/a.png' }] }
  assert.equal(planPack({ entries: [{ path: 'misc/a.png' }], manifest }).items[0]?.kind, 'scene')
  assert.equal(planPack({ entries: [{ path: 'misc/a.png' }], fallbackKind: 'pose' }).items[0]?.kind, 'pose')
  assert.equal(planPack({ entries: [{ path: 'poses/a.png' }] }).items[0]?.kind, 'pose')
  assert.equal(
    planPack({ entries: [{ path: 'poses/a.png' }], fallbackKind: 'garment' }).items[0]?.kind,
    'garment',
  )
})

test('manifest names, data, and sidecars map onto items', () => {
  const manifest: PackManifest = {
    name: 'Winter pack',
    kind: 'garment',
    defaults: { data: { tags: ['reference'] } },
    items: [
      {
        file: 'poses/P001-stand.png',
        name: '  Studio   stand ',
        kind: 'garment',
        data: { slot: 'dress', notes: 'silk' },
        cleanFile: 'poses/P002-sit.jpg',
      },
    ],
  }
  const plan = planPack({ entries, manifest, manifestPath: 'sunnygen-pack.json' })
  assert.equal(plan.name, 'Winter pack')
  const item = plan.items[0]
  assert.equal(item?.name, 'Studio stand')
  assert.equal(item?.kind, 'garment')
  assert.equal(item?.cleanFile, 'poses/P002-sit.jpg')
  assert.deepEqual(item?.data, {
    tags: ['reference'],
    slot: 'dress',
    notes: 'silk',
    sourceKind: 'flat-lay',
  })
  assert.deepEqual(plan.skipped, [])
})

test('garment data defaults and validates', () => {
  const plan = planPack({
    entries,
    manifest: { items: [{ file: 'poses/P001-stand.png', kind: 'garment' }] },
  })
  assert.deepEqual(plan.items[0]?.data, { slot: 'top', sourceKind: 'flat-lay' })

  const bad = planPack({
    entries,
    manifest: { items: [{ file: 'poses/P001-stand.png', kind: 'garment', data: { slot: 'hat' } }] },
  })
  assert.equal(bad.items.length, 0)
  assert.match(bad.issues[0]?.error ?? '', /Unknown garment slot/)
})

test('avatars require a character sheet inside the pack', () => {
  const missing = planPack({
    entries,
    manifest: { items: [{ file: 'poses/P001-stand.png', kind: 'avatar' }] },
  })
  assert.match(missing.issues[0]?.error ?? '', /characterSheetFile/)

  const resolved = planPack({
    entries,
    manifest: {
      items: [
        {
          file: 'poses/P001-stand.png',
          kind: 'avatar',
          characterSheetFile: 'poses/P002-sit.jpg',
        },
      ],
    },
  })
  assert.equal(resolved.items[0]?.characterSheetFile, 'poses/P002-sit.jpg')
})

test('files map form and excluded entries are honored', () => {
  const manifest: PackManifest = {
    kind: 'pose',
    files: {
      'poses/P001-stand.png': { name: 'Stand' },
      'poses/P002-sit.jpg': { include: false },
    },
  }
  const plan = planPack({ entries, manifest })
  assert.deepEqual(
    plan.items.map((item) => item.name),
    ['Stand'],
  )
  assert.deepEqual(plan.skipped, [{ file: 'poses/P002-sit.jpg', reason: 'Excluded by the manifest.' }])
})

test('duplicates and library collisions are skipped, missing files reported', () => {
  const plan = planPack({
    entries,
    fallbackKind: 'pose',
    existing: [{ kind: 'pose', name: 'p002-sit' }],
    manifest: {
      items: [
        { file: 'poses/P001-stand.png', name: 'Stand' },
        { file: 'poses/P002-sit.jpg', name: 'Stand' },
        { file: 'poses/missing.png' },
        { file: 'notes.txt' },
      ],
    },
  })
  assert.deepEqual(
    plan.items.map((item) => item.name),
    ['Stand'],
  )
  assert.ok(plan.skipped.some((skip) => skip.reason === 'Duplicate name inside the pack.'))
  assert.ok(plan.issues.some((issue) => issue.error === 'File not found in the pack.'))
  assert.ok(plan.issues.some((issue) => issue.error.startsWith('Not a supported image')))
})

test('existing library names are skipped without blocking new items', () => {
  const manifest: PackManifest = {
    kind: 'pose',
    items: [{ file: 'poses/P001-stand.png' }, { file: 'poses/P002-sit.jpg' }],
  }
  const plan = planPack({ entries, manifest, existing: [{ kind: 'pose', name: 'P002-sit' }] })
  assert.deepEqual(
    plan.items.map((item) => item.name),
    ['P001-stand'],
  )
  assert.deepEqual(plan.skipped, [{ file: 'poses/P002-sit.jpg', reason: 'Already in the library.' }])
})

test('names strip control characters and clamp to the column limit', () => {
  assert.equal(packItemName('a/  weird\u0007 name .png'), 'weird name')
  assert.equal(packItemName(`${'x'.repeat(120)}.png`).length, 80)
  assert.ok(MAX_PACK_ITEMS >= 100)
})
