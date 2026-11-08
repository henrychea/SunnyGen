import { useEffect } from 'react'

export function PwaRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    if (!import.meta.env.PROD) {
      // A production service worker can serve a stale shell against the dev server.
      void navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) void registration.unregister()
      })
      return
    }

    let cancelled = false
    const register = () => {
      if (cancelled) return
      void navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch((error) => console.warn('[pwa] service worker registration failed', error))
    }

    if (document.readyState === 'complete') {
      register()
      return () => {
        cancelled = true
      }
    }

    window.addEventListener('load', register, { once: true })
    return () => {
      cancelled = true
      window.removeEventListener('load', register)
    }
  }, [])

  return null
}
