/*
 * Lattice docs-site service worker — installability + offline cache.
 *
 * Deliberately hand-rolled and dependency-free (no Workbox / vite-plugin-pwa):
 * the site deploys as a static bundle, and a RUNTIME-caching worker needs no
 * per-build precache manifest, so nothing here couples to the Astro build.
 * See engineering/decisions/2026-07-02-docs-pwa.md for the strategy choice.
 *
 * Strategies (GET only; anything else passes straight through):
 *   • Navigations (HTML)      network-first, cache fallback, then /offline/.
 *     Fresh content always wins when online — a deploy needs no SW version bump.
 *     Query-stringed navigations are served but never cached: Cache Storage
 *     ignores Cache-Control, and the OpenRouter OAuth callback (?code=…) — or
 *     any future secret-bearing URL — must not be persisted to disk.
 *   • Same-origin assets      stale-while-revalidate (CSS/JS/images/JSON/fonts).
 *     Heavy downloadables (.pdf/.pptx/.zip) are never cached — they'd blow the
 *     storage quota for artifacts the browser download manager already handles.
 *     That skip applies to BOTH branches: /gallery.pdf opens as a top-level
 *     navigation, not a subresource.
 *   • Google Fonts            stylesheet SWR; .woff2 cache-first (immutable).
 *   • Any other cross-origin  untouched (OpenRouter API calls, GitHub, …).
 *
 * VERSION only needs a bump when the caching STRATEGY changes (old caches are
 * dropped on activate); content freshness never depends on it.
 */

const VERSION = 'v1';
const PAGES = `lattice-${VERSION}-pages`;
const ASSETS = `lattice-${VERSION}-assets`;
const FONTS = `lattice-${VERSION}-fonts`;
const ALL_CACHES = [PAGES, ASSETS, FONTS];

// A DIRECTORY page, not /offline.html: Cloudflare Pages 308-redirects
// *.html to the pretty URL, and a redirected response can't be replayed for
// a navigation (redirect mode 'manual') — the fallback would break on the
// PR-preview host. /offline/ serves 200 on every host we deploy to.
const OFFLINE_URL = '/offline/';
// Never runtime-cache these: large, download-manager territory.
const SKIP_EXTENSIONS = /\.(pdf|pptx|zip)$/i;
// Per-cache entry caps — a coarse FIFO trim keeps storage bounded.
const CAP = { [PAGES]: 60, [ASSETS]: 300, [FONTS]: 40 };

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(PAGES).then((cache) => cache.add(OFFLINE_URL)).then(() => self.skipWaiting()),
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		Promise.all([
			caches
				.keys()
				.then((keys) => Promise.all(keys.filter((k) => !ALL_CACHES.includes(k)).map((k) => caches.delete(k)))),
			// Re-stash the offline fallback: install runs once per worker VERSION,
			// but storage pressure can evict the entry in between. Best-effort —
			// an activate while offline must not reject the whole event.
			caches
				.open(PAGES)
				.then((cache) => cache.add(OFFLINE_URL))
				.catch(() => {}),
		]).then(() => self.clients.claim()),
	);
});

/**
 * Cache a successful, non-opaque response and FIFO-trim the cache to its cap.
 * Redirected navigations never land here: their redirect arrives as an
 * opaqueredirect (ok === false), which the guard skips — the browser replays
 * the redirect itself, so an unreplayable response can't enter the cache.
 */
async function put(cacheName, request, response) {
	if (!response?.ok) return;
	const cache = await caches.open(cacheName);
	await cache.put(request, response);
	const keys = await cache.keys();
	let excess = keys.length - (CAP[cacheName] || 100);
	for (const key of keys) {
		if (excess <= 0) break;
		// The offline fallback is exempt: it is the FIRST-inserted pages entry,
		// so a plain FIFO trim would evict it exactly for the heavy users most
		// likely to hit an unvisited page offline.
		if (new URL(key.url).pathname === OFFLINE_URL) continue;
		await cache.delete(key);
		excess--;
	}
}

/** Network-first: fresh page when online, cached copy (or offline page) when not. */
async function networkFirst(event) {
	try {
		const response = await fetch(event.request);
		// Never persist a query-stringed URL (see the header: OAuth ?code=…).
		if (!new URL(event.request.url).search) {
			event.waitUntil(put(PAGES, event.request, response.clone()));
		}
		return response;
	} catch {
		// ignoreSearch: a query-stringed URL was deliberately not cached, but
		// its base page may be — /studio/?code=… offline still gets /studio/.
		const cached = await caches.match(event.request, { ignoreSearch: true });
		return cached || caches.match(OFFLINE_URL);
	}
}

/**
 * Stale-while-revalidate: cached copy now, refreshed copy for next time.
 * Deliberately NOT async: the revalidation must be handed to event.waitUntil()
 * while the fetch event is still being dispatched — on a cache hit respondWith
 * settles immediately, and a waitUntil() called after that throws
 * InvalidStateError, leaving the cache write without lifetime protection.
 */
function staleWhileRevalidate(event, cacheName) {
	const refresh = fetch(event.request);
	event.waitUntil(
		refresh.then((response) => put(cacheName, event.request, response.clone())).catch(() => {}),
	);
	// Double miss (nothing cached AND network down) rejects respondWith — a
	// deliberate network error, the same outcome as having no worker at all.
	return caches.match(event.request).then((cached) => cached || refresh);
}

/** Cache-first: for immutable bytes (gstatic .woff2 files never change in place). */
async function cacheFirst(event, cacheName) {
	const cached = await caches.match(event.request);
	if (cached) return cached;
	const response = await fetch(event.request);
	event.waitUntil(put(cacheName, event.request, response.clone()));
	return response;
}

self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	// Range requests (media seeks) can't be satisfied from a full-body cache entry.
	if (request.headers.has('range')) return;

	const url = new URL(request.url);
	if (!url.protocol.startsWith('http')) return;

	if (request.mode === 'navigate') {
		// Downloadables opened as top-level navigations (the gallery-PDF link)
		// must bypass the pages cache too, not just the asset branch.
		if (SKIP_EXTENSIONS.test(url.pathname)) return;
		event.respondWith(networkFirst(event));
		return;
	}

	if (url.origin === self.location.origin) {
		if (SKIP_EXTENSIONS.test(url.pathname)) return;
		event.respondWith(staleWhileRevalidate(event, ASSETS));
		return;
	}

	if (url.hostname === 'fonts.gstatic.com') {
		event.respondWith(cacheFirst(event, FONTS));
		return;
	}
	if (url.hostname === 'fonts.googleapis.com') {
		event.respondWith(staleWhileRevalidate(event, FONTS));
		return;
	}
	// Any other cross-origin request passes through untouched.
});
