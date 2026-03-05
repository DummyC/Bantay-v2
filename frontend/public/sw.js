const CACHE_NAME = 'bantay-static-v2'
const ASSETS = [
  '/',
  '/index.html',
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

  const isNavigation = event.request.mode === 'navigate' || event.request.destination === 'document'

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached
      return fetch(event.request).catch(() => (isNavigation ? caches.match('/index.html') : caches.match('/')))
    }),
  )
})