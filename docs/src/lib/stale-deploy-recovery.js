// Recover an app page that booted from a STALE copy of its own HTML.
//
// THE FAILURE. lattice.style is GitHub Pages, which serves every page with
// `Cache-Control: max-age=600` (not configurable) and publishes each deploy as a complete
// snapshot, so the previous build's `/_astro/<name>.<hash>.js` chunks stop existing the moment
// a deploy lands. For up to ten minutes after that, a browser (or the CDN) can hand out the
// OLD page, which names chunks that are gone. Astro's island loader catches the failed
// `import()` and only logs it (`[astro-island] Error hydrating …`), so the island never
// mounts. On the Studio that leaves the pre-paint shell up forever: the 8s backstop that would
// clear it lives in the very bundle that failed to load. Measured in WebKit with the island
// chunk answering 404: the shell is still up after 18s, matching the owner's iPhone recording.
// A reload fixes it, which is why it reads as random.
//
// `docs/src/lib/chunk-load.ts` handles the same 404 AFTER the app is up (a lazy panel). It
// cannot help here: it ships inside the bundle that did not arrive. So this runs as an inline
// script in <head>, before any module, and needs nothing from the build.
//
// WHAT IT DOES. It watches for a failed same-origin `/_astro/*.js` load (a modulepreload link
// or a script) while the app's island has not hydrated. Then it asks the origin for a fresh
// copy of the page under a cache-busting query (no browser cache, no CDN cache). If the fresh
// page no longer names the missing chunk, this page was stale: it refreshes the browser's
// cached copy and swaps to the fresh page once. If the fresh page still names it, the deploy
// itself is broken or the visitor is offline, and a reload would fix nothing, so it does
// nothing. A per-tab guard allows one swap a minute for a given page and chunk, so it cannot
// loop, and with no sessionStorage to hold that guard it does not swap at all.
//
// It reacts only to links and scripts the PARSER inserted, i.e. the ones named in the page's
// own HTML. Vite's preload helper also adds modulepreload links at run time; those chunks are
// never in the HTML, so the fresh-page comparison could not tell a stale page from a network
// blip on one of them.
//
// The function is SELF-CONTAINED on purpose: the Astro component inlines it with
// `Function.prototype.toString`, so it must not touch anything outside its own body.

/** The query parameter the swap adds, and the boot strips again before the app reads the URL. */
export const FRESH_PARAM = '__fresh';

/**
 * @param {Window} win
 * @param {{ island: string }} opts `island` is the component name in the island's
 *   `component-url` (e.g. `StudioIsland`), used to tell whether the app has mounted.
 */
export function installStaleDeployRecovery(win, opts) {
	const PARAM = '__fresh';
	const GUARD_PREFIX = 'lattice:stale-deploy-swap:';
	const GUARD_MS = 60000;
	const doc = win.document;
	const loc = win.location;

	// A swap lands on `?__fresh=<n>`. Drop it before the app reads the URL, keeping any other
	// parameters (`?new=1`, a deck link) intact.
	try {
		const here = new URL(loc.href);
		if (here.searchParams.has(PARAM)) {
			here.searchParams.delete(PARAM);
			win.history.replaceState(win.history.state, '', here.pathname + here.search + here.hash);
		}
	} catch (_) {}

	// Parser-inserted <link>/<script> elements, collected while the document is still loading.
	// Module scripts (and so Vite's preload helper) run only after parsing ends, so nothing
	// they add lands in this set.
	const parsed = new WeakSet();
	if (doc.readyState === 'loading' && typeof win.MutationObserver === 'function') {
		const mo = new win.MutationObserver((records) => {
			for (const r of records) for (const n of r.addedNodes) if (n.tagName === 'LINK' || n.tagName === 'SCRIPT') parsed.add(n);
		});
		mo.observe(doc.documentElement, { childList: true, subtree: true });
		doc.addEventListener('readystatechange', () => {
			if (doc.readyState === 'loading') return;
			for (const r of mo.takeRecords()) for (const n of r.addedNodes) if (n.tagName === 'LINK' || n.tagName === 'SCRIPT') parsed.add(n);
			mo.disconnect();
		});
	}

	function hydrated() {
		for (const el of doc.querySelectorAll('astro-island[component-url]')) {
			if (el.getAttribute('component-url').includes(`/${opts.island}.`)) return !el.hasAttribute('ssr');
		}
		return false;
	}

	let fired = false;
	function onError(ev) {
		if (fired) return;
		const el = ev?.target;
		if (!el?.tagName || !parsed.has(el)) return;
		const tag = el.tagName.toUpperCase();
		const raw = tag === 'LINK' ? el.getAttribute('href') : tag === 'SCRIPT' ? el.getAttribute('src') : null;
		if (!raw) return;
		let url;
		try {
			url = new URL(raw, loc.href);
		} catch (_) {
			return;
		}
		if (url.origin !== loc.origin || !/^\/_astro\/[^/]+\.js$/.test(url.pathname)) return;
		// Once the app is up, a missing chunk is a lazy load, and chunk-load.ts owns that.
		if (hydrated()) return;
		if (win.navigator.onLine === false) return;
		fired = true;
		swapIfStale(url.pathname);
	}

	function swapIfStale(missing) {
		// Keyed by page and chunk, so recovering the Playground never blocks the Studio.
		const guardKey = GUARD_PREFIX + new URL(loc.href).pathname + missing;
		try {
			const last = Number(win.sessionStorage.getItem(guardKey)) || 0;
			if (Date.now() - last < GUARD_MS) return;
		} catch (_) {
			return; // no storage, no guard: never risk a reload loop
		}
		const fresh = new URL(loc.href);
		fresh.searchParams.set(PARAM, String(Date.now()));
		win.fetch(fresh.pathname + fresh.search, { cache: 'no-store', credentials: 'same-origin' })
			.then((r) => (r.ok ? r.text() : ''))
			.then((html) => {
				// No answer, or the live page still names the chunk: not a stale page.
				if (!html || html.includes(missing)) return;
				try {
					win.sessionStorage.setItem(guardKey, String(Date.now()));
				} catch (_) {
					return;
				}
				// Replace the stale copy in the browser cache, so the next plain visit to this
				// URL inside the ten minutes gets the new page rather than another swap.
				const plain = new URL(loc.href);
				plain.searchParams.delete(PARAM);
				const refresh = win.fetch(plain.pathname + plain.search, { cache: 'reload', credentials: 'same-origin' });
				const go = () => loc.replace(fresh.pathname + fresh.search + fresh.hash);
				refresh.then(go, go);
			})
			.catch(() => {});
	}

	win.addEventListener('error', onError, true);
}
