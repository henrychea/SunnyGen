import { useMemo, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { GroupCard, JobCard, OutputCard, WallModal, type WallCard } from '~/components/home/wall-cards'
import { buildWallEntries } from '~/lib/wall-groups'
import type { FolderNode, GenerationWallItem } from '~/server/library.functions'

const MAX_ENTRIES = 6

export function StudioWall({
  generations,
  folders,
}: {
  generations: GenerationWallItem[]
  folders: FolderNode[]
}) {
  const [modal, setModal] = useState<{ title: string; cards: WallCard[]; folderId?: string } | null>(null)
  const entries = useMemo(
    () => buildWallEntries(generations, folders).slice(0, MAX_ENTRIES),
    [generations, folders],
  )
  const active = generations.filter(
    (generation) => generation.status === 'queued' || generation.status === 'running',
  ).length
  const failed = generations.filter((generation) => generation.status === 'failed').length

  return (
    <section aria-label="Studio wall" className="mb-5">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-ink/45 text-[11px] font-semibold tracking-[0.08em] uppercase">Studio wall</h2>
        <span className="text-ink/35 text-[10.5px] tabular-nums">
          {generations.length} {generations.length === 1 ? 'render' : 'renders'}
          {active > 0 ? ` · ${active} active` : ''}
          {failed > 0 ? ` · ${failed} failed` : ''}
        </span>
      </div>

      {entries.length === 0 ? (
        <p className="border-line bg-surface/40 text-ink/40 rounded-xl border border-dashed px-3 py-4 text-[11px]">
          Angles, garment prep, scene prep, and avatar sheets land here as they render.
        </p>
      ) : (
        <div className="flex max-h-[46dvh] flex-wrap content-start gap-3 overflow-y-auto pr-1">
          <AnimatePresence initial={false} mode="popLayout">
            {entries.map((entry) => {
              if (entry.type === 'job') {
                return <JobCard key={entry.generation.id} generation={entry.generation} />
              }
              if (entry.type === 'group') {
                return (
                  <GroupCard
                    key={entry.id}
                    title={entry.title}
                    count={entry.cards.length}
                    failed={
                      entry.cards.filter((card) => card.type === 'job' && card.generation.status === 'failed')
                        .length
                    }
                    outputs={entry.outputs}
                    onOpen={() =>
                      setModal({ title: entry.title, cards: entry.cards, folderId: entry.folderId })
                    }
                  />
                )
              }
              return (
                <OutputCard
                  key={entry.output.id}
                  generation={entry.generation}
                  output={entry.output}
                  onOpen={() =>
                    setModal({
                      title: entry.generation.prompt || entry.generation.model,
                      cards: [{ type: 'output', generation: entry.generation, output: entry.output }],
                    })
                  }
                />
              )
            })}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {modal ? (
          <WallModal
            key="studio-wall-modal"
            title={modal.title}
            cards={modal.cards}
            folderId={modal.folderId}
            onClose={() => setModal(null)}
          />
        ) : null}
      </AnimatePresence>
    </section>
  )
}
