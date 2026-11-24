import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Trash2 } from 'lucide-react'
import { cn, motionMountFade, toast } from '@sunnygen/ui'
import { cleanupFailedGenerations } from '~/server/library.functions'

export function CleanupFailedButton({ count, className }: { count: number; className?: string }) {
  const queryClient = useQueryClient()
  const cleanup = useMutation({
    mutationFn: () => cleanupFailedGenerations(),
    onSuccess: async () => {
      toast(`Cleaned ${count} failed ${count === 1 ? 'generation' : 'generations'}`, { tone: 'info' })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['home-generations'] }),
        queryClient.invalidateQueries({ queryKey: ['gallery'] }),
        queryClient.invalidateQueries({ queryKey: ['failures'] }),
        queryClient.invalidateQueries({ queryKey: ['folders'] }),
      ])
    },
    onError: (error) =>
      toast(error instanceof Error ? error.message : 'Could not clean failed generations', {
        tone: 'error',
      }),
  })

  if (count === 0) return null

  return (
    <button
      type="button"
      onClick={() => cleanup.mutate()}
      disabled={cleanup.isPending}
      title="Delete all failed generations"
      className={cn(
        className ??
          'border-line bg-surface text-ink/45 hover:border-error/25 hover:text-error inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border px-2.5 text-[10.5px] font-medium transition-[color,border-color,transform] active:scale-[0.97] disabled:opacity-50 motion-reduce:active:scale-100',
        motionMountFade,
      )}
    >
      <span key={cleanup.isPending ? 'busy' : 'idle'} className="grid place-items-center">
        {cleanup.isPending ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
      </span>
      <span key={cleanup.isPending ? 'busy-label' : 'idle-label'} className={motionMountFade}>
        {cleanup.isPending ? 'Cleaning…' : `Clean failed (${count})`}
      </span>
    </button>
  )
}
