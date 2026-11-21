import assert from 'node:assert/strict'
import test from 'node:test'
import { splitFolderChips, type FolderChip } from './folder-chips'

function folders(count: number): FolderChip[] {
  return [
    { id: 'all', label: 'Everything' },
    { id: 'unfiled', label: 'Unfiled' },
    ...Array.from({ length: count }, (_, index) => ({
      id: `folder-${index + 1}`,
      label: `Folder ${index + 1}`,
    })),
  ]
}

test('shows every chip when the list fits', () => {
  const items = folders(2)
  assert.deepEqual(splitFolderChips(items, 'all'), { visible: items, overflow: [] })
  assert.deepEqual(splitFolderChips(folders(3), 'all'), { visible: folders(3), overflow: [] })
})

test('moves the remaining folders into the overflow list', () => {
  const split = splitFolderChips(folders(6), 'all')
  assert.deepEqual(
    split.visible.map((item) => item.id),
    ['all', 'unfiled', 'folder-1', 'folder-2', 'folder-3'],
  )
  assert.deepEqual(
    split.overflow.map((item) => item.id),
    ['folder-4', 'folder-5', 'folder-6'],
  )
})

test('swaps the active folder into the last visible slot', () => {
  const split = splitFolderChips(folders(6), 'folder-5')
  assert.deepEqual(
    split.visible.map((item) => item.id),
    ['all', 'unfiled', 'folder-1', 'folder-2', 'folder-5'],
  )
  assert.deepEqual(
    split.overflow.map((item) => item.id),
    ['folder-4', 'folder-3', 'folder-6'],
  )
})

test('leaves the split alone when the active folder is visible', () => {
  const split = splitFolderChips(folders(6), 'folder-2')
  assert.deepEqual(
    split.visible.map((item) => item.id),
    ['all', 'unfiled', 'folder-1', 'folder-2', 'folder-3'],
  )
  assert.deepEqual(
    split.overflow.map((item) => item.id),
    ['folder-4', 'folder-5', 'folder-6'],
  )
})

test('does not reorder the input list', () => {
  const items = folders(6)
  const before = items.map((item) => item.id)
  splitFolderChips(items, 'folder-6')
  assert.deepEqual(
    items.map((item) => item.id),
    before,
  )
})
