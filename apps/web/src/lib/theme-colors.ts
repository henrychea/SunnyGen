import { useSyncExternalStore } from 'react'

export interface ThemeColors {
  accent: string
  line: string
}

const LIGHT_FALLBACK: ThemeColors = { accent: '#a31621', line: '#e8dfd3' }

let cachedKey = ''
let cached: ThemeColors = LIGHT_FALLBACK

function getSnapshot(): ThemeColors {
  if (typeof window === 'undefined') return LIGHT_FALLBACK
  const style = getComputedStyle(document.documentElement)
  const accent = style.getPropertyValue('--color-accent').trim() || LIGHT_FALLBACK.accent
  const line = style.getPropertyValue('--color-line').trim() || LIGHT_FALLBACK.line
  const key = `${accent}|${line}`
  if (key !== cachedKey) {
    cachedKey = key
    cached = { accent, line }
  }
  return cached
}

function getServerSnapshot(): ThemeColors {
  return LIGHT_FALLBACK
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => observer.disconnect()
}

export function useThemeColors(): ThemeColors {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
