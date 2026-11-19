import assert from 'node:assert/strict'
import { test } from 'node:test'
import { snapThumbWidth, thumbSrcSet, thumbUrl } from './media-thumbs'

test('allowlisted thumbnail widths pass through', () => {
  assert.equal(snapThumbWidth('160'), 160)
  assert.equal(snapThumbWidth('320'), 320)
  assert.equal(snapThumbWidth('640'), 640)
  assert.equal(snapThumbWidth('1280'), 1280)
})

test('odd widths snap down to the nearest allowed size', () => {
  assert.equal(snapThumbWidth('200'), 160)
  assert.equal(snapThumbWidth('319'), 160)
  assert.equal(snapThumbWidth('500'), 320)
  assert.equal(snapThumbWidth('1000'), 640)
  assert.equal(snapThumbWidth('4000'), 1280)
})

test('widths below the smallest allowed size snap up to it', () => {
  assert.equal(snapThumbWidth('64'), 160)
  assert.equal(snapThumbWidth('1'), 160)
})

test('missing or invalid widths are ignored', () => {
  assert.equal(snapThumbWidth(null), null)
  assert.equal(snapThumbWidth(''), null)
  assert.equal(snapThumbWidth('   '), null)
  assert.equal(snapThumbWidth('abc'), null)
  assert.equal(snapThumbWidth('320px'), null)
  assert.equal(snapThumbWidth('0'), null)
  assert.equal(snapThumbWidth('-320'), null)
  assert.equal(snapThumbWidth('320.5'), null)
  assert.equal(snapThumbWidth('Infinity'), null)
})

test('thumb urls only rewrite managed media paths', () => {
  assert.equal(thumbUrl('/api/media/asset-1', 320), '/api/media/asset-1?w=320')
  assert.equal(thumbUrl('/api/media/asset-1?download=1', 160), '/api/media/asset-1?download=1&w=160')
  assert.equal(thumbUrl('https://cdn.test/asset.png', 320), 'https://cdn.test/asset.png')
})

test('src sets pair every allowed width with its descriptor', () => {
  assert.equal(
    thumbSrcSet('/api/media/asset-1', [320, 640]),
    '/api/media/asset-1?w=320 320w, /api/media/asset-1?w=640 640w',
  )
})
