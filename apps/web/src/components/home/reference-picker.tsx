import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  FadeImage,
  LAYER,
  Skeleton,
  cn,
  motionFade,
  motionFadeRise,
  motionFast,
  motionMountFade,
  motionPop,
  motionPress,
  motionSpring,
  toast,
} from '@sunnygen/ui'
import { Check, ImageIcon, Loader2, Upload, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { thumbSrcSet, thumbUrl } from '~/lib/media-thumbs'
import { appendReferences, referenceImageCount, type ReferenceItem } from '~/lib/reference-images'
import { loadReferenceLibrary } from '~/server/library.functions'
import type { PublicAsset } from '~/server/media.server'

type PickerTab = 'avatars' | 'uploads' | 'assets' | 'cobalt'
const PICKER_PAGE_SIZE = 30

const TAB_LABELS: Record<PickerTab, string> = {
  avatars: 'Avatars',
  uploads: 'Uploads',
  assets: 'Assets',
  cobalt: 'Cobalt',
}

function assetLabel(asset: PublicAsset): string {
  if (asset.name) return asset.name
  const date = new Date(asset.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
  const source = asset.source === 'social' ? 'Cobalt' : asset.source === 'generated' ? 'Render' : 'Asset'
  const dimensions = asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : ''
  return `${source}${dimensions} · ${date}`
}

function assetItem(asset: PublicAsset): ReferenceItem {
  return {
    id: asset.id,
    name: assetLabel(asset),
    url: asset.url,
    kind: asset.kind === 'video' ? 'video' : 'image',
    byteSize: asset.byteSize,
    width: asset.width,
    height: asset.height,
  }
}

const SKELETON_TILES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

function PickerSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading references"
      className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5"
    >
      {SKELETON_TILES.map((tile) => (
        <div key={tile} className="border-line bg-canvas/40 overflow-hidden rounded-xl border">
          <Skeleton className="aspect-square rounded-none" />
          <div className="px-2 py-1.5">
            <Skeleton className="h-2.5 w-2/3 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

const PickerTile = memo(function PickerTile({
  item,
  selected,
  disabled,
  onToggle,
}: {
  item: ReferenceItem
  selected: boolean
  disabled: boolean
  onToggle: (item: ReferenceItem) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(item)}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        'group border-line bg-canvas/40 relative overflow-hidden rounded-xl border text-left transition-[border-color,box-shadow,transform] [contain-intrinsic-size:auto_160px] [content-visibility:auto] active:scale-[0.98] disabled:opacity-40 motion-reduce:active:scale-100',
        selected ? 'border-accent ring-accent/20 ring-2' : 'hover:border-ink/25',
      )}
    >
      <div className="bg-ink/[0.06] relative aspect-square overflow-hidden">
        {item.kind === 'video' ? (
          <video
            src={item.url}
            muted
            preload="metadata"
            playsInline
            className="relative size-full object-cover"
          />
        ) : (
          <FadeImage
            src={thumbUrl(item.url, 320)}
            srcSet={thumbSrcSet(item.url, [320, 640])}
            sizes="(min-width: 768px) 180px, 33vw"
            alt=""
            loading="lazy"
            decoding="async"
            className="relative size-full object-cover duration-300 [@media(hover:hover)]:group-hover:scale-[1.02]"
          />
        )}
      </div>
      {item.lora ? (
        <span className="bg-accent text-canvas absolute top-1.5 left-1.5 rounded px-1 py-0.5 text-[8px] font-semibold tracking-[0.04em] uppercase">
          LoRA
        </span>
      ) : null}
      <span className="text-ink/55 block truncate px-2 py-1.5 text-[10px]">{item.name}</span>
      <span
        aria-hidden="true"
        className={cn(
          'border-accent bg-accent absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full border text-white transition-[opacity,scale] duration-150 ease-out motion-reduce:transition-none',
          selected ? 'scale-100 opacity-100' : 'scale-90 opacity-0',
        )}
      >
        <Check size={11} />
      </span>
    </button>
  )
})

export function ReferencePicker({
  title,
  allowAvatars,
  existingIds,
  max,
  kind = 'image',
  onClose,
  onConfirm,
}: {
  title: string
  allowAvatars: boolean
  existingIds: string[]
  max: number
  kind?: 'image' | 'video'
  onClose: () => void
  onConfirm: (items: ReferenceItem[]) => void
}) {
  const [selectedTab, setSelectedTab] = useState<PickerTab | null>(null)
  const [picked, setPicked] = useState<ReferenceItem[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [linkText, setLinkText] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [page, setPage] = useState<{ tab: PickerTab; count: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const library = useQuery({
    queryKey: ['reference-library', kind],
    queryFn: () => loadReferenceLibrary({ data: { kind } }),
    staleTime: 30_000,
  })

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const existing = useMemo(() => new Set(existingIds), [existingIds])
  const pickedCount = referenceImageCount(picked)
  const groups = useMemo<Record<PickerTab, ReferenceItem[]>>(() => {
    const allAssets = (library.data?.assets ?? []).filter((asset) => asset.kind === kind)
    return {
      avatars:
        kind === 'video'
          ? []
          : (library.data?.avatars ?? []).map((avatar) => ({
              id: avatar.id,
              name: avatar.name,
              url: avatar.url,
              assetIds: avatar.assetIds,
              sheetAssetId: avatar.sheetAssetId,
              avatar: true,
              avatarId: avatar.avatarId,
              lora: avatar.lora,
              profile: avatar.profile,
              crops: avatar.crops,
              boards: avatar.boards,
              byteSize: avatar.byteSize,
              width: avatar.width,
              height: avatar.height,
            })),
      uploads: allAssets.filter((asset) => asset.source === 'upload').map(assetItem),
      assets: allAssets
        .filter((asset) => asset.source === 'generated' || asset.source === 'studio')
        .map(assetItem),
      cobalt: allAssets.filter((asset) => asset.source === 'social').map(assetItem),
    }
  }, [library.data, kind])
  const order: PickerTab[] =
    kind === 'video'
      ? ['uploads', 'assets', 'cobalt']
      : allowAvatars
        ? ['avatars', 'uploads', 'assets', 'cobalt']
        : ['uploads', 'assets', 'cobalt']
  const defaultTab = order[0] ?? 'uploads'
  const preferred = selectedTab ?? defaultTab
  const tab =
    selectedTab !== null || groups[preferred].length > 0
      ? preferred
      : (order.find((entry) => groups[entry].length > 0) ?? preferred)
  const tabs = order
  const pickedIds = useMemo(() => new Set(picked.map((item) => item.id)), [picked])
  const pickedAssetIds = useMemo(
    () => new Set(picked.flatMap((item) => item.assetIds ?? [item.id])),
    [picked],
  )
  const visible = useMemo(
    () =>
      groups[tab].filter((item) => {
        if (existing.has(item.id)) return false
        if (pickedIds.has(item.id)) return true
        return !(item.assetIds ?? [item.id]).some((id) => pickedAssetIds.has(id))
      }),
    [groups, tab, existing, pickedIds, pickedAssetIds],
  )
  const visibleCount = page?.tab === tab ? page.count : PICKER_PAGE_SIZE
  const shown = visible.slice(0, visibleCount)

  useEffect(() => {
    if (visible.length <= visibleCount) return
    const node = loadMoreRef.current
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        setPage((current) => {
          const count = current?.tab === tab ? current.count : PICKER_PAGE_SIZE
          return { tab, count: Math.min(count + PICKER_PAGE_SIZE, visible.length) }
        })
      },
      { rootMargin: '400px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [tab, visible.length, visibleCount])

  const toggle = useCallback(
    (item: ReferenceItem) => {
      setPicked((current) => {
        if (current.some((entry) => entry.id === item.id)) {
          return current.filter((entry) => entry.id !== item.id)
        }
        if (referenceImageCount(current) + (item.assetIds?.length ?? 1) > max) return current
        return appendReferences(current, [item], max)
      })
    },
    [max],
  )

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    setUploadError(null)
    try {
      const next: ReferenceItem[] = []
      for (const file of Array.from(files).slice(0, max - pickedCount)) {
        const form = new FormData()
        form.set('file', file)
        const response = await fetch('/api/upload', { method: 'POST', body: form })
        const payload = (await response.json().catch(() => null)) as {
          asset?: PublicAsset
          error?: string
        } | null
        if (!response.ok || !payload?.asset) {
          throw new Error(payload?.error ?? 'Upload failed')
        }
        const uploadedName = payload.asset.name ?? file.name
        toast(uploadedName === file.name ? `Uploaded ${uploadedName}` : `Uploaded as ${uploadedName}`, {
          tone: 'info',
        })
        if (payload.asset.kind === kind && !pickedAssetIds.has(payload.asset.id)) {
          next.push({
            id: payload.asset.id,
            name: uploadedName,
            url: payload.asset.url,
            kind,
            byteSize: payload.asset.byteSize,
            width: payload.asset.width,
            height: payload.asset.height,
          })
        }
      }
      setPicked((current) => appendReferences(current, next, max))
      await library.refetch()
      setSelectedTab('uploads')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed'
      setUploadError(message)
      toast(message, { tone: 'error' })
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const importLinks = async () => {
    const urls = linkText
      .split(/\s+/)
      .map((entry) => entry.trim())
      .filter(Boolean)
    if (urls.length === 0) return
    setImporting(true)
    setImportError(null)
    try {
      const response = await fetch('/api/social/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      })
      const payload = (await response.json().catch(() => null)) as {
        assets?: PublicAsset[]
        errors?: Array<{ url: string; error: string }>
        error?: string
      } | null
      if (!response.ok) throw new Error(payload?.error ?? 'Import failed')
      const next = (payload?.assets ?? [])
        .filter((asset) => asset.kind === kind)
        .map(assetItem)
        .filter((item) => !existing.has(item.id) && !pickedAssetIds.has(item.id) && !pickedIds.has(item.id))
      setPicked((current) => appendReferences(current, next, max))
      setLinkText('')
      setSelectedTab('cobalt')
      await library.refetch()
      void queryClient.invalidateQueries({ queryKey: ['home-uploads'] })
      void queryClient.invalidateQueries({ queryKey: ['folders'] })
      void queryClient.invalidateQueries({ queryKey: ['assets'] })
      if (payload?.errors?.length) {
        setImportError(payload.errors[0]?.error ?? 'Some links failed to import.')
      }
      const imported = (payload?.assets ?? []).filter((asset) => asset.kind === kind).length
      if (imported > 0) toast(`Imported ${imported} ${imported === 1 ? 'file' : 'files'}`, { tone: 'info' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Import failed'
      setImportError(message)
      toast(message, { tone: 'error' })
    } finally {
      setImporting(false)
    }
  }

  return (
    <motion.div
      variants={motionFade}
      initial="hidden"
      animate="visible"
      exit="hidden"
      className={cn(
        'bg-ink/35 fixed inset-0 flex items-center justify-center p-3 md:p-8 md:backdrop-blur-sm',
        LAYER.picker,
      )}
      onClick={onClose}
    >
      <motion.div
        variants={motionPop}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="border-line bg-surface flex h-[min(82vh,620px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border shadow-2xl"
      >
        <div className="border-line flex items-center gap-3 border-b px-4 py-3">
          <div>
            <h2 className="font-display text-ink text-[15px] font-semibold">{title}</h2>
            <p className="text-ink/40 mt-0.5 text-[10.5px]">
              {allowAvatars
                ? 'Studio avatars, uploads, renders, and cobalt imports.'
                : 'Uploads, renders, and cobalt imports.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close picker"
            className="text-ink/40 hover:bg-ink/5 hover:text-ink ml-auto grid size-8 place-items-center rounded-lg transition-[color,background-color,transform] active:scale-90"
          >
            <X size={15} />
          </button>
        </div>

        <div className="border-line flex items-center gap-1 overflow-x-auto border-b px-3 py-2">
          {tabs.map((entry) => (
            <button
              key={entry}
              type="button"
              onClick={() => setSelectedTab(entry)}
              className={cn(
                'relative shrink-0 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium transition-[color,background-color,transform]',
                motionPress,
                tab === entry ? 'text-canvas' : 'text-ink/50 hover:text-ink',
              )}
            >
              {tab === entry ? (
                <motion.span
                  layoutId="reference-picker-tab"
                  transition={motionSpring}
                  className="bg-ink absolute inset-0 rounded-lg"
                />
              ) : null}
              <span className="relative">{TAB_LABELS[entry]}</span>
              <span
                className={cn(
                  'relative ml-1.5 text-[9.5px]',
                  tab === entry ? 'text-canvas/55' : 'text-ink/30',
                )}
              >
                {groups[entry].length}
              </span>
            </button>
          ))}
        </div>

        {tab === 'cobalt' ? (
          <div className="border-line border-b px-3 py-2">
            <div className="flex items-start gap-2">
              <textarea
                value={linkText}
                onChange={(event) => {
                  setLinkText(event.target.value)
                  setImportError(null)
                }}
                rows={2}
                placeholder="Paste Cobalt links, one per line"
                aria-label="Cobalt links"
                className="border-line bg-canvas/50 text-ink placeholder:text-ink/30 focus-visible:border-accent/40 min-h-9 flex-1 resize-none rounded-xl border px-2.5 py-1.5 text-[11px] leading-relaxed outline-none"
              />
              <button
                type="button"
                onClick={() => void importLinks()}
                disabled={importing || linkText.trim().length === 0}
                className="bg-ink text-canvas hover:bg-ink/90 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[11.5px] font-medium transition-[color,background-color,transform] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-35 motion-reduce:active:scale-100"
              >
                <AnimatePresence initial={false} mode="popLayout">
                  {importing ? (
                    <motion.span
                      key="busy"
                      variants={motionPop}
                      initial="hidden"
                      animate="visible"
                      exit="hidden"
                      transition={motionFast}
                      className="grid place-items-center"
                    >
                      <Loader2 size={13} className="animate-spin" />
                    </motion.span>
                  ) : null}
                </AnimatePresence>
                Import
              </button>
            </div>
            <AnimatePresence initial={false} mode="popLayout">
              <motion.p
                key={importError ?? 'hint'}
                variants={motionFadeRise}
                initial="hidden"
                animate="visible"
                exit="hidden"
                transition={motionFast}
                className={cn('mt-1 text-[10px]', importError ? 'text-error' : 'text-ink/30')}
              >
                {importError ?? 'Cobalt downloads the post into assets. Multi-image posts become a folder.'}
              </motion.p>
            </AnimatePresence>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div key={library.isPending ? 'loading' : tab} className={cn('w-full', motionMountFade)}>
            <div
              className={cn(
                'transition-opacity duration-150',
                library.isFetching && !library.isPending ? 'opacity-55' : 'opacity-100',
              )}
            >
              {library.isPending ? (
                <PickerSkeleton />
              ) : visible.length === 0 ? (
                <div className="text-ink/35 grid h-full place-items-center text-center">
                  <div>
                    <ImageIcon size={22} className="mx-auto" />
                    <p className="mt-2 text-[12px]">
                      {groups[tab].length === 0
                        ? `No ${TAB_LABELS[tab].toLowerCase()} yet.`
                        : 'Everything here is already selected.'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                  {shown.map((item) => {
                    const selected = pickedIds.has(item.id)
                    return (
                      <PickerTile
                        key={item.id}
                        item={item}
                        selected={selected}
                        disabled={!selected && pickedCount + (item.assetIds?.length ?? 1) > max}
                        onToggle={toggle}
                      />
                    )
                  })}
                </div>
              )}
              {visible.length > shown.length ? (
                <div ref={loadMoreRef} aria-hidden="true" className="h-px w-full" />
              ) : null}
            </div>
          </div>
        </div>

        <div className="border-line flex flex-col gap-1.5 border-t px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading || pickedCount >= max}
              className="border-line bg-canvas/50 text-ink/60 hover:text-ink inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[12px] font-medium transition-[color,border-color,transform] active:scale-[0.97] disabled:opacity-40 motion-reduce:active:scale-100"
            >
              <motion.span
                key={uploading ? 'busy' : 'idle'}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={motionFast}
                className="grid place-items-center"
              >
                {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              </motion.span>
              Upload
            </button>
            <input
              ref={fileRef}
              type="file"
              accept={kind === 'video' ? 'video/*' : 'image/*'}
              multiple
              className="hidden"
              onChange={(event) => void uploadFiles(event.target.files)}
            />
            <p className="text-ink/40 text-[10.5px]">
              {Number.isFinite(max)
                ? `${picked.length} selected · ${pickedCount} of ${max} ${kind} slot${max === 1 ? '' : 's'} used`
                : `${picked.length} selected`}
            </p>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="border-line bg-surface text-ink/60 hover:text-ink h-9 rounded-xl border px-3 text-[12px] font-medium transition-[color,border-color,transform] active:scale-[0.97] motion-reduce:active:scale-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onConfirm(picked)
                  onClose()
                }}
                disabled={picked.length === 0}
                className="bg-accent hover:bg-accent/90 h-9 rounded-xl px-3.5 text-[12px] font-medium text-white transition-[background-color,transform] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-35 motion-reduce:active:scale-100"
              >
                Add {picked.length > 0 ? picked.length : ''}
              </button>
            </div>
          </div>
          <AnimatePresence initial={false}>
            {uploadError ? (
              <motion.p
                key="upload-error"
                variants={motionFadeRise}
                initial="hidden"
                animate="visible"
                exit="hidden"
                transition={motionFast}
                className="text-error text-[10.5px]"
              >
                {uploadError}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  )
}
