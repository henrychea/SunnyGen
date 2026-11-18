import type { Transition, Variants } from 'motion/react'

export const motionFast: Transition = { duration: 0.16, ease: 'easeOut' }

export const motionTransition: Transition = { duration: 0.2, ease: 'easeOut' }

export const motionSpring: Transition = { type: 'spring', stiffness: 400, damping: 32 }

export const motionFade: Variants = {
  hidden: { opacity: 0, transition: motionFast },
  visible: { opacity: 1, transition: motionFast },
}

export const motionFadeRise: Variants = {
  hidden: { opacity: 0, y: 8, transition: motionTransition },
  visible: { opacity: 1, y: 0, transition: motionTransition },
}

export const motionPop: Variants = {
  hidden: { opacity: 0, scale: 0.97, transition: motionFast },
  visible: { opacity: 1, scale: 1, transition: motionFast },
}

export const motionList: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.008 } },
}

export const motionListItem: Variants = {
  hidden: { opacity: 0, y: 6, transition: motionFast },
  visible: { opacity: 1, y: 0, transition: motionFast },
}

export const motionSwap: Variants = {
  hidden: { opacity: 0, y: 6, transition: motionTransition },
  visible: { opacity: 1, y: 0, transition: motionTransition },
  exit: { opacity: 0, y: -4, transition: motionFast },
}

export const motionPress = 'active:scale-[0.97] motion-reduce:active:scale-100'

export const motionMountFade = 'animate-fade-in motion-reduce:animate-none'

export const motionMountRise = 'animate-rise-in motion-reduce:animate-none'
