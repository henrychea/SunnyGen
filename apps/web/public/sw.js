const VERSION = 'sunnygen-v1'
const APP_SHELL = '/'
const OFFLINE = '/offline.html'
const PRECACHE = [
  APP_SHELL,
  OFFLINE,
  '/manifest.webmanifest',
  '/favicon.svg',
  '/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

function cacheable(response) {
  return response && response.ok && response.type === 'basic'
}

async function networkFirst(request) {
  const cache = await caches.open(VERSION)
  try {
    const response = await fetch(request)
    if (cacheable(response) && new URL(request.url).pathname === APP_SHELL) {
      cache.put(APP_SHELL, response.clone())
    }
    return response
  } catch {
    return (
      (await cache.match(request)) ??
      (await cache.match(APP_SHELL)) ??
      (await cache.match(OFFLINE)) ??
      Response.error()
    )
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(VERSION)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (cacheable(response)) cache.put(request, response.clone())
  return response
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return
  if (request.headers.has('range')) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request))
    return
  }

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(request))
  }
})
