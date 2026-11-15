import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { cleanupFailedGenerations } from '~/server/library.functions'

export function CleanupFailedButton({
  count,
  className,
}: {
  count: number
  className?: string
}) {
  const queryClient = useQueryClient()
  const cleanup = useMutation({
    mutationFn: () => cleanupFailedGenerations(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['home-generations'] }),
        queryClient.invalidateQueries({ queryKey: ['gallery'] }),
        queryClient.invalidateQueries({ queryKey: ['failures'] }),
        queryClient.invalidateQueries({ queryKey: ['folders'] }),
      ])
    },
  })

  if (count === 0) return null

  return (
    <button
      type="button"
      onClick={() => cleanup.mutate()}
      disabled={cleanup.isPending}
      title="Delete all failed generations"
      className={
        className ??
        'border-line bg-surface text-ink/45 hover:border-error/25 hover:text-error inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border px-2.5 text-[10.5px] font-medium transition-colors disabled:opacity-50'
      }
    >
      <Trash2 size={12} />
      {cleanup.isPending ? 'Cleaning…' : `Clean failed (${count})`}
    </button>
  )
}
