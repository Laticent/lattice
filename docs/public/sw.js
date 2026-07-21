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
 *   • Content-hashed assets  cache-first — IMMUTABLE (the hash IS the version; a byte
 *     change ships under a NEW path). Two families: our /playground/v/<hash>/ bundle
 *     (engine, runtime, theme CSS, KaTeX, Mermaid) AND Astro's own /_astro/ build chunks
 *     (the docs pages' JS/CSS). No revalidation — this is the bulk of the cache, and
 *     re-fetching it on every reload was pure waste (the reload storm #storage surfaced).
 *   • Other same-origin assets  stale-while-revalidate (a page's inline image, the
 *     manifest, favicon — things that CAN change at a stable url).
 *     Heavy downloadables (.pdf/.pptx/.zip) are never cached — they'd blow the
 *     storage quota for artifacts the browser download manager already handles.
 *     That skip applies to BOTH branches: /gallery.pdf opens as a top-level
 *     navigation, not a subresource.
 *   • Google Fonts            stylesheet SWR; .woff2 cache-first (immutable).
 *   • Any other cross-origin  untouched (OpenRouter API calls, GitHub, …).
 *
 * VERSION only needs a bump when a caching-STRATEGY change could make an EXISTING
 * cached entry WRONG to serve (old caches are dropped on activate); content freshness
 * never depends on it. Switching versioned assets from SWR to cache-first (2026-07-21)
 * is bump-EXEMPT: it only changes HOW already-valid IMMUTABLE entries are served — none
 * becomes wrong — and a bump would force a needless one-time full re-download of the
 * whole cache (the very storm this reduces).
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
// ASSETS holds BOTH immutable families served cache-first (a single deploy is ~280 /_astro/
// chunks + ~213 /playground/v/ files ≈ 500) plus mutable SWR assets. Since cache-first no
// longer re-`put`s an asset on a hit, the FIFO trim lost the incidental "re-put moves it
// young" LRU protection SWR gave — so the cap must clear one deploy's whole immutable
// inventory with headroom, or a heavy single-session working set could FIFO-evict an
// in-use core chunk and break it OFFLINE. 800 clears ~500 + transitional cross-deploy
// overlap; the browser's own storage-pressure eviction is the real backstop. (Old-deploy
// /_astro/ orphans are NOT version-evicted — see the dispatch comment — but a new deploy's
// HTML references new hashes, so orphans are never re-requested → stay oldest-inserted →
// FIFO ages them out before current entries.)
const CAP = { [PAGES]: 60, [ASSETS]: 800, [FONTS]: 40 };
// Content-hashed asset path: `/…/playground/v/<hash>/<suffix>`. The engine
// bundle, runtime, every theme CSS, fonts, KaTeX and Mermaid all live here
// (asset-version.mjs). Capture <suffix> so a fresh-hash copy can evict every
// OLDER-hash copy of the SAME logical asset — otherwise each deploy's versions
// accumulate forever in the ASSETS cache (the FIFO cap is the only bound, and
// `activate` can't help: it runs on a SW-strategy VERSION bump, not per deploy).
const VERSIONED = /\/playground\/v\/[0-9a-f]{8,}\/(.+)$/;

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

	// VERSION EVICTION: a content-hashed asset supersedes every OTHER-hash copy of
	// the same logical asset (same <suffix>). The live page only ever references
	// the CURRENT deploy's hash, so a stale-hash sibling is dead weight the moment
	// we cache the current one — drop it. This bounds the versioned-asset footprint
	// to ~one deploy's worth no matter how many deploys the browser has seen, so
	// Cache Storage can't bloat with dead engine bundles / theme sheets across the
	// lifetime a returning user actually spans. Runs before the FIFO cap so the cap
	// is a backstop for un-versioned entries, not the only bound on versioned ones.
	//
	// LAST-WRITER-WINS across tabs: the "current" hash is whichever a put() saw most
	// recently, not a globally-pinned deploy. Two tabs straddling a deploy can evict
	// each other's same-suffix copies. These families are now CACHE-FIRST (no re-put on a
	// hit), so an evicted copy is not silently re-cached the way SWR did — but the straddling
	// tab's assets are already loaded + parsed, so the only concrete break is an OFFLINE
	// reload of that tab (online, its evicted hash is a miss → re-fetched). Narrow and
	// acceptable: a page only ever references ONE hash dir (asset-version.mjs).
	const cur = new URL(request.url).pathname.match(VERSIONED);
	if (cur) {
		for (const key of await cache.keys()) {
			if (key.url === request.url) continue;
			const stale = new URL(key.url).pathname.match(VERSIONED);
			if (stale && stale[1] === cur[1]) await cache.delete(key);
		}
	}

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
		// Content-hashed assets are IMMUTABLE: the hash IS the version, so a byte change ships
		// under a NEW path (→ a cache miss → fetched fresh). Two families qualify — OUR
		// playground bundle under /playground/v/<hash>/ (engine, runtime, themes, KaTeX,
		// Mermaid), and Astro's OWN build chunks under /_astro/ (Astro emits ONLY content-
		// hashed, immutable assets there — its long-cache dir; the docs pages' JS/CSS). For
		// both, stale-while-revalidate would re-fetch + re-`put` every one on EVERY reload for
		// nothing — the revalidation storm the storage overlay surfaced on a warm (100+ entry)
		// cache. Serve them cache-first, like the immutable gstatic .woff2: read the saved copy,
		// no network.
		//
		// EVICTION differs per family. A /playground/v/ put runs `put`'s version-eviction
		// (reaps older-hash siblings by suffix) on the cache MISS a new deploy produces — once
		// per new asset. `/_astro/` names do NOT match VERSIONED, so they get NO suffix-eviction
		// and are bounded ONLY by the ASSETS FIFO cap; that's fine because a new deploy's HTML
		// references new-hash /_astro/ URLs, so old-deploy orphans are never re-requested → stay
		// oldest-inserted → FIFO ages them out before current entries. The 800 cap (above) is
		// sized so this can't evict an in-use current chunk within one deploy.
		//
		// `/_astro/` is trusted as all-immutable — an unenforced Astro invariant (it emits only
		// content-hashed assets there). If a future Astro/integration drops a STABLE-named file
		// under /_astro/, cache-first would pin it until eviction; revisit this match then.
		if (VERSIONED.test(url.pathname) || url.pathname.startsWith('/_astro/')) {
			event.respondWith(cacheFirst(event, ASSETS));
			return;
		}
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
