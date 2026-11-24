import assert from 'node:assert/strict'
import test from 'node:test'
import { buildWallEntries } from './wall-groups'
import type { FolderNode, GenerationWallItem } from '~/server/library.functions'

function generation(overrides: Partial<GenerationWallItem> & { id: string }): GenerationWallItem {
  return {
    generationId: overrides.id,
    kind: 'image',
    status: 'succeeded',
    prompt: `prompt ${overrides.id}`,
    provider: 'sunra',
    model: 'nano-banana-2',
    params: {},
    inputAssetIds: [],
    inputAssets: [],
    url: '',
    urls: [],
    outputs: [],
    width: null,
    height: null,
    duration: null,
    outputCount: 0,
    folderId: null,
    error: null,
    errorCode: null,
    errorReason: null,
    errorRetryable: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  } as GenerationWallItem
}

function outputs(generationId: string, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${generationId}-${index}`,
    url: `/api/media/${generationId}-${index}`,
    width: 1024,
    height: 1536,
    duration: null,
    kind: 'image' as const,
  }))
}

const batch: FolderNode = {
  id: 'folder-1',
  name: 'Look 4 angles',
  parentId: null,
  color: null,
  sortIndex: 0,
  createdAt: 1,
}

test('studio batches group by folder, one entry per folder', () => {
  const entries = buildWallEntries(
    [
      generation({ id: 'a', folderId: 'folder-1', outputs: outputs('a', 1), outputCount: 1 }),
      generation({ id: 'b', folderId: 'folder-1', outputs: outputs('b', 1), outputCount: 1 }),
    ],
    [batch],
  )
  assert.equal(entries.length, 1)
  assert.equal(entries[0]?.type, 'group')
  assert.equal(entries[0]?.type === 'group' ? entries[0].title : '', 'Look 4 angles')
  assert.equal(entries[0]?.type === 'group' ? entries[0].cards.length : 0, 2)
})

test('a folder with one generation shows the card, not a group', () => {
  const entries = buildWallEntries(
    [generation({ id: 'a', folderId: 'folder-1', outputs: outputs('a', 1), outputCount: 1 })],
    [batch],
  )
  assert.equal(entries[0]?.type, 'output')
})

test('a multi-image generation becomes its own group', () => {
  const entries = buildWallEntries(
    [generation({ id: 'a', prompt: 'Four angles', outputs: outputs('a', 4), outputCount: 4 })],
    [],
  )
  assert.equal(entries[0]?.type, 'group')
  assert.equal(entries[0]?.type === 'group' ? entries[0].title : '', 'Four angles')
})

test('running and failed jobs outrank finished renders', () => {
  const entries = buildWallEntries(
    [
      generation({ id: 'done', outputs: outputs('done', 1), outputCount: 1, createdAt: 30 }),
      generation({ id: 'failed', status: 'failed', createdAt: 20 }),
      generation({ id: 'running', status: 'running', createdAt: 10 }),
    ],
    [],
  )
  assert.deepEqual(
    entries.map((entry) => (entry.type === 'group' ? entry.id : entry.generation.id)),
    ['running', 'failed', 'done'],
  )
  assert.deepEqual(
    entries.map((entry) => entry.type),
    ['job', 'job', 'output'],
  )
})
