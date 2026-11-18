import { motionFade } from '@sunnygen/ui'
import { motion } from 'motion/react'

const CARDS = [0, 1, 2, 3]

export function RoutePending() {
  return (
    <motion.div
      variants={motionFade}
      initial="hidden"
      animate="visible"
      aria-busy="true"
      aria-label="Loading page"
      className="pwa-safe-bottom h-full overflow-y-auto"
    >
      <div className="border-line/70 border-b px-6 py-6 md:px-9">
        <div className="skeleton-shimmer h-2.5 w-24 rounded-full" />
        <div className="skeleton-shimmer mt-3 h-7 w-44 rounded-lg" />
        <div className="skeleton-shimmer mt-3 h-3 w-72 max-w-full rounded-full" />
      </div>
      <div className="grid gap-5 px-6 py-6 md:px-9 lg:grid-cols-2">
        {CARDS.map((card) => (
          <div key={card} className="skeleton-shimmer h-44 rounded-2xl" />
        ))}
      </div>
    </motion.div>
  )
}
