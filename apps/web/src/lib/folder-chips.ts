export interface FolderChip {
  id: string
  label: string
}

export interface FolderChipSplit {
  visible: FolderChip[]
  overflow: FolderChip[]
}

export function splitFolderChips(items: FolderChip[], activeId: string, limit = 5): FolderChipSplit {
  const max = Math.max(1, Math.floor(limit))
  if (items.length <= max) return { visible: [...items], overflow: [] }

  const visible = items.slice(0, max)
  const overflow = items.slice(max)
  const activeIndex = overflow.findIndex((item) => item.id === activeId)
  if (activeIndex >= 0) {
    const replaced = visible[visible.length - 1] as FolderChip
    visible[visible.length - 1] = overflow[activeIndex] as FolderChip
    overflow[activeIndex] = replaced
  }

  return { visible, overflow }
}
