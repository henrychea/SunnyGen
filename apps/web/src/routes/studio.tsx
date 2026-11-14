import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import type { StudioKind } from '@sunnygen/core'
import { Button, cn } from '@sunnygen/ui'
import { PackagePlus, Plus } from 'lucide-react'
import { PageBody, PageHeader, PageScroll } from '~/components/app-shell'
import { StudioPackDialog } from '~/components/studio/import-dialog'
import { StudioItemDialog } from '~/components/studio/item-dialog'
import { StudioLibraryGrid } from '~/components/studio/library-grid'
import { StudioLookBuilder } from '~/components/studio/look-builder'
import {
  deleteStudioItemFn,
  loadStudioLibrary,
  prepareGarmentFn,
  type StudioItemDto,
  type StudioLibrary,
} from '~/server/studio.functions'

type Tab = 'look' | 'avatars' | 'wardrobe' | 'poses' | 'scenes'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'look', label: 'Look' },
  { id: 'avatars', label: 'Avatars' },
  { id: 'wardrobe', label: 'Wardrobe' },
  { id: 'poses', label: 'Poses' },
  { id: 'scenes', label: 'Scenes' },
]

const TAB_KIND: Record<Exclude<Tab, 'look'>, StudioKind> = {
  avatars: 'avatar',
  wardrobe: 'garment',
  poses: 'pose',
  scenes: 'scene',
}

export const Route = createFileRoute('/studio')({
  loader: () => loadStudioLibrary(),
  component: StudioPage,
})

function StudioPage() {
  const initial = Route.useLoaderData()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('look')
  const [dialog, setDialog] = useState<{ kind: StudioKind; item: StudioItemDto | null } | null>(null)
  const [packOpen, setPackOpen] = useState(false)
  const [preparingId, setPreparingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const library = useQuery({
    queryKey: ['studio'],
    queryFn: () => loadStudioLibrary(),
    initialData: initial as StudioLibrary,
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteStudioItemFn({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['studio'] }),
  })

  const prepare = useMutation({
    mutationFn: (item: StudioItemDto) => prepareGarmentFn({ data: { id: item.id } }),
    onMutate: (item) => {
      setPreparingId(item.id)
      setError(null)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['studio'] }),
    onError: (prepareError) => {
      setError(prepareError instanceof Error ? prepareError.message : 'Prep failed')
    },
    onSettled: () => setPreparingId(null),
  })

  const data = library.data ?? initial
  const counts: Record<Tab, number> = {
    look: 0,
    avatars: data.avatars.length,
    wardrobe: data.garments.length,
    poses: data.poses.length,
    scenes: data.scenes.length,
  }

  const activeKind = tab === 'look' ? null : TAB_KIND[tab]

  return (
    <PageScroll>
      <PageHeader
        eyebrow="Studio"
        title="Outfit shoots"
        description="Stack garments onto an avatar, pick a pose and scene, and render one generation per angle."
        actions={
          activeKind ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setPackOpen(true)}>
                <PackagePlus size={13} /> Import pack
              </Button>
              <Button onClick={() => setDialog({ kind: activeKind, item: null })}>
                <Plus size={13} /> Add {activeKind}
              </Button>
            </div>
          ) : null
        }
      />
      <PageBody>
        <div className="border-line bg-surface mb-5 inline-flex rounded-xl border p-0.5">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTab(entry.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-[11px] font-medium transition-colors',
                tab === entry.id ? 'bg-ink text-canvas' : 'text-ink/50 hover:text-ink',
              )}
            >
              {entry.label}
              {entry.id !== 'look' ? (
                <span className={cn('text-[9.5px]', tab === entry.id ? 'text-canvas/60' : 'text-ink/30')}>
                  {counts[entry.id]}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {error ? (
          <div className="border-error/20 bg-error/5 text-error mb-4 rounded-xl border px-3 py-2 text-[11.5px]">
            {error}
          </div>
        ) : null}

        {tab === 'look' ? (
          <StudioLookBuilder library={data} />
        ) : (
          <StudioLibraryGrid
            kind={TAB_KIND[tab]}
            items={
              tab === 'avatars'
                ? data.avatars
                : tab === 'wardrobe'
                  ? data.garments
                  : tab === 'poses'
                    ? data.poses
                    : data.scenes
            }
            onAdd={() => setDialog({ kind: TAB_KIND[tab], item: null })}
            onEdit={(item) => setDialog({ kind: TAB_KIND[tab], item })}
            onDelete={(item) => remove.mutate(item.id)}
            onPrepare={tab === 'wardrobe' ? (item) => prepare.mutate(item) : undefined}
            preparingId={preparingId}
          />
        )}

        {tab !== 'look' ? (
          <p className="text-ink/35 mt-4 text-[10.5px]">
            {tab === 'wardrobe'
              ? 'On-model and supplier photos must be prepared before a shoot. Prep costs one image generation.'
              : tab === 'avatars'
                ? 'Use the two-sheet flow: upload a character sheet and a 4×4 panel sheet.'
                : 'References only guide stance and lighting. Identity and garments come from the look.'}
          </p>
        ) : null}
      </PageBody>

      {dialog ? (
        <StudioItemDialog
          key={dialog.item?.id ?? `new-${dialog.kind}`}
          open
          onOpenChange={(open) => {
            if (!open) setDialog(null)
          }}
          kind={dialog.kind}
          item={dialog.item}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ['studio'] })}
        />
      ) : null}

      {packOpen && activeKind ? (
        <StudioPackDialog
          open
          onOpenChange={setPackOpen}
          kind={activeKind}
          onImported={() => queryClient.invalidateQueries({ queryKey: ['studio'] })}
        />
      ) : null}
    </PageScroll>
  )
}
