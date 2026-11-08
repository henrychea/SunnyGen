import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { HeadContent, Outlet, Scripts, createRootRouteWithContext, Link } from '@tanstack/react-router'
import { APP_NAME, APP_TAGLINE } from '@sunnygen/core'
import { AppShell } from '~/components/app-shell'
import { PwaRegister } from '~/components/pwa-register'
import '../styles.css'

interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { name: 'application-name', content: APP_NAME },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
      { name: 'apple-mobile-web-app-title', content: APP_NAME },
      { name: 'mobile-web-app-capable', content: 'yes' },
      { name: 'format-detection', content: 'telephone=no' },
      { name: 'msapplication-TileColor', content: '#A31621' },
      { title: APP_NAME },
      { name: 'description', content: APP_TAGLINE },
      { name: 'theme-color', content: '#faf6ef' },
    ],
    links: [
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
      { rel: 'icon', href: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { rel: 'icon', href: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' },
      { rel: 'manifest', href: '/manifest.webmanifest' },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFound,
})

function RootComponent() {
  const { queryClient } = Route.useRouteContext()
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <PwaRegister />
        <QueryClientProvider client={queryClient}>
          <AppShell>
            <Outlet />
          </AppShell>
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  )
}

function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="max-w-sm text-center">
        <p className="font-display text-accent text-[13px] font-semibold tracking-[0.18em] uppercase">404</p>
        <h1 className="font-display mt-3 text-2xl font-semibold">This page is not on the canvas.</h1>
        <p className="text-ink/55 mt-2 text-[13px] leading-relaxed">
          The route does not exist. Head back to the studio.
        </p>
        <Link
          to="/"
          className="bg-ink text-canvas mt-6 inline-flex h-10 items-center rounded-xl px-4 text-[13px] font-medium"
        >
          Return home
        </Link>
      </div>
    </main>
  )
}
