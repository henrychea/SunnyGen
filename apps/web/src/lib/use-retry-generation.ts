import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { GenerationKind, GenerationParams, ProviderId } from '@sunnygen/core'
import { getGenerationView, submitGeneration } from '~/server/generation.functions'
import { deleteLibraryItemFn } from '~/server/library.functions'

export interface RetryableGeneration {
  id: string
  kind: GenerationKind
  model: string
  provider: ProviderId
  prompt: string
  params: GenerationParams
  inputAssetIds: string[]
  folderId: string | null
  errorRetryable: boolean | null
}

export function useRetryGeneration() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (generation: RetryableGeneration) => {
      if (generation.errorRetryable === false) {
        throw new Error('This failure is not retryable. Revise the prompt or references.')
      }
      const view = await submitGeneration({
        data: {
          kind: generation.kind,
          model: generation.model,
          prompt: generation.prompt,
          assetIds: generation.inputAssetIds,
          params: generation.params,
          provider: generation.provider,
          folderId: generation.folderId,
        },
      })
      if (view.generation.status === 'failed') {
        await deleteLibraryItemFn({ data: { type: 'generation', id: view.generation.id } })
        throw new Error(view.generation.error ?? 'Retry failed')
      }
      await deleteLibraryItemFn({ data: { type: 'generation', id: generation.id } })
      if (view.generation.status === 'queued' || view.generation.status === 'running') {
        void (async () => {
          for (let attempt = 0; attempt < 480; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 3_000))
            const current = await getGenerationView({ data: { id: view.generation.id } })
            if (!current) break
            if (current.generation.status !== 'queued' && current.generation.status !== 'running') break
          }
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['home-generations'] }),
            queryClient.invalidateQueries({ queryKey: ['gallery'] }),
            queryClient.invalidateQueries({ queryKey: ['failures'] }),
          ])
        })()
      }
      return view
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['home-generations'] }),
        queryClient.invalidateQueries({ queryKey: ['gallery'] }),
        queryClient.invalidateQueries({ queryKey: ['failures'] }),
      ])
    },
  })
}
