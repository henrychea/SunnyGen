import { useQueryClient } from '@tanstack/react-query'
import { cn, toast } from '@sunnygen/ui'
import { useState } from 'react'
import { NSFW_MODE_KEY, applyNsfwTheme, useNsfwMode } from '~/lib/nsfw-mode'
import { setNsfwMode } from '~/server/nsfw.functions'
import { NsfwSweep } from './nsfw-sweep'

export function NsfwToggle() {
  const client = useQueryClient()
  const enabled = useNsfwMode()
  const [sweep, setSweep] = useState(false)
  const [busy, setBusy] = useState(false)

  const toggle = async () => {
    const next = !enabled
    setBusy(true)
    try {
      await setNsfwMode({ data: { enabled: next } })
      applyNsfwTheme(next)
      client.setQueryData(NSFW_MODE_KEY, next)
      await client.invalidateQueries()
      if (next) setSweep(true)
      toast(next ? 'NSFW mode on. Uncensored models unlocked.' : 'NSFW mode off. Safe mode restored.', {
        tone: next ? 'warning' : 'info',
      })
    } catch (error) {
      applyNsfwTheme(enabled)
      toast(error instanceof Error ? error.message : 'Could not change the mode', { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={busy}
        onClick={toggle}
        className="border-line-strong bg-canvas/60 hover:bg-ink/[0.04] flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors duration-150"
      >
        <span aria-hidden="true" className="text-[18px] leading-none">
          😈
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-ink block text-[12.5px] font-medium">Unlock adult content</span>
          <span className="text-ink/65 block text-[11.5px]">
            {enabled
              ? 'NSFW mode is on: provider safety filters are off and uncensored models are available.'
              : 'Safe mode: provider safety filters stay as they are and uncensored models are hidden.'}
          </span>
        </span>
        <span
          aria-hidden="true"
          className={cn(
            'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-150',
            enabled ? 'bg-accent' : 'bg-ink/15',
          )}
        >
          <span
            className={cn(
              'bg-surface absolute top-0.5 left-0.5 size-5 rounded-full transition-transform duration-150 ease-out',
              enabled && 'translate-x-5',
            )}
          />
        </span>
      </button>
      <NsfwSweep active={sweep} onDone={() => setSweep(false)} />
    </>
  )
}
