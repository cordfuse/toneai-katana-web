// Minimal service worker — exists to satisfy the browser's PWA install
// criteria. Chrome on Android won't show "Install app" (and "Add to home
// screen" only creates a shortcut) unless a service worker with a fetch
// handler is registered. No offline caching strategy: every request hits
// the network as normal. Add a cache strategy later if you want offline
// support.
//
// Migrating from a prior self-destruct SW: any client that still has it
// will run unregister + reload once, then on the next visit pick up THIS
// sw via the registration in app/_Home.tsx.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim())
})

// A no-op fetch handler is enough for Chrome's install criteria — the
// presence of the handler matters, not what it does. Returning nothing
// lets the request fall through to the network normally.
self.addEventListener('fetch', () => {
  // intentional no-op — network passthrough
})
