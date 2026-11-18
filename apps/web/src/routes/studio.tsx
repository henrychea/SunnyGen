import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import type { StudioKind } from '@sunnygen/core'
import { Button, cn, motionFast, motionSpring, motionTransition, Skeleton } from '@sunnygen/ui'
import { PackagePlus, Plus } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
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

function StudioSkeleton({ look }: { look: boolean }) {
  if (look) {
    return (
      <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="flex flex-col gap-5">
          {[0, 1].map((index) => (
            <div key={index} className="border-line bg-surface rounded-2xl border p-4">
              <Skeleton className="h-2.5 w-24 rounded-full" />
              <Skeleton className="mt-3 h-20" />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-4">
          {[0, 1].map((index) => (
            <div key={index} className="border-line bg-surface rounded-2xl border p-4">
              <Skeleton className="h-2.5 w-16 rounded-full" />
              <Skeleton className="mt-3 h-24" />
            </div>
          ))}
        </div>
      </div>
    )
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="border-line bg-surface overflow-hidden rounded-2xl border">
          <Skeleton className="aspect-[4/3] rounded-none" />
          <div className="flex flex-col gap-2 p-3">
            <Skeleton className="h-2.5 w-2/3 rounded-full" />
            <Skeleton className="h-2 w-1/3 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

function StudioPage() {
  const initial = Route.useLoaderData()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('look')
  const [dialog, setDialog] = useState<{ kind: StudioKind; item: StudioItemDto | null } | null>(null)
  const [packOpen, setPackOpen] = useState(false)
  const [preparingId, setPreparingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dir, setDir] = useState(0)

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
  const loading = library.isPending && !data
  const refreshing = remove.isPending || prepare.isPending

  const selectTab = (next: Tab) => {
    const from = TABS.findIndex((entry) => entry.id === tab)
    const to = TABS.findIndex((entry) => entry.id === next)
    setDir(to >= from ? 1 : -1)
    setTab(next)
  }

  return (
    <PageScroll>
      <PageHeader
        eyebrow="Studio"
        title="Outfit shoots"
        description="Stack garments onto an avatar, pick a pose and scene, and render one generation per angle."
        actions={
          <AnimatePresence mode="wait" initial={false}>
            {activeKind ? (
              <motion.div
                key={activeKind}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={motionFast}
                className="flex items-center gap-2"
              >
                <Button variant="outline" onClick={() => setPackOpen(true)}>
                  <PackagePlus size={13} /> Import pack
                </Button>
                <Button onClick={() => setDialog({ kind: activeKind, item: null })}>
                  <Plus size={13} /> Add {activeKind}
                </Button>
              </motion.div>
            ) : null}
          </AnimatePresence>
        }
      />
      <PageBody>
        <div className="border-line bg-surface mb-5 inline-flex rounded-xl border p-0.5">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => selectTab(entry.id)}
              className={cn(
                'relative flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-[11px] font-medium transition-colors duration-150 ease-out active:scale-[0.96] motion-reduce:active:scale-100',
                tab === entry.id ? 'text-canvas' : 'text-ink/50 hover:text-ink',
              )}
            >
              {tab === entry.id ? (
                <motion.span
                  layoutId="studio-tab-pill"
                  transition={motionSpring}
                  className="bg-ink absolute inset-0 rounded-[10px]"
                />
              ) : null}
              <span className="relative">{entry.label}</span>
              {entry.id !== 'look' ? (
                <span
                  className={cn(
                    'relative text-[9.5px] tabular-nums',
                    tab === entry.id ? 'text-canvas/60' : 'text-ink/30',
                  )}
                >
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={counts[entry.id]}
                      initial={{ opacity: 0, y: 3 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -3 }}
                      transition={motionFast}
                      className="inline-block"
                    >
                      {counts[entry.id]}
                    </motion.span>
                  </AnimatePresence>
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <AnimatePresence initial={false}>
          {error ? (
            <motion.div
              key="studio-error"
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: 'auto', marginBottom: 16 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              transition={motionFast}
              className="overflow-hidden"
            >
              <div className="border-error/20 bg-error/5 text-error rounded-xl border px-3 py-2 text-[11.5px]">
                {error}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${tab}:${loading ? 'loading' : 'ready'}`}
            initial={dir === 0 ? { opacity: 0 } : { opacity: 0, x: dir * 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={motionTransition}
          >
            <div
              className={cn(
                'transition-opacity duration-200 ease-out',
                refreshing ? 'pointer-events-none opacity-60' : 'opacity-100',
              )}
            >
              {loading ? (
                <StudioSkeleton look={tab === 'look'} />
              ) : tab === 'look' ? (
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
            </div>
          </motion.div>
        </AnimatePresence>
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
