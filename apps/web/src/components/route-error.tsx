import { useEffect, useRef } from 'react'
import type { ErrorComponentProps } from '@tanstack/react-router'

const RELOAD_KEY = 'sunnygen:chunk-reload-at'
const RELOAD_COOLDOWN_MS = 15_000

// Vite and the router surface a missing build artifact as a failed module fetch.
// Reloading the document swaps the stale chunk map for the one the server serves now.
const CHUNK_ERROR_FRAGMENTS = [
  'Failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'Importing a module script failed',
  'Unable to preload CSS for',
  'ChunkLoadError',
]

export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return CHUNK_ERROR_FRAGMENTS.some((fragment) => error.message.includes(fragment))
}

export function reloadForFreshAssets(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? 0)
    if (Number.isFinite(last) && Date.now() - last < RELOAD_COOLDOWN_MS) return false
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    // Storage can be blocked; a single reload is still the right recovery.
  }
  window.location.reload()
  return true
}

export function installChunkRecovery() {
  if (typeof window === 'undefined') return
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadForFreshAssets()) event.preventDefault()
  })
}

export function RouteError({ error, reset }: ErrorComponentProps) {
  const chunkError = isChunkLoadError(error)
  const attempted = useRef(false)

  useEffect(() => {
    if (!chunkError || attempted.current) return
    attempted.current = true
    reloadForFreshAssets()
  }, [chunkError])

  const retry = () => {
    if (!chunkError) {
      reset()
      return
    }
    try {
      window.sessionStorage.removeItem(RELOAD_KEY)
    } catch {
      // ignore blocked storage
    }
    window.location.reload()
  }

  return (
    <div className="grid h-full place-items-center px-6">
      <div className="max-w-sm text-center">
        <p className="font-display text-accent text-[11px] font-semibold tracking-[0.18em] uppercase">
          {chunkError ? 'New build' : 'Error'}
        </p>
        <h1 className="font-display text-ink mt-3 text-2xl font-semibold">
          {chunkError ? 'This page needs a refresh.' : 'Something went wrong.'}
        </h1>
        <p className="text-ink/55 mt-2 text-[13px] leading-relaxed">
          {chunkError
            ? 'SunnyGen was updated while this tab was open. Reload to load the current files.'
            : 'The page could not be rendered. Try again, or head back to the studio.'}
        </p>
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={retry}
            className="bg-accent inline-flex h-10 items-center rounded-xl px-4 text-[13px] font-medium text-white"
          >
            Reload
          </button>
          <a
            href="/"
            className="border-line bg-surface text-ink hover:border-ink/25 inline-flex h-10 items-center rounded-xl border px-4 text-[13px] font-medium"
          >
            Return home
          </a>
        </div>
        {!chunkError ? (
          <details className="text-ink/40 mt-6 text-left text-[11.5px]">
            <summary className="cursor-pointer select-none">Details</summary>
            <pre className="mt-2 overflow-auto whitespace-pre-wrap">
              {error instanceof Error ? error.message : String(error)}
            </pre>
          </details>
        ) : null}
      </div>
    </div>
  )
}
