import { AnimatePresence, motion } from 'motion/react'
import { FadeImage, motionFade, motionFast, motionPop, motionSwap } from '@sunnygen/ui'
import { useEffect, useState } from 'react'
import { MediaThumbStrip } from '~/components/media-preview'
import { assetMediaKind } from '~/lib/media-kind'
import type { InputAsset } from '~/server/media.server'

function ReferenceMedia({ reference, label }: { reference: InputAsset; label: string }) {
  return (
    <div className="bg-ink/[0.03] border-line/70 flex items-center justify-center overflow-hidden rounded-xl border p-2">
      {reference.kind === 'image' ? (
        <div className="relative flex min-h-44 w-full items-center justify-center">
          <FadeImage
            shimmer
            src={reference.url}
            alt={label}
            className="relative max-h-[calc(90dvh-18rem)] w-auto max-w-full rounded-lg object-contain"
          />
        </div>
      ) : reference.kind === 'video' ? (
        <video
          src={reference.url}
          controls
          autoPlay
          loop
          playsInline
          className="max-h-[calc(90dvh-18rem)] w-auto max-w-full rounded-lg"
        />
      ) : (
        <audio src={reference.url} controls autoPlay className="w-full max-w-md" />
      )}
    </div>
  )
}

export function ReferencesModal({ references, onClose }: { references: InputAsset[]; onClose: () => void }) {
  const [index, setIndex] = useState(0)
  const safeIndex = Math.min(index, references.length - 1)
  const current = references[safeIndex]

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  if (!current) return null

  return (
    <motion.div
      variants={motionFade}
      initial="hidden"
      animate="visible"
      exit="hidden"
      className="bg-ink/70 fixed inset-0 z-[80] flex items-center justify-center p-3 backdrop-blur-sm md:p-8"
      onClick={(event) => {
        event.stopPropagation()
        onClose()
      }}
    >
      <motion.div
        variants={motionPop}
        onClick={(event) => event.stopPropagation()}
        className="border-line bg-surface flex max-h-[90dvh] w-fit max-w-[min(92vw,1000px)] min-w-[min(92vw,420px)] flex-col overflow-hidden rounded-2xl border shadow-2xl"
      >
        <div className="border-line flex items-center gap-3 border-b px-4 py-2.5">
          <div className="min-w-0">
            <h2 className="font-display text-ink text-[14px] font-semibold">References</h2>
            <p className="text-ink/35 mt-0.5 text-[10.5px]">
              {references.length} {references.length === 1 ? 'reference' : 'references'} · {safeIndex + 1} /{' '}
              {references.length}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close references"
            className="text-ink/40 hover:bg-ink/5 hover:text-ink ml-auto grid size-8 shrink-0 place-items-center rounded-lg transition-[color,background-color,transform] active:scale-90"
          >
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3 md:p-4">
          <div className="relative">
            <AnimatePresence initial={false} mode="popLayout">
              <motion.div
                key={current.id}
                variants={motionSwap}
                initial="hidden"
                animate="visible"
                exit="exit"
                transition={motionFast}
                className="w-full"
              >
                <ReferenceMedia reference={current} label={`Reference ${safeIndex + 1}`} />
              </motion.div>
            </AnimatePresence>
          </div>
          {references.length > 1 ? (
            <MediaThumbStrip
              items={references.map((reference) => ({
                ...reference,
                kind: assetMediaKind(reference.kind),
              }))}
              index={safeIndex}
              onSelect={setIndex}
              label="Choose a reference"
            />
          ) : null}
          <div className="border-line bg-canvas/40 mt-3 rounded-xl border p-3.5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="border-line/70 bg-surface/60 min-w-0 rounded-lg border px-2.5 py-2">
                <p className="text-ink/35 text-[9.5px] font-semibold tracking-[0.08em] uppercase">
                  Reference
                </p>
                <p className="text-ink/70 mt-0.5 text-[11.5px]">
                  {safeIndex + 1} of {references.length}
                </p>
              </div>
              <div className="border-line/70 bg-surface/60 min-w-0 rounded-lg border px-2.5 py-2">
                <p className="text-ink/35 text-[9.5px] font-semibold tracking-[0.08em] uppercase">Kind</p>
                <p className="text-ink/70 mt-0.5 text-[11.5px]">{current.kind}</p>
              </div>
              {current.width && current.height ? (
                <div className="border-line/70 bg-surface/60 min-w-0 rounded-lg border px-2.5 py-2">
                  <p className="text-ink/35 text-[9.5px] font-semibold tracking-[0.08em] uppercase">Size</p>
                  <p className="text-ink/70 mt-0.5 text-[11.5px]">
                    {current.width}×{current.height}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
