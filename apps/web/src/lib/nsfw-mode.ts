import { useQuery } from '@tanstack/react-query'
import { loadNsfwMode } from '~/server/nsfw.functions'

export const NSFW_MODE_KEY = ['nsfw-mode'] as const

export function useNsfwMode(): boolean {
  const query = useQuery({
    queryKey: NSFW_MODE_KEY,
    queryFn: () => loadNsfwMode(),
    staleTime: 60_000,
  })
  return query.data === true
}

/** The NSFW palette owns the whole token set, so it replaces the theme rather than layering. */
export function applyNsfwTheme(enabled: boolean): void {
  const root = document.documentElement
  if (enabled) root.dataset.theme = 'nsfw'
  else delete root.dataset.theme
}
