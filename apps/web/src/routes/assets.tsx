import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import {
  Badge,
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  FadeImage,
  Input,
  motionFade,
  motionFadeRise,
  motionFast,
  motionPop,
  motionSpring,
  motionTransition,
  Skeleton,
  toast,
} from '@sunnygen/ui'
import { FileAudio, FolderPlus, Loader2, MoreHorizontal, Trash2, Upload, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { PageBody, PageHeader, PageScroll } from '~/components/app-shell'
import { FolderChips } from '~/components/folder-chips'
import { formatBytes, formatDate } from '~/lib/format'
import { thumbSrcSet, thumbUrl } from '~/lib/media-thumbs'
import {
  createFolderFn,
  deleteLibraryItemFn,
  loadAssets,
  loadFolders,
  moveLibraryItemFn,
} from '~/server/library.functions'
import type { PublicAsset } from '~/server/media.server'

export const Route = createFileRoute('/assets')({
  component: AssetsPage,
})

type AssetFilter = 'all' | 'image' | 'video' | 'audio'

const ALL = 'all'

function AssetsPage() {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [kind, setKind] = useState<AssetFilter>('all')
  const [folderId, setFolderId] = useState<string>(ALL)
  const [preview, setPreview] = useState<PublicAsset | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [newFolder, setNewFolder] = useState('')
  const [addingFolder, setAddingFolder] = useState(false)
  const [dir, setDir] = useState(0)

  const assets = useQuery({
    queryKey: ['assets', kind, folderId],
    queryFn: () =>
      loadAssets({
        data: {
          kind,
          source: 'all',
          folderId: folderId === ALL ? undefined : folderId === 'unfiled' ? null : folderId,
          limit: 200,
        },
      }),
    placeholderData: keepPreviousData,
  })

  const folders = useQuery({ queryKey: ['folders'], queryFn: () => loadFolders() })

  const remove = useMutation({
    mutationFn: (asset: PublicAsset) => deleteLibraryItemFn({ data: { type: 'asset', id: asset.id } }),
    onSuccess: async (_result, asset) => {
      setPreview(null)
      toast(`${asset.name ?? 'Asset'} deleted`, { tone: 'info' })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['assets'] }),
        queryClient.invalidateQueries({ queryKey: ['gallery'] }),
      ])
    },
    onError: (error) =>
      toast(error instanceof Error ? error.message : 'Could not delete the asset', { tone: 'error' }),
  })

  const move = useMutation({
    mutationFn: ({ asset, target }: { asset: PublicAsset; target: string | null }) =>
      moveLibraryItemFn({ data: { type: 'asset', id: asset.id, folderId: target } }),
    onSuccess: async (_result, { target }) => {
      const folder = target ? (folders.data ?? []).find((entry) => entry.id === target)?.name : null
      toast(folder ? `Moved to ${folder}` : 'Moved to Unfiled', { tone: 'info' })
      await queryClient.invalidateQueries({ queryKey: ['assets'] })
      await queryClient.invalidateQueries({ queryKey: ['folders'] })
    },
    onError: (error) =>
      toast(error instanceof Error ? error.message : 'Could not move the asset', { tone: 'error' }),
  })

  const createFolder = useMutation({
    mutationFn: (name: string) => createFolderFn({ data: { name } }),
    onSuccess: async (_created, name) => {
      setNewFolder('')
      setAddingFolder(false)
      toast(`${name} created`, { tone: 'info' })
      await queryClient.invalidateQueries({ queryKey: ['folders'] })
      await queryClient.invalidateQueries({ queryKey: ['assets'] })
    },
    onError: (error) =>
      toast(error instanceof Error ? error.message : 'Could not create the folder', { tone: 'error' }),
  })

  const uploadFiles = async (files: FileList | File[]) => {
    if (files.length === 0) return
    setUploading(true)
    setError(null)
    try {
      const targetFolderId = folderId !== ALL && folderId !== 'unfiled' ? folderId : null
      for (const file of Array.from(files)) {
        const form = new FormData()
        form.set('file', file)
        if (targetFolderId) form.set('folderId', targetFolderId)
        const response = await fetch('/api/upload', { method: 'POST', body: form })
        const payload = (await response.json().catch(() => null)) as {
          asset?: PublicAsset
          error?: string
        } | null
        if (!response.ok || !payload?.asset) {
          throw new Error(payload?.error ?? `Upload failed (${response.status})`)
        }
        const name = payload.asset.name ?? file.name
        toast(name === file.name ? `Uploaded ${name}` : `Uploaded as ${name}`, { tone: 'info' })
      }
      await queryClient.invalidateQueries({ queryKey: ['assets'] })
      await queryClient.invalidateQueries({ queryKey: ['folders'] })
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : 'Upload failed'
      setError(message)
      toast(message, { tone: 'error' })
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const items = assets.data ?? []
  const folderList = folders.data ?? []
  const folderEntries = [
    { id: ALL, label: 'All assets' },
    { id: 'unfiled', label: 'Unfiled' },
    ...folderList.map((folder) => ({ id: folder.id, label: folder.name })),
  ]
  const selectionKey = `${folderId}:${kind}`
  const pendingSwitch = assets.isPlaceholderData
  const [displayKey, setDisplayKey] = useState(selectionKey)
  if (!pendingSwitch && displayKey !== selectionKey) setDisplayKey(selectionKey)
  const contentState = assets.isPending ? 'loading' : items.length === 0 ? 'empty' : 'items'
  const contentKey = `${displayKey}:${contentState}`
  const pendingAssetId =
    (move.isPending ? (move.variables?.asset.id ?? null) : null) ??
    (remove.isPending ? (remove.variables?.id ?? null) : null)

  const selectFolder = (id: string) => {
    const from = folderEntries.findIndex((entry) => entry.id === folderId)
    const to = folderEntries.findIndex((entry) => entry.id === id)
    setDir(to >= from ? 1 : -1)
    setFolderId(id)
  }

  const selectKind = (next: AssetFilter) => {
    setDir(0)
    setKind(next)
  }

  return (
    <>
      <PageScroll>
        <PageHeader
          eyebrow="Library"
          title="Assets"
          description="Uploads and imported references, stored on disk."
          actions={
            <>
              <Button variant="outline" onClick={() => inputRef.current?.click()} loading={uploading}>
                <Upload size={14} /> Upload
              </Button>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept="image/*,video/*,audio/*"
                className="hidden"
                onChange={(event) => {
                  if (event.target.files) void uploadFiles(event.target.files)
                }}
              />
            </>
          }
        />
        <PageBody>
          <div className="mb-4 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <FolderChips
                  items={folderEntries}
                  activeId={folderId}
                  onSelect={selectFolder}
                  layoutId="assets-folder-pill"
                />
              </div>
              <AnimatePresence initial={false} mode="wait">
                {addingFolder ? null : (
                  <motion.button
                    key="new-folder-trigger"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={motionFast}
                    type="button"
                    onClick={() => setAddingFolder(true)}
                    className="text-ink/40 hover:text-ink flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10.5px] transition-colors active:scale-[0.98] motion-reduce:active:scale-100 sm:text-[11px]"
                  >
                    <FolderPlus size={13} /> New folder
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
            <AnimatePresence initial={false}>
              {addingFolder ? (
                <motion.form
                  key="new-folder-form"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={motionFast}
                  className="flex max-w-sm gap-1.5 overflow-hidden"
                  onSubmit={(event) => {
                    event.preventDefault()
                    if (newFolder.trim()) createFolder.mutate(newFolder.trim())
                  }}
                >
                  <Input
                    autoFocus
                    value={newFolder}
                    onChange={(event) => setNewFolder(event.target.value)}
                    placeholder="Folder name"
                    className="h-9 min-w-0 text-[12px]"
                  />
                  <Button
                    size="sm"
                    type="submit"
                    loading={createFolder.isPending}
                    disabled={!newFolder.trim()}
                    className="shrink-0"
                  >
                    Add
                  </Button>
                  <Button
                    size="sm"
                    type="button"
                    variant="ghost"
                    className="shrink-0"
                    onClick={() => {
                      setAddingFolder(false)
                      setNewFolder('')
                    }}
                  >
                    Cancel
                  </Button>
                </motion.form>
              ) : null}
            </AnimatePresence>
          </div>

          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="border-line bg-surface inline-flex rounded-xl border p-0.5">
                {(['all', 'image', 'video', 'audio'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => selectKind(option)}
                    className={cn(
                      'relative rounded-[10px] px-2.5 py-1.5 text-[11px] font-medium capitalize transition-colors duration-150 ease-out active:scale-[0.96] motion-reduce:active:scale-100',
                      kind === option ? 'text-canvas' : 'text-ink/50 hover:text-ink',
                    )}
                  >
                    {kind === option ? (
                      <motion.span
                        layoutId="assets-kind-pill"
                        transition={motionSpring}
                        className="bg-ink absolute inset-0 rounded-[10px]"
                      />
                    ) : null}
                    <span className="relative">{option === 'all' ? 'All' : `${option}s`}</span>
                  </button>
                ))}
              </div>
              <p className="text-ink/40 text-[11.5px]">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={contentState === 'items' ? `count-${items.length}` : contentState}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={motionFast}
                    className="inline-block"
                  >
                    {assets.isPending ? 'Loading…' : `${items.length} files`}
                  </motion.span>
                </AnimatePresence>
              </p>
            </div>

            <AnimatePresence initial={false}>
              {error ? (
                <motion.div
                  key="assets-error"
                  variants={motionFadeRise}
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                  className="border-error/25 bg-error/5 text-error mb-4 rounded-xl border px-3 py-2 text-[12px]"
                >
                  {error}
                </motion.div>
              ) : null}
            </AnimatePresence>

            <div
              onDragOver={(event) => {
                event.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault()
                setDragging(false)
                void uploadFiles(event.dataTransfer.files)
              }}
              className={cn(
                'relative rounded-2xl border border-dashed p-3 transition-colors duration-150 ease-out',
                dragging ? 'border-accent/50 bg-accent/[0.03]' : 'border-transparent',
              )}
            >
              <AnimatePresence>
                {dragging ? (
                  <motion.div
                    key="drop-overlay"
                    initial={{ opacity: 0, scale: 0.99 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={motionFast}
                    className="border-accent/40 bg-canvas/75 text-accent pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-2xl border border-dashed text-[12px] font-medium backdrop-blur-[1px]"
                  >
                    Drop files to upload
                  </motion.div>
                ) : null}
              </AnimatePresence>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={contentKey}
                  initial={dir === 0 ? { opacity: 0 } : { opacity: 0, x: dir * 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, transition: { duration: 0.12 } }}
                  transition={motionTransition}
                >
                  <div
                    className={cn(
                      'transition-opacity duration-200 ease-out',
                      pendingSwitch ? 'pointer-events-none opacity-55' : 'opacity-100',
                    )}
                  >
                    {assets.isPending ? (
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {Array.from({ length: 6 }).map((_, index) => (
                          <div
                            key={index}
                            className="border-line bg-surface overflow-hidden rounded-xl border"
                          >
                            <Skeleton className="aspect-square rounded-none" />
                            <div className="flex items-center justify-between gap-2 px-2.5 py-2">
                              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                                <Skeleton className="h-2 w-1/3 rounded-full" />
                                <Skeleton className="h-2 w-2/3 rounded-full" />
                              </div>
                              <Skeleton className="size-4 rounded" />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : items.length === 0 ? (
                      <div className="border-line bg-surface/50 rounded-2xl border border-dashed px-6 py-20 text-center">
                        <p className="font-display text-[15px] font-semibold">No assets here.</p>
                        <p className="text-ink/50 mt-2 text-[12.5px]">
                          Drop files anywhere in this panel or use Upload.
                        </p>
                      </div>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        <AnimatePresence initial={false}>
                          {items.map((asset) => (
                            <motion.div
                              key={asset.id}
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.98 }}
                              transition={motionFast}
                              className="border-line bg-surface group hover:border-ink/20 relative overflow-hidden rounded-xl border transition-[border-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5"
                            >
                              <button
                                type="button"
                                onClick={() => setPreview(asset)}
                                className="bg-ink/[0.04] relative block aspect-square w-full transition-transform duration-200 ease-out active:scale-[0.985] motion-reduce:active:scale-100"
                              >
                                {asset.kind === 'image' ? (
                                  <FadeImage
                                    shimmer
                                    src={thumbUrl(asset.url, 640)}
                                    srcSet={thumbSrcSet(asset.url, [320, 640])}
                                    sizes="(min-width: 1280px) 300px, (min-width: 640px) 45vw, 92vw"
                                    alt=""
                                    loading="lazy"
                                    decoding="async"
                                    className="size-full object-cover"
                                  />
                                ) : asset.kind === 'video' ? (
                                  <video
                                    src={asset.url}
                                    muted
                                    loop
                                    playsInline
                                    preload="metadata"
                                    className="size-full object-cover"
                                  />
                                ) : (
                                  <span className="text-ink/30 grid size-full place-items-center">
                                    <FileAudio size={32} strokeWidth={1.4} />
                                  </span>
                                )}
                              </button>
                              <div className="flex items-center justify-between gap-1 px-2.5 py-2">
                                <div className="min-w-0">
                                  <p className="text-ink/70 truncate text-[11px] font-medium">
                                    {asset.name ?? asset.mime.split('/')[1]?.toUpperCase() ?? asset.mime}
                                  </p>
                                  <p className="text-ink/35 text-[10px]">
                                    {formatBytes(asset.byteSize)} · {formatDate(asset.createdAt)}
                                  </p>
                                </div>
                                <DropdownMenu.Root>
                                  <DropdownMenu.Trigger className="text-ink/40 hover:bg-ink/5 hover:text-ink inline-flex size-7 items-center justify-center rounded-md outline-none">
                                    <MoreHorizontal size={14} />
                                  </DropdownMenu.Trigger>
                                  <DropdownMenuContent>
                                    <DropdownMenuItem onClick={() => move.mutate({ asset, target: null })}>
                                      Move to unfiled
                                    </DropdownMenuItem>
                                    {folderList.map((folder) => (
                                      <DropdownMenuItem
                                        key={folder.id}
                                        onClick={() => move.mutate({ asset, target: folder.id })}
                                      >
                                        Move to {folder.name}
                                      </DropdownMenuItem>
                                    ))}
                                    <DropdownMenuItem
                                      onClick={() => remove.mutate(asset)}
                                      className="text-error data-[highlighted]:bg-error/10 data-[highlighted]:text-error"
                                    >
                                      <Trash2 size={12} /> Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu.Root>
                              </div>
                              <AnimatePresence initial={false}>
                                {pendingAssetId === asset.id ? (
                                  <motion.span
                                    key="asset-pending"
                                    variants={motionFade}
                                    initial="hidden"
                                    animate="visible"
                                    exit="hidden"
                                    className="bg-canvas/55 text-ink/50 pointer-events-none absolute inset-0 z-20 grid place-items-center"
                                  >
                                    <Loader2 size={16} className="animate-spin" />
                                  </motion.span>
                                ) : null}
                              </AnimatePresence>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </PageBody>
      </PageScroll>

      <AnimatePresence>
        {preview ? (
          <motion.div
            key="asset-preview"
            variants={motionFade}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="bg-ink/55 fixed inset-0 z-40 flex items-center justify-center p-4 backdrop-blur-sm"
          >
            <motion.div
              variants={motionPop}
              className="border-line bg-surface relative w-full max-w-3xl overflow-hidden rounded-2xl border shadow-2xl"
            >
              <div className="border-line flex items-center justify-between border-b px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Badge tone="neutral">{preview.kind}</Badge>
                  <span className="text-ink/45 text-[11px]">
                    {formatBytes(preview.byteSize)}
                    {preview.width && preview.height ? ` · ${preview.width}×${preview.height}` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(preview)}
                    className="text-ink/50 hover:bg-error/10 hover:text-error inline-flex size-8 items-center justify-center rounded-lg transition-[color,background-color,scale] duration-150 ease-out active:scale-[0.94] disabled:opacity-60 motion-reduce:active:scale-100"
                    aria-label="Delete"
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span
                        key={remove.isPending ? 'removing' : 'delete'}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={motionFast}
                        className="inline-flex"
                      >
                        {remove.isPending ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Trash2 size={14} />
                        )}
                      </motion.span>
                    </AnimatePresence>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreview(null)}
                    className="text-ink/50 hover:bg-ink/5 inline-flex size-8 items-center justify-center rounded-lg transition-[color,background-color,scale] duration-150 ease-out active:scale-[0.94] motion-reduce:active:scale-100"
                    aria-label="Close"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>
              <div className="bg-ink/[0.04] grid place-items-center p-4">
                {preview.kind === 'image' ? (
                  <FadeImage
                    shimmer
                    src={preview.url}
                    alt=""
                    className="max-h-[75dvh] rounded-lg object-contain"
                  />
                ) : preview.kind === 'video' ? (
                  <video src={preview.url} controls autoPlay className="max-h-[75dvh] rounded-lg" />
                ) : (
                  <audio src={preview.url} controls className="w-full" />
                )}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  )
}
