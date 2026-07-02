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
 *   • Same-origin assets      stale-while-revalidate (CSS/JS/images/JSON/fonts).
 *     Heavy downloadables (.pdf/.pptx/.zip) are never cached — they'd blow the
 *     storage quota for artifacts the browser download manager already handles.
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
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => !ALL_CACHES.includes(k)).map((k) => caches.delete(k))))
			.then(() => self.clients.claim()),
	);
});

/** Cache a successful, non-opaque response and FIFO-trim the cache to its cap. */
async function put(cacheName, request, response) {
	if (!response?.ok) return;
	const cache = await caches.open(cacheName);
	await cache.put(request, response);
	const keys = await cache.keys();
	const excess = keys.length - (CAP[cacheName] || 100);
	for (let i = 0; i < excess; i++) await cache.delete(keys[i]);
}

/** Network-first: fresh page when online, cached copy (or offline page) when not. */
async function networkFirst(event) {
	try {
		const response = await fetch(event.request);
		event.waitUntil(put(PAGES, event.request, response.clone()));
		return response;
	} catch {
		const cached = await caches.match(event.request);
		return cached || caches.match(OFFLINE_URL);
	}
}

/** Stale-while-revalidate: cached copy now, refreshed copy for next time. */
async function staleWhileRevalidate(event, cacheName) {
	const cached = await caches.match(event.request);
	const refresh = fetch(event.request)
		.then((response) => {
			event.waitUntil(put(cacheName, event.request, response.clone()));
			return response;
		})
		.catch(() => cached);
	return cached || refresh;
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
