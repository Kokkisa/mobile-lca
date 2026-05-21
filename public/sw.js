/*
 * sw.js — Service worker for offline Tier-1 answers.
 *
 * Caches the app shell + tier1.json so the user can install the PWA
 * once on Wi-Fi and then ask prepared questions on the subway with
 * no signal. API calls (Groq, OpenAI, Anthropic) are pass-through to
 * the network — they'll fail naturally offline, and the renderer's
 * existing error handlers swallow that silently so the session loop
 * stays alive.
 *
 * Strategy:
 *   - install  → preload critical assets into the cache
 *   - activate → drop any old caches (cleanup on version bump)
 *   - fetch    → API calls bypass the SW entirely (let browser do
 *                its normal network thing); everything else uses
 *                cache-first with opportunistic backfill for assets
 *                we didn't pre-cache (Vite-hashed JS/CSS bundles).
 *
 * Cache invalidation: bump CACHE_NAME (e.g. 'lca-v2') on any deploy
 * that needs to force-refresh the cached shell or tier1.json. The
 * activate handler will purge the older cache and the next page load
 * will repopulate.
 */

const CACHE_NAME = 'lca-v1';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/tier1.json',
  '/manifest.json',
  '/icon.svg',
];

const API_HOSTS = new Set([
  'api.groq.com',
  'api.openai.com',
  'api.anthropic.com',
]);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .catch((err) => {
        // Don't fail install on a single bad asset — the SW still
        // works for opportunistic caching even with a partial preload.
        console.warn('[sw] preload partial failure:', err);
      }),
  );
  // Take control as soon as install completes instead of waiting for
  // all tabs to close — relevant during a deploy with new sw.js.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      ),
    ),
  );
  // Claim all open clients so the new SW handles their requests right
  // away, no reload required.
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only intercept GET — POST/PUT/etc to the same origin go straight
  // to network (we don't cache mutations).
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  // Pass-through for LLM / transcription APIs — they're authenticated
  // and dynamic, no useful cache fallback. Offline = the fetch rejects
  // and the renderer's catch handlers log + carry on.
  if (API_HOSTS.has(url.hostname)) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((response) => {
          // Opportunistically cache successful same-origin GETs so
          // Vite-hashed bundle files (which aren't in the precache
          // list) become available offline after the first load.
          if (
            response.ok &&
            response.type === 'basic' &&
            url.origin === self.location.origin
          ) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, cloned));
          }
          return response;
        })
        .catch(() => {
          // Network failed and no cache hit — return a synthetic
          // error response so the page can render gracefully rather
          // than throwing inside fetch().
          return new Response('Offline and uncached', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain' },
          });
        });
    }),
  );
});
