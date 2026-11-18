import { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { RouteError, installChunkRecovery } from './components/route-error'
import { RoutePending } from './components/route-pending'
import { routeTree } from './routeTree.gen'

installChunkRecovery()

function ignoreSkippedViewTransitions() {
  if (typeof document === 'undefined' || typeof document.startViewTransition !== 'function') return
  const start = document.startViewTransition.bind(document)
  document.startViewTransition = (options) => {
    const transition = start(options)
    transition.ready.catch(() => {})
    return transition
  }
}

ignoreSkippedViewTransitions()

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        refetchOnWindowFocus: false,
      },
    },
  })

  return createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultViewTransition: true,
    defaultErrorComponent: RouteError,
    defaultPendingComponent: RoutePending,
    defaultPendingMs: 140,
    defaultPendingMinMs: 300,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
