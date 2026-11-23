import assert from 'node:assert/strict'
import test from 'node:test'
import { uniqueGenerationIds, type GenerationCardLike } from './wall-delete'

function cards(...ids: string[]): GenerationCardLike[] {
  return ids.map((id) => ({ generation: { id } }))
}

test('dedupes generation ids across outputs of the same generation', () => {
  assert.deepEqual(uniqueGenerationIds(cards('gen-1', 'gen-1', 'gen-1', 'gen-2')), ['gen-1', 'gen-2'])
})

test('keeps first-seen order', () => {
  assert.deepEqual(uniqueGenerationIds(cards('b', 'a', 'b', 'c', 'a')), ['b', 'a', 'c'])
})

test('returns nothing for an empty group', () => {
  assert.deepEqual(uniqueGenerationIds([]), [])
})
