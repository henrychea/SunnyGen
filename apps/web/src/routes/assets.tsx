import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { Badge, Button, cn, DropdownMenu, DropdownMenuContent, DropdownMenuItem, Input } from '@sunnygen/ui'
import { FileAudio, FolderPlus, MoreHorizontal, Trash2, Upload, X } from 'lucide-react'
import { PageBody, PageHeader, PageScroll } from '~/components/app-shell'
import { formatBytes, formatDate } from '~/lib/format'
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
  })

  const folders = useQuery({ queryKey: ['folders'], queryFn: () => loadFolders() })

  const remove = useMutation({
    mutationFn: (asset: PublicAsset) => deleteLibraryItemFn({ data: { type: 'asset', id: asset.id } }),
    onSuccess: async () => {
      setPreview(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['assets'] }),
        queryClient.invalidateQueries({ queryKey: ['gallery'] }),
      ])
    },
  })

  const move = useMutation({
    mutationFn: ({ asset, target }: { asset: PublicAsset; target: string | null }) =>
      moveLibraryItemFn({ data: { type: 'asset', id: asset.id, folderId: target } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assets'] }),
  })

  const createFolder = useMutation({
    mutationFn: (name: string) => createFolderFn({ data: { name } }),
    onSuccess: async () => {
      setNewFolder('')
      setAddingFolder(false)
      await queryClient.invalidateQueries({ queryKey: ['folders'] })
    },
  })

  const uploadFiles = async (files: FileList | File[]) => {
    if (files.length === 0) return
    setUploading(true)
    setError(null)
    try {
      for (const file of Array.from(files)) {
        const form = new FormData()
        form.set('file', file)
        if (folderId !== ALL && folderId !== 'unfiled') form.set('folderId', folderId)
        const response = await fetch('/api/upload', { method: 'POST', body: form })
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null
          throw new Error(payload?.error ?? `Upload failed (${response.status})`)
        }
      }
      await queryClient.invalidateQueries({ queryKey: ['assets'] })
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const items = assets.data ?? []
  const folderList = folders.data ?? []

  return (
    <>
      <PageScroll>
        <PageHeader
          eyebrow="Library"
          title="Assets"
          description="Uploads and imported references, stored on disk and deduplicated by content hash."
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
          <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
            <aside className="flex flex-col gap-1">
              <FolderButton active={folderId === ALL} onClick={() => setFolderId(ALL)} label="All assets" />
              <FolderButton
                active={folderId === 'unfiled'}
                onClick={() => setFolderId('unfiled')}
                label="Unfiled"
              />
              {folderList.map((folder) => (
                <FolderButton
                  key={folder.id}
                  active={folderId === folder.id}
                  onClick={() => setFolderId(folder.id)}
                  label={folder.name}
                />
              ))}
              {addingFolder ? (
                <form
                  className="mt-1 flex gap-1.5"
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
                    className="h-8 min-w-0 text-[12px]"
                  />
                  <Button size="sm" type="submit" disabled={!newFolder.trim()}>
                    Add
                  </Button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingFolder(true)}
                  className="text-ink/40 hover:text-ink mt-1 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11.5px]"
                >
                  <FolderPlus size={13} /> New folder
                </button>
              )}
            </aside>

            <div>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="border-line bg-surface inline-flex rounded-xl border p-0.5">
                  {(['all', 'image', 'video', 'audio'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setKind(option)}
                      className={cn(
                        'rounded-[10px] px-2.5 py-1.5 text-[11px] font-medium capitalize transition-colors',
                        kind === option ? 'bg-ink text-canvas' : 'text-ink/50 hover:text-ink',
                      )}
                    >
                      {option === 'all' ? 'All' : `${option}s`}
                    </button>
                  ))}
                </div>
                <p className="text-ink/40 text-[11.5px]">{items.length} files</p>
              </div>

              {error ? (
                <div className="border-error/25 bg-error/5 text-error mb-4 rounded-xl border px-3 py-2 text-[12px]">
                  {error}
                </div>
              ) : null}

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
                  'rounded-2xl border border-dashed p-3 transition-colors',
                  dragging ? 'border-accent/50 bg-accent/[0.03]' : 'border-transparent',
                )}
              >
                {assets.isLoading ? (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <div key={index} className="bg-ink/[0.05] aspect-square animate-pulse rounded-xl" />
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
                    {items.map((asset) => (
                      <div
                        key={asset.id}
                        className="border-line bg-surface group relative overflow-hidden rounded-xl border"
                      >
                        <button
                          type="button"
                          onClick={() => setPreview(asset)}
                          className="bg-ink/[0.04] block aspect-square w-full"
                        >
                          {asset.kind === 'image' ? (
                            <img src={asset.url} alt="" loading="lazy" className="size-full object-cover" />
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
                            <p className="text-ink/55 text-[10.5px] font-medium tracking-[0.05em] uppercase">
                              {asset.mime.split('/')[1]}
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
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </PageBody>
      </PageScroll>

      {preview ? (
        <div className="bg-ink/55 fixed inset-0 z-40 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="border-line bg-surface relative w-full max-w-3xl overflow-hidden rounded-2xl border shadow-2xl">
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
                  onClick={() => remove.mutate(preview)}
                  className="text-ink/50 hover:bg-error/10 hover:text-error inline-flex size-8 items-center justify-center rounded-lg"
                  aria-label="Delete"
                >
                  <Trash2 size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="text-ink/50 hover:bg-ink/5 inline-flex size-8 items-center justify-center rounded-lg"
                  aria-label="Close"
                >
                  <X size={15} />
                </button>
              </div>
            </div>
            <div className="bg-ink/[0.04] grid place-items-center p-4">
              {preview.kind === 'image' ? (
                <img src={preview.url} alt="" className="max-h-[75dvh] rounded-lg object-contain" />
              ) : preview.kind === 'video' ? (
                <video src={preview.url} controls autoPlay className="max-h-[75dvh] rounded-lg" />
              ) : (
                <audio src={preview.url} controls className="w-full" />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

function FolderButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg px-2.5 py-1.5 text-left text-[11.5px] font-medium transition-colors',
        active ? 'bg-ink/[0.07] text-ink' : 'text-ink/50 hover:bg-ink/[0.03] hover:text-ink',
      )}
    >
      {label}
    </button>
  )
}
