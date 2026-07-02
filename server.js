/* Parallel Universe — service worker
 *
 * Strategy (deliberately conservative so nothing breaks):
 *  - Pre-cache the static app shell (index.html, manifest, icons, translations)
 *    so the app loads instantly and works offline for the UI.
 *  - NEVER cache API calls to the backend (/generate, /chips, /speak, /places,
 *    /map, /health) — those must always hit the live server. We bypass the SW
 *    entirely for any cross-origin request and for the backend domain.
 *  - Network-first for navigation (always try fresh HTML, fall back to cache
 *    when offline) so users aren't stuck on a stale page after you deploy.
 *  - Cache-first for static assets (icons, translations.json) for speed.
 *
 * Bump CACHE_VERSION whenever you want clients to refresh the cached shell.
 */

const CACHE_VERSION = 'pu-v5';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;

// Same-origin static assets to pre-cache.
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/translations.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-512-maskable.png',
  '/apple-touch-icon.png'
];

// Install: pre-cache the shell. Don't fail the whole install if one optional
// asset 404s — cache what we can.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(async (cache) => {
      await Promise.allSettled(SHELL_ASSETS.map((url) => cache.add(url)));
    }).then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches from previous versions.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET; let everything else (POST to /generate etc.) pass through.
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch (_) {
    return;
  }

  // Bypass the SW entirely for cross-origin requests — this is the critical
  // rule that keeps the backend API, Clarity, Bing, etc. always going to the
  // network, never cached.
  if (url.origin !== self.location.origin) return;

  // Network-first for page navigations: always try fresh HTML so a new deploy
  // shows up; fall back to the cached shell only when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put('/index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    );
    return;
  }

  // Cache-first for same-origin static assets (icons, translations.json, etc.),
  // refreshing the cache in the background.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
