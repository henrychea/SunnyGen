import { Copy, RotateCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useRetryGeneration, type RetryableGeneration } from '~/lib/use-retry-generation'

export function FailureActions({
  generation,
  className,
}: {
  generation: RetryableGeneration & {
    error?: string | null
    errorCode?: string | null
    errorReason?: string | null
  }
  className?: string
}) {
  const retry = useRetryGeneration()
  const [copied, setCopied] = useState(false)
  const retryable = generation.errorRetryable !== false

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2_000)
    return () => window.clearTimeout(timer)
  }, [copied])

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(generation.prompt)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-1.5">
        {generation.errorCode || generation.errorReason ? (
          <span className="bg-error/10 text-error/75 max-w-full truncate rounded px-1.5 py-0.5 text-[9px] font-semibold">
            {[generation.errorCode, generation.errorReason].filter(Boolean).join(' · ')}
          </span>
        ) : null}
        {retryable ? (
          <button
            type="button"
            onClick={() => retry.mutate(generation)}
            disabled={retry.isPending}
            className="border-line text-ink/60 hover:border-ink/25 hover:text-ink inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[10px] font-medium disabled:opacity-50"
          >
            <RotateCw size={11} className={retry.isPending ? 'animate-spin' : undefined} />
            {retry.isPending ? 'Retrying…' : 'Retry'}
          </button>
        ) : (
          <button
            type="button"
            onClick={copyPrompt}
            className="border-line text-ink/60 hover:border-ink/25 hover:text-ink inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[10px] font-medium"
          >
            <Copy size={11} /> {copied ? 'Copied' : 'Copy prompt'}
          </button>
        )}
      </div>
      {!retryable ? (
        <p className="text-error/60 mt-1 text-[9.5px] leading-snug">
          Not retryable. Revise the prompt or references first.
        </p>
      ) : null}
      {retry.error ? (
        <p className="text-error/70 mt-1 line-clamp-2 text-[9.5px] leading-snug">
          {retry.error instanceof Error ? retry.error.message : 'Retry failed'}
        </p>
      ) : null}
    </div>
  )
}
