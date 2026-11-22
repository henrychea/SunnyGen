import {
  Fragment,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { cn } from './cn'
import {
  motionFade,
  motionFast,
  motionList,
  motionListItem,
  motionPop,
  motionPress,
  motionSpring,
  motionSwap,
} from './motion'

export type SelectorSize = 'sm' | 'md'

export interface SelectorOption {
  key: string
  label: string
  description?: string
  triggerDescription?: string
  meta?: string
  group?: string
  leading?: ReactNode
  disabled?: boolean
  filterIds?: string[]
  searchText?: string
}

export interface SelectorFilter {
  id: string
  label: string
}

export interface SelectorProps {
  value: string | null
  options: SelectorOption[]
  onChange: (option: SelectorOption) => void
  placeholder?: string
  size?: SelectorSize
  disabled?: boolean
  className?: string
  ariaLabel?: string
  searchable?: boolean
  searchPlaceholder?: string
  filters?: SelectorFilter[]
  allFilterLabel?: string
  menuMinWidth?: number
  menuMaxWidth?: number
  emptyLabel?: string
  footer?: ReactNode
  showTriggerDescription?: boolean
  menuClassName?: string
}

type MenuPosition = { left: number; width: number; top?: number; bottom?: number; maxHeight: number }

function menuPosition(rect: DOMRect, minWidth: number, maxWidth: number): MenuPosition {
  const width = Math.min(Math.max(rect.width, minWidth), Math.max(minWidth, maxWidth), window.innerWidth - 16)
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
  const spaceBelow = window.innerHeight - rect.bottom
  const spaceAbove = rect.top
  if (spaceBelow < 320 && spaceAbove > spaceBelow) {
    return {
      left,
      width,
      bottom: window.innerHeight - rect.top + 6,
      maxHeight: Math.max(0, rect.top - 14),
    }
  }
  return {
    left,
    width,
    top: rect.bottom + 6,
    maxHeight: Math.max(0, window.innerHeight - rect.bottom - 14),
  }
}

function ChevronDown({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0">
      <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0">
      <circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.3" />
      <path d="m10.2 10.2 3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0">
      <path d="m3 8.5 3 3 7-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function Selector({
  value,
  options,
  onChange,
  placeholder = 'Select an option',
  size = 'md',
  disabled = false,
  className,
  ariaLabel,
  searchable = false,
  searchPlaceholder = 'Search',
  filters = [],
  allFilterLabel = 'All',
  menuMinWidth = 280,
  menuMaxWidth = 400,
  emptyLabel = 'No options match that search.',
  footer,
  showTriggerDescription = true,
  menuClassName,
}: SelectorProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [activeIndex, setActiveIndex] = useState(0)
  const [position, setPosition] = useState<MenuPosition | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listboxId = useId()
  const selected = options.find((option) => option.key === value) ?? null

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return options.filter((option) => {
      if (filter !== 'all' && !option.filterIds?.includes(filter)) return false
      if (!needle) return true
      const haystack =
        option.searchText ?? `${option.label} ${option.description ?? ''} ${option.group ?? ''}`
      return haystack.toLowerCase().includes(needle)
    })
  }, [filter, options, query])
  const active = Math.min(activeIndex, Math.max(0, visible.length - 1))
  const hasFilters = filters.length > 0

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (containerRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
      setQuery('')
      setActiveIndex(0)
    }
    const reposition = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (rect) setPosition(menuPosition(rect, menuMinWidth, menuMaxWidth))
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [menuMaxWidth, menuMinWidth, open])

  const close = () => {
    setOpen(false)
    setQuery('')
    setActiveIndex(0)
  }

  const select = (option: SelectorOption) => {
    if (option.disabled) return
    onChange(option)
    close()
  }

  const toggle = () => {
    if (disabled) return
    if (open) {
      close()
      return
    }
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) setPosition(menuPosition(rect, menuMinWidth, menuMaxWidth))
    setOpen(true)
    setQuery('')
    const selectedIndex = visible.findIndex((option) => option.key === value)
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)
    requestAnimationFrame(() => {
      if (searchable) {
        searchRef.current?.focus()
      } else {
        menuRef.current?.focus()
      }
      menuRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
    })
  }

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => Math.min(current + 1, visible.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) => Math.max(current - 1, 0))
    } else if (event.key === 'Home') {
      event.preventDefault()
      setActiveIndex(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setActiveIndex(Math.max(0, visible.length - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const option = visible[active]
      if (option) select(option)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      close()
      triggerRef.current?.focus()
    }
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            if (!open) toggle()
          }
        }}
        className={cn(
          'border-line bg-surface text-ink hover:border-ink/25 focus-visible:border-accent/40 relative flex w-full items-center gap-2 border text-left transition-[color,border-color,transform] disabled:cursor-not-allowed disabled:opacity-50',
          motionPress,
          size === 'sm' ? 'h-9 rounded-lg px-3' : 'h-11 rounded-xl px-3.5',
        )}
      >
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={selected?.key ?? 'placeholder'}
            variants={motionSwap}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={motionFast}
            className="flex min-w-0 flex-1 items-center gap-2"
          >
            {selected?.leading ? <span className="shrink-0">{selected.leading}</span> : null}
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  'block truncate font-medium',
                  size === 'sm' ? 'text-[12.5px]' : 'text-[13.5px]',
                )}
              >
                {selected?.label ?? placeholder}
              </span>
              {selected && showTriggerDescription && (selected.triggerDescription ?? selected.description) ? (
                <span
                  className={cn(
                    'text-ink/40 block truncate',
                    size === 'sm' ? 'text-[10.5px]' : 'text-[11px]',
                  )}
                >
                  {selected.triggerDescription ?? selected.description}
                </span>
              ) : null}
            </span>
          </motion.span>
        </AnimatePresence>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={motionFast} className="shrink-0">
          <ChevronDown size={size === 'sm' ? 12 : 14} />
        </motion.span>
      </button>

      {position
        ? createPortal(
            <AnimatePresence>
              {open ? (
                <motion.div
                  key="menu"
                  ref={menuRef}
                  tabIndex={-1}
                  onKeyDown={handleMenuKeyDown}
                  variants={motionPop}
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                  style={{
                    position: 'fixed',
                    left: position.left,
                    width: position.width,
                    maxHeight: position.maxHeight,
                    transformOrigin: position.top !== undefined ? 'top center' : 'bottom center',
                    ...(position.top !== undefined ? { top: position.top } : { bottom: position.bottom }),
                  }}
                  className={cn(
                    'border-line bg-surface flex flex-col overflow-hidden rounded-xl border shadow-[0_20px_50px_-20px_rgba(42,30,23,0.45)] outline-none',
                    menuClassName ?? 'z-[80]',
                  )}
                >
                  {searchable ? (
                    <div className="border-line flex items-center gap-2 border-b px-3 py-2.5">
                      <span className="text-ink/35">
                        <SearchIcon />
                      </span>
                      <input
                        ref={searchRef}
                        value={query}
                        onChange={(event) => {
                          setQuery(event.target.value)
                          setActiveIndex(0)
                        }}
                        role="combobox"
                        aria-expanded={open}
                        aria-controls={listboxId}
                        aria-autocomplete="list"
                        aria-activedescendant={visible[active] ? `${listboxId}-${active}` : undefined}
                        placeholder={searchPlaceholder}
                        className="text-ink placeholder:text-ink/30 min-w-0 flex-1 bg-transparent text-[12.5px] outline-none"
                      />
                    </div>
                  ) : null}

                  {hasFilters ? (
                    <div className="border-line flex flex-wrap items-center gap-1.5 border-b px-3 py-2">
                      <button
                        type="button"
                        onClick={() => {
                          setFilter('all')
                          setActiveIndex(0)
                        }}
                        className={cn(
                          'relative rounded-full px-3 py-1.5 text-[10.5px] font-medium transition-colors',
                          motionPress,
                          filter === 'all' ? 'text-canvas' : 'text-ink/45 hover:text-ink',
                        )}
                      >
                        {filter === 'all' ? (
                          <motion.span
                            layoutId={`${listboxId}-filter`}
                            transition={motionSpring}
                            className="bg-ink absolute inset-0 rounded-full"
                          />
                        ) : null}
                        <span className="relative">{allFilterLabel}</span>
                      </button>
                      {filters.map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => {
                            setFilter(entry.id)
                            setActiveIndex(0)
                          }}
                          className={cn(
                            'relative rounded-full px-3 py-1.5 text-[10.5px] font-medium transition-colors',
                            motionPress,
                            filter === entry.id ? 'text-canvas' : 'text-ink/45 hover:text-ink',
                          )}
                        >
                          {filter === entry.id ? (
                            <motion.span
                              layoutId={`${listboxId}-filter`}
                              transition={motionSpring}
                              className="bg-ink absolute inset-0 rounded-full"
                            />
                          ) : null}
                          <span className="relative">{entry.label}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <motion.div
                    id={listboxId}
                    role="listbox"
                    variants={motionList}
                    initial="hidden"
                    animate="visible"
                    className="max-h-80 min-h-0 flex-1 overflow-y-auto p-1.5"
                  >
                    {visible.length === 0 ? (
                      <motion.p
                        variants={motionFade}
                        initial="hidden"
                        animate="visible"
                        className="text-ink/35 px-2.5 py-4 text-center text-[11px]"
                      >
                        {emptyLabel}
                      </motion.p>
                    ) : (
                      visible.map((option, index) => {
                        const previous = visible[index - 1]
                        return (
                          <Fragment key={option.key}>
                            {option.group && (!previous || previous.group !== option.group) ? (
                              <p className="text-ink/30 bg-surface/95 sticky top-0 z-10 px-2.5 pt-2 pb-1 text-[9.5px] font-semibold tracking-[0.1em] uppercase backdrop-blur">
                                {option.group}
                              </p>
                            ) : null}
                            <motion.button
                              id={`${listboxId}-${index}`}
                              variants={motionListItem}
                              type="button"
                              role="option"
                              aria-selected={selected?.key === option.key}
                              aria-disabled={option.disabled}
                              disabled={option.disabled}
                              onMouseEnter={() => setActiveIndex(index)}
                              onClick={() => select(option)}
                              className={cn(
                                'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors active:bg-ink/[0.09]',
                                index === active ? 'bg-ink/[0.06]' : '',
                                option.disabled ? 'cursor-not-allowed opacity-45' : '',
                              )}
                            >
                              {option.leading ? <span className="shrink-0">{option.leading}</span> : null}
                              <span className="min-w-0 flex-1">
                                <span className="text-ink/80 block truncate text-[12.5px] font-medium">
                                  {option.label}
                                </span>
                                {option.description ? (
                                  <span className="text-ink/35 block truncate text-[10.5px]">
                                    {option.description}
                                  </span>
                                ) : null}
                              </span>
                              {option.meta ? (
                                <span className="text-ink/40 max-w-[42%] shrink-0 truncate text-[10.5px] tabular-nums">
                                  {option.meta}
                                </span>
                              ) : null}
                              <span className="text-accent grid w-[13px] shrink-0 place-items-center">
                                <motion.span
                                  animate={{
                                    opacity: selected?.key === option.key ? 1 : 0,
                                    scale: selected?.key === option.key ? 1 : 0.7,
                                  }}
                                  transition={motionFast}
                                >
                                  <CheckIcon />
                                </motion.span>
                              </span>
                            </motion.button>
                          </Fragment>
                        )
                      })
                    )}
                  </motion.div>
                  {footer ? (
                    <div className="border-line/60 text-ink/30 border-t px-3 py-2 text-[9.5px] leading-snug">
                      {footer}
                    </div>
                  ) : null}
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </div>
  )
}
