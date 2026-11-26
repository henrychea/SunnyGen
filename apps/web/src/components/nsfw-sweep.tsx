import { motion, useReducedMotion } from 'motion/react'

const SWEEP_MS = 0.7
const FADE_MS = 0.12

/** Entering NSFW mode plays one devil glyph across the viewport; leaving plays nothing. */
export function NsfwSweep({ active, onDone }: { active: boolean; onDone: () => void }) {
  const reduced = useReducedMotion()
  if (!active) return null

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[90] overflow-hidden">
      <motion.div
        className="bg-accent/10 absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: reduced ? [0, 1, 0] : [0, 0.9, 0] }}
        transition={{ duration: reduced ? FADE_MS : SWEEP_MS, ease: 'easeOut' }}
        onAnimationComplete={onDone}
      />
      {reduced ? null : (
        <motion.span
          className="absolute top-1/2 left-0 -translate-y-1/2 text-[92px] leading-none select-none"
          initial={{ x: '-25vw', opacity: 0, rotate: -10 }}
          animate={{ x: '115vw', opacity: [0, 1, 1, 0], rotate: 8 }}
          transition={{ duration: SWEEP_MS, ease: [0.4, 0, 0.2, 1] }}
        >
          😈
        </motion.span>
      )}
    </div>
  )
}
