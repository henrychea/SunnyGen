export function RefreshError({
  message = 'Could not refresh.',
  onRetry,
}: {
  message?: string
  onRetry: () => void
}) {
  return (
    <div role="status" className="text-error flex items-center gap-2 text-[11px]">
      {message}
      <button
        type="button"
        onClick={onRetry}
        className="border-error/40 text-error hover:bg-error/[0.06] rounded-md border px-2 py-1 text-[11px] font-medium transition-colors"
      >
        Try again
      </button>
    </div>
  )
}
