const CACHE_NAME = 'bantay-static-v3'
const ASSETS = [
  '/manifest.webmanifest',
  '/icons/bantay-icon.svg',
  '/icons/bantay-logo.svg',
  '/vite.svg',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  const url = new URL(event.request.url)
  const isSameOrigin = url.origin === self.location.origin
  if (!isSameOrigin) return

  // Never cache API responses (especially /api/auth/me) to avoid stale role/session data.
  if (url.pathname.startsWith('/api/')) return

  const isNavigation = event.request.mode === 'navigate' || event.request.destination === 'document'
  const isAssetRequest = url.pathname.startsWith('/assets/')
  const isScriptLike = event.request.destination === 'script' || event.request.destination === 'worker'
  const isStyleLike = event.request.destination === 'style'
  const isStaticPublicAsset =
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/vite.svg'

  // Always prefer a fresh HTML document to avoid stale hashed bundle references.
  if (isNavigation) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy)).catch(() => {
            // ignore cache write failures
          })
          return response
        })
        .catch(async () => {
          const cachedIndex = await caches.match('/index.html')
          if (cachedIndex) return cachedIndex
          const fallbackRoot = await caches.match('/')
          return fallbackRoot || Response.error()
        }),
    )
    return
  }

  event.respondWith(
    caches.match(event.request).then(async (cached) => {
      if (cached) return cached

      const networkResponse = await fetch(event.request)

      // Never let HTML masquerade as JS/CSS module responses.
      if (isAssetRequest || isScriptLike || isStyleLike) {
        const contentType = networkResponse.headers.get('content-type') || ''
        if (contentType.includes('text/html')) {
          return new Response('', { status: 404, statusText: 'Asset not found' })
        }
      }

      if (networkResponse.ok && (isAssetRequest || isScriptLike || isStyleLike || isStaticPublicAsset)) {
        const copy = networkResponse.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {
          // ignore cache write failures
        })
      }

      return networkResponse
    }).catch(() => Response.error()),
  )
})