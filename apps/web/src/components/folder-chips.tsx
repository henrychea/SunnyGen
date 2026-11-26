import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, cn, motionSpring } from '@sunnygen/ui'
import { motion } from 'motion/react'
import { useSyncExternalStore } from 'react'
import { splitFolderChips, type FolderChip } from '~/lib/folder-chips'

function subscribeWide(onChange: () => void) {
  const query = window.matchMedia('(min-width: 640px)')
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function wideSnapshot() {
  return window.matchMedia('(min-width: 640px)').matches
}

function useWideLayout() {
  return useSyncExternalStore(subscribeWide, wideSnapshot, () => false)
}

export function FolderChips({
  items,
  activeId,
  onSelect,
  layoutId = 'folder-chip-pill',
}: {
  items: FolderChip[]
  activeId: string
  onSelect: (id: string) => void
  layoutId?: string
}) {
  const wide = useWideLayout()
  const { visible, overflow } = splitFolderChips(items, activeId, wide ? 9 : 5)
  const chipSizing = (index: number, active: boolean): string => {
    if (index === 0) return 'shrink-0'
    if (active) return 'min-w-0 max-w-[45%] shrink-0'
    return 'min-w-0 flex-1 sm:flex-initial sm:shrink'
  }

  return (
    <div className="flex flex-nowrap gap-1 sm:gap-1.5">
      {visible.map((item, index) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item.id)}
          title={item.label}
          className={cn(
            'relative rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors duration-150 ease-out active:scale-[0.96] sm:px-2.5 sm:text-[11px] motion-reduce:active:scale-100',
            chipSizing(index, activeId === item.id),
            activeId === item.id ? 'text-canvas' : 'bg-surface text-ink/65 hover:text-ink',
          )}
        >
          {activeId === item.id ? (
            <motion.span
              layoutId={layoutId}
              transition={motionSpring}
              className="bg-ink absolute inset-0 rounded-lg"
            />
          ) : null}
          <span className="relative block truncate">{item.label}</span>
        </button>
      ))}
      {overflow.length > 0 ? (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger className="bg-surface text-ink/65 hover:text-ink relative shrink-0 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors duration-150 ease-out outline-none active:scale-[0.96] motion-reduce:active:scale-100 sm:px-2.5 sm:text-[11px]">
            <span className="block truncate">More ({overflow.length})</span>
          </DropdownMenu.Trigger>
          <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
            {overflow.map((item) => (
              <DropdownMenuItem key={item.id} onClick={() => onSelect(item.id)}>
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu.Root>
      ) : null}
    </div>
  )
}
