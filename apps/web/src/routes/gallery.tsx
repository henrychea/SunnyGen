import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { cn, Select } from '@sunnygen/ui'
import { Download, RefreshCw, Sparkles, Trash2, X } from 'lucide-react'
import { PageBody, PageHeader, PageScroll } from '~/components/app-shell'
import { GalleryCard } from '~/components/gallery-card'
import { GenerateDialog } from '~/components/generate-dialog'
import { getGenerationView, submitGeneration } from '~/server/generation.functions'
import {
  deleteLibraryItemFn,
  loadFailedGenerations,
  loadFolders,
  loadGallery,
  moveLibraryItemFn,
  type GalleryItem,
} from '~/server/library.functions'

type KindFilter = 'all' | 'image' | 'video'

export const Route = createFileRoute('/gallery')({
  component: GalleryPage,
})

function GalleryPage() {
  const [kind, setKind] = useState<KindFilter>('all')
  const [open, setOpen] = useState<GalleryItem | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [folderId, setFolderId] = useState('all')
  const queryClient = useQueryClient()

  const gallery = useQuery({
    queryKey: ['gallery', kind, folderId],
    queryFn: () =>
      loadGallery({
        data: {
          kind,
          limit: 120,
          folderId: folderId === 'all' ? undefined : folderId === 'unfiled' ? null : folderId,
        },
      }),
  })
  const folders = useQuery({ queryKey: ['folders'], queryFn: () => loadFolders() })
  const failures = useQuery({ queryKey: ['failures'], queryFn: () => loadFailedGenerations() })

  const move = useMutation({
    mutationFn: ({ item, target }: { item: GalleryItem; target: string | null }) =>
      moveLibraryItemFn({ data: { type: 'generation', id: item.id, folderId: target } }),
    onSuccess: async (_data, variables) => {
      setOpen((current) => (current ? { ...current, folderId: variables.target } : current))
      await queryClient.invalidateQueries({ queryKey: ['gallery'] })
    },
  })

  const remove = useMutation({
    mutationFn: (item: GalleryItem) => deleteLibraryItemFn({ data: { type: 'generation', id: item.id } }),
    onSuccess: async () => {
      setOpen(null)
      await queryClient.invalidateQueries({ queryKey: ['gallery'] })
    },
  })

  const retry = useMutation({
    mutationFn: async (generation: {
      id: string
      kind: 'image' | 'video'
      model: string
      provider: 'sunra' | 'fal' | 'azure' | 'codex'
      prompt: string
      params: Record<string, unknown>
      inputAssetIds: string[]
      folderId: string | null
    }) => {
      const view = await submitGeneration({
        data: {
          kind: generation.kind,
          model: generation.model,
          prompt: generation.prompt,
          assetIds: generation.inputAssetIds,
          params: generation.params,
          provider: generation.provider,
          folderId: generation.folderId,
        },
      })
      await deleteLibraryItemFn({ data: { type: 'generation', id: generation.id } })
      if (view.generation.status === 'queued' || view.generation.status === 'running') {
        void (async () => {
          for (let attempt = 0; attempt < 480; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 3_000))
            const current = await getGenerationView({ data: { id: view.generation.id } })
            if (!current) break
            if (current.generation.status !== 'queued' && current.generation.status !== 'running') break
          }
          await queryClient.invalidateQueries({ queryKey: ['gallery'] })
          await queryClient.invalidateQueries({ queryKey: ['failures'] })
        })()
      }
      return view
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['failures'] })
      await queryClient.invalidateQueries({ queryKey: ['gallery'] })
    },
  })

  const items = gallery.data ?? []

  return (
    <>
      <PageScroll>
        <PageHeader
          eyebrow="Library"
          title="Gallery"
          description="Every finished render on this machine, newest first."
          actions={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setComposerOpen(true)}
                className="bg-accent inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-[12.5px] font-medium text-white"
              >
                <Sparkles size={13} /> New render
              </button>
              <button
                type="button"
                onClick={() => gallery.refetch()}
                className="border-line bg-surface text-ink/55 hover:text-ink inline-flex size-9 items-center justify-center rounded-xl border transition-colors"
                aria-label="Refresh gallery"
              >
                <RefreshCw size={14} className={gallery.isFetching ? 'animate-spin' : undefined} />
              </button>
              <Link
                to="/canvas"
                className="bg-ink text-canvas inline-flex h-9 items-center rounded-xl px-3.5 text-[12.5px] font-medium"
              >
                Open canvas
              </Link>
            </div>
          }
        />
        <PageBody>
          {(failures.data ?? []).length > 0 ? (
            <div className="border-error/20 bg-error/[0.04] mb-5 rounded-xl border p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-error/80 text-[11px] font-semibold uppercase tracking-[0.08em]">
                  Failed lately
                </p>
                <p className="text-error/50 text-[10px]">{failures.data?.length} unfinished</p>
              </div>
              <div className="flex flex-col gap-1.5">
                {(failures.data ?? []).slice(0, 4).map((failure) => (
                  <div
                    key={failure.id}
                    className="bg-surface/70 flex items-center gap-2 rounded-lg px-2.5 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-ink/65 truncate text-[11px] font-medium">
                        {failure.model} · {failure.prompt || 'No prompt'}
                      </p>
                      <p className="text-error/70 truncate text-[10px]">
                        {failure.error ?? 'Generation failed'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => retry.mutate(failure)}
                      disabled={retry.isPending}
                      className="border-line text-ink/60 hover:text-ink rounded-md border px-2 py-1 text-[10px] font-medium"
                    >
                      Retry
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await deleteLibraryItemFn({ data: { type: 'generation', id: failure.id } })
                        await queryClient.invalidateQueries({ queryKey: ['failures'] })
                      }}
                      className="text-ink/35 hover:text-ink rounded-md px-2 py-1 text-[10px]"
                    >
                      Dismiss
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="mb-4 flex flex-wrap gap-1.5">
            {[
              { id: 'all', label: 'Everything' },
              { id: 'unfiled', label: 'Unfiled' },
              ...(folders.data ?? []).map((folder) => ({ id: folder.id, label: folder.name })),
            ].map((folder) => (
              <button
                key={folder.id}
                type="button"
                onClick={() => setFolderId(folder.id)}
                className={cn(
                  'rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors',
                  folderId === folder.id ? 'bg-ink text-canvas' : 'bg-surface text-ink/50 hover:text-ink',
                )}
              >
                {folder.label}
              </button>
            ))}
          </div>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="border-line bg-surface inline-flex rounded-xl border p-0.5">
              {(['all', 'image', 'video'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setKind(option)}
                  className={cn(
                    'rounded-[10px] px-3 py-1.5 text-[11.5px] font-medium capitalize transition-colors',
                    kind === option ? 'bg-ink text-canvas' : 'text-ink/50 hover:text-ink',
                  )}
                >
                  {option === 'all' ? 'Everything' : `${option}s`}
                </button>
              ))}
            </div>
            <p className="text-ink/40 text-[11.5px]">
              {gallery.isLoading ? 'Loading…' : `${items.length} item${items.length === 1 ? '' : 's'}`}
            </p>
          </div>

          {gallery.isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="bg-ink/[0.05] aspect-[4/5] animate-pulse rounded-2xl" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="border-line bg-surface/50 rounded-2xl border border-dashed px-6 py-20 text-center">
              <p className="font-display text-ink text-[16px] font-semibold">The wall is empty.</p>
              <p className="text-ink/50 mx-auto mt-2 max-w-sm text-[12.5px] leading-relaxed">
                Generate from the canvas or build an outfit in Studio. Finished images and videos land here.
              </p>
              <div className="mt-5 flex justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setComposerOpen(true)}
                  className="bg-accent rounded-xl px-4 py-2 text-[12.5px] font-medium text-white"
                >
                  New render
                </button>
                <Link
                  to="/studio"
                  className="border-line bg-surface rounded-xl border px-4 py-2 text-[12.5px] font-medium"
                >
                  Open Studio
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {items.map((item) => (
                <GalleryCard key={item.id} item={item} onOpen={() => setOpen(item)} />
              ))}
            </div>
          )}
        </PageBody>
      </PageScroll>

      <GenerateDialog
        open={composerOpen}
        onOpenChange={setComposerOpen}
        onGenerated={() => void queryClient.invalidateQueries({ queryKey: ['gallery'] })}
      />

      {open ? (
        <div className="bg-ink/55 fixed inset-0 z-40 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="border-line bg-surface relative flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border shadow-2xl">
            <div className="border-line flex items-center justify-between gap-3 border-b px-4 py-3">
              <div className="min-w-0">
                <p className="text-ink/75 truncate text-[12px] font-medium">{open.model}</p>
                <p className="text-ink/40 text-[10.5px]">
                  {open.provider} · {new Date(open.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <a
                  href={`${open.url}?download=1`}
                  download
                  className="text-ink/50 hover:bg-ink/5 hover:text-ink inline-flex size-8 items-center justify-center rounded-lg"
                  aria-label="Download"
                >
                  <Download size={14} />
                </a>
                <button
                  type="button"
                  onClick={() => remove.mutate(open)}
                  className="text-ink/50 hover:bg-error/10 hover:text-error inline-flex size-8 items-center justify-center rounded-lg"
                  aria-label="Delete"
                >
                  <Trash2 size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(null)}
                  className="text-ink/50 hover:bg-ink/5 hover:text-ink inline-flex size-8 items-center justify-center rounded-lg"
                  aria-label="Close"
                >
                  <X size={15} />
                </button>
              </div>
            </div>
            <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto md:grid-cols-[1.4fr_1fr]">
              <div className="bg-ink/[0.04] flex items-center justify-center p-4">
                {open.kind === 'video' ? (
                  <video src={open.url} controls autoPlay loop className="max-h-[64dvh] w-full rounded-lg" />
                ) : (
                  <img
                    src={open.url}
                    alt={open.prompt || 'Generated image'}
                    className="max-h-[64dvh] w-full rounded-lg object-contain"
                  />
                )}
              </div>
              <div className="flex flex-col gap-4 p-5">
                <div>
                  <p className="text-ink/40 text-[10.5px] font-semibold uppercase tracking-[0.09em]">
                    Prompt
                  </p>
                  <p className="text-ink/70 mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed">
                    {open.prompt || 'No prompt recorded.'}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-[11.5px]">
                  <Meta label="Kind" value={open.kind} />
                  <Meta label="Outputs" value={String(open.outputCount)} />
                  <Meta label="Provider" value={open.provider} />
                  <Meta label="Model" value={open.model} />
                </div>
                <label className="flex flex-col gap-1.5">
                  <span className="text-ink/40 text-[9.5px] font-semibold uppercase tracking-[0.08em]">
                    Folder
                  </span>
                  <Select
                    value={open.folderId ?? 'unfiled'}
                    onChange={(event) =>
                      move.mutate({
                        item: open,
                        target: event.target.value === 'unfiled' ? null : event.target.value,
                      })
                    }
                    className="h-9 text-[11.5px]"
                  >
                    <option value="unfiled">Unfiled</option>
                    {(folders.data ?? []).map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.name}
                      </option>
                    ))}
                  </Select>
                </label>
                {open.urls.length > 1 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {open.urls.map((url, index) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="border-line overflow-hidden rounded-lg border"
                      >
                        {open.kind === 'video' ? (
                          <video src={url} muted className="aspect-square w-full object-cover" />
                        ) : (
                          <img
                            src={url}
                            alt={`Output ${index + 1}`}
                            className="aspect-square w-full object-cover"
                          />
                        )}
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-line/70 bg-canvas/50 rounded-lg border px-2.5 py-2">
      <p className="text-ink/35 text-[9.5px] font-semibold uppercase tracking-[0.08em]">{label}</p>
      <p className="text-ink/70 mt-0.5 truncate text-[11.5px]">{value}</p>
    </div>
  )
}
