import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CATALOG_VERSION,
  catalogNeedsResync,
  storedEntryCapabilities,
  type StoredCatalogEntryShape,
} from './model-catalog.stale'

function entry(overrides: Partial<StoredCatalogEntryShape> = {}): StoredCatalogEntryShape {
  return { kind: 'image', ...overrides }
}

test('stored entries without capability fields are not edit-capable', () => {
  const stale = storedEntryCapabilities(entry({ kind: 'image' }))
  assert.equal(stale.supportsImages, false)
  assert.equal(stale.maxImages, 0)
  assert.equal(stale.supportsText, true)

  const capable = storedEntryCapabilities(
    entry({ kind: 'image', supportsImages: true, supportsText: false, maxImages: 6 }),
  )
  assert.equal(capable.supportsImages, true)
  assert.equal(capable.maxImages, 6)
  assert.equal(capable.supportsText, false)
})

test('video entries keep a reference image slot when the field is missing', () => {
  const video = storedEntryCapabilities(entry({ kind: 'video' }))
  assert.equal(video.supportsImages, false)
  assert.equal(video.maxImages, 2)
})

test('catalogs written before the version stamp need a resync', () => {
  assert.equal(catalogNeedsResync({ entries: [entry()] }), true)
  assert.equal(catalogNeedsResync({ version: CATALOG_VERSION - 1, entries: [entry()] }), true)
  assert.equal(catalogNeedsResync({ version: CATALOG_VERSION, entries: [entry()] }), true)
  assert.equal(
    catalogNeedsResync({
      version: CATALOG_VERSION,
      entries: [entry({ supportsImages: true, maxImages: 4 })],
    }),
    false,
  )
})

test('an empty catalog is already current', () => {
  assert.equal(catalogNeedsResync(null), false)
  assert.equal(catalogNeedsResync({ version: CATALOG_VERSION, entries: [] }), false)
})
