import { useQuery, useQueryClient } from '@tanstack/react-query'
import { cn } from '@sunnygen/ui'
import { Check, ImageIcon, Loader2, Upload, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { appendReferences, referenceImageCount, type ReferenceItem } from '~/lib/reference-images'
import { loadReferenceLibrary } from '~/server/library.functions'
import type { PublicAsset } from '~/server/media.server'

type PickerTab = 'avatars' | 'uploads' | 'assets' | 'cobalt'

const TAB_LABELS: Record<PickerTab, string> = {
  avatars: 'Avatars',
  uploads: 'Uploads',
  assets: 'Assets',
  cobalt: 'Cobalt',
}

function assetLabel(asset: PublicAsset): string {
  const date = new Date(asset.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
  const source = asset.source === 'social' ? 'Cobalt' : asset.source === 'generated' ? 'Render' : 'Asset'
  const dimensions = asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : ''
  return `${source}${dimensions} · ${date}`
}

function assetItem(asset: PublicAsset): ReferenceItem {
  return { id: asset.id, name: assetLabel(asset), url: asset.url }
}

export function ReferencePicker({
  title,
  allowAvatars,
  existingIds,
  max,
  onClose,
  onConfirm,
}: {
  title: string
  allowAvatars: boolean
  existingIds: string[]
  max: number
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
  const fileRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const library = useQuery({
    queryKey: ['reference-library'],
    queryFn: () => loadReferenceLibrary(),
    staleTime: 30_000,
  })

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const existing = new Set(existingIds)
  const pickedCount = referenceImageCount(picked)
  const allAssets = library.data?.assets ?? []
  const groups: Record<PickerTab, ReferenceItem[]> = {
    avatars: (library.data?.avatars ?? []).map((avatar) => ({
      id: avatar.id,
      name: avatar.name,
      url: avatar.url,
      assetIds: avatar.assetIds,
      avatar: true,
    })),
    uploads: allAssets.filter((asset) => asset.source === 'upload').map(assetItem),
    assets: allAssets
      .filter((asset) => asset.source === 'generated' || asset.source === 'studio')
      .map(assetItem),
    cobalt: allAssets.filter((asset) => asset.source === 'social').map(assetItem),
  }
  const order: PickerTab[] = allowAvatars
    ? ['avatars', 'uploads', 'assets', 'cobalt']
    : ['uploads', 'assets', 'cobalt']
  const defaultTab = order[0] ?? 'uploads'
  const preferred = selectedTab ?? defaultTab
  const tab =
    selectedTab !== null || groups[preferred].length > 0
      ? preferred
      : (order.find((entry) => groups[entry].length > 0) ?? preferred)
  const tabs = order
  const pickedAssetIds = new Set(picked.flatMap((item) => item.assetIds ?? [item.id]))
  const visible = groups[tab].filter((item) => {
    if (existing.has(item.id)) return false
    if (picked.some((entry) => entry.id === item.id)) return true
    return !(item.assetIds ?? [item.id]).some((id) => pickedAssetIds.has(id))
  })

  const toggle = (item: ReferenceItem) => {
    setPicked((current) => {
      if (current.some((entry) => entry.id === item.id)) {
        return current.filter((entry) => entry.id !== item.id)
      }
      if (referenceImageCount(current) + (item.assetIds?.length ?? 1) > max) return current
      return appendReferences(current, [item], max)
    })
  }

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
          asset?: { id: string; url: string; kind: string }
          error?: string
        } | null
        if (!response.ok || !payload?.asset) {
          throw new Error(payload?.error ?? 'Upload failed')
        }
        if (payload.asset.kind === 'image' && !pickedAssetIds.has(payload.asset.id)) {
          next.push({
            id: payload.asset.id,
            name: `Upload · ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
            url: payload.asset.url,
          })
        }
      }
      setPicked((current) => appendReferences(current, next, max))
      await library.refetch()
      setSelectedTab('uploads')
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed')
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
        .map(assetItem)
        .filter(
          (item) =>
            !existing.has(item.id) &&
            !pickedAssetIds.has(item.id) &&
            !picked.some((entry) => entry.id === item.id),
        )
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
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div
      className="bg-ink/35 fixed inset-0 z-[70] flex items-center justify-center p-3 backdrop-blur-sm md:p-8"
      onClick={onClose}
    >
      <div
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
            className="text-ink/40 hover:bg-ink/5 hover:text-ink ml-auto grid size-8 place-items-center rounded-lg"
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
                'shrink-0 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium transition-colors',
                tab === entry ? 'bg-ink text-canvas' : 'text-ink/50 hover:text-ink',
              )}
            >
              {TAB_LABELS[entry]}
              <span className={cn('ml-1.5 text-[9.5px]', tab === entry ? 'text-canvas/55' : 'text-ink/30')}>
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
                className="bg-ink text-canvas hover:bg-ink/90 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[11.5px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-35"
              >
                {importing ? <Loader2 size={13} className="animate-spin" /> : null}
                Import
              </button>
            </div>
            <p className={cn('mt-1 text-[10px]', importError ? 'text-error' : 'text-ink/30')}>
              {importError ?? 'Cobalt downloads the post into assets. Multi-image posts become a folder.'}
            </p>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {library.isLoading ? (
            <div className="text-ink/40 grid h-full place-items-center">
              <Loader2 size={20} className="animate-spin" />
            </div>
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
              {visible.map((item) => {
                const selected = picked.some((entry) => entry.id === item.id)
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggle(item)}
                    disabled={!selected && pickedCount + (item.assetIds?.length ?? 1) > max}
                    aria-pressed={selected}
                    className={cn(
                      'group border-line bg-canvas/40 relative overflow-hidden rounded-xl border text-left transition-colors disabled:opacity-40',
                      selected ? 'border-accent ring-accent/20 ring-2' : 'hover:border-ink/25',
                    )}
                  >
                    <div className="aspect-square overflow-hidden">
                      <img
                        src={item.url}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      />
                    </div>
                    <span className="text-ink/55 block truncate px-2 py-1.5 text-[10px]">{item.name}</span>
                    <span
                      className={cn(
                        'absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full border transition-colors',
                        selected
                          ? 'border-accent bg-accent text-white'
                          : 'border-line bg-surface/80 text-transparent',
                      )}
                    >
                      <Check size={11} />
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="border-line flex flex-col gap-1.5 border-t px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading || pickedCount >= max}
              className="border-line bg-canvas/50 text-ink/60 hover:text-ink inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[12px] font-medium transition-colors disabled:opacity-40"
            >
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              Upload
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => void uploadFiles(event.target.files)}
            />
            <p className="text-ink/40 text-[10.5px]">
              {Number.isFinite(max)
                ? `${picked.length} selected · ${pickedCount} of ${max} image slot${max === 1 ? '' : 's'} used`
                : `${picked.length} selected`}
            </p>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="border-line bg-surface text-ink/60 hover:text-ink h-9 rounded-xl border px-3 text-[12px] font-medium"
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
                className="bg-accent hover:bg-accent/90 h-9 rounded-xl px-3.5 text-[12px] font-medium text-white transition-colors disabled:pointer-events-none disabled:opacity-35"
              >
                Add {picked.length > 0 ? picked.length : ''}
              </button>
            </div>
          </div>
          {uploadError ? <p className="text-error text-[10.5px]">{uploadError}</p> : null}
        </div>
      </div>
    </div>
  )
}
