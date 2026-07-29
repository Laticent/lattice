// A dynamic import that failed to LOAD — and, deliberately, nothing more than that (#1242).
//
// WHAT WE CAN KNOW. Every engine reports every load failure with the same words. Measured
// on real Chromium 1194 and WebKit 2215, a 404, a 403, a 500, and being OFFLINE all reject
// with byte-identical messages:
//   Chromium  TypeError: Failed to fetch dynamically imported module: <url>
//   WebKit    TypeError: Importing a module script failed.
// So the cause is NOT recoverable from the error. An earlier cut of this shipped a card
// asserting "a newer version shipped while this tab was open"; on a train, in a tunnel,
// that is a confident falsehood — and this site's service worker exists precisely so the
// Studio survives a dropped connection (2026-07-02-docs-pwa.md), which makes offline a
// SUPPORTED state, not an edge case. Say what is observable ("part of the app didn't
// load") and let `navigator.onLine` add the one distinction the platform does give us.
//
// WHY IT HAPPENS AT ALL. lattice.style is GitHub Pages (`docs.yml` → `actions/deploy-pages`;
// Cloudflare Pages is PR previews only), which serves the CURRENT deployment: a previous
// deploy's `/_astro/<name>.<hash>.js` is gone. A page that already loaded is fine — it runs
// the bundle it booted with — but a long-lived tab lazy-loading something for the first
// time requests a path that no longer exists. iOS restores tabs from memory without
// re-navigating, so a phone left on the Studio for days is the ordinary case.
//
// WHY THE ONLY OFFER IS A RELOAD. Not because "a retry would re-request the dead URL" —
// measured, a retry issues ZERO further requests: the browser's module map caches the
// rejection for the document's lifetime and `React.lazy` replays it (its lazyInitializer
// stores the rejected payload and re-throws). A failed import is unretryable for EVERY
// cause, which is why the button choice does not depend on knowing the cause.

/** Each engine's wording for "the module did not load". Verified against real engines, not docs. */
const CHUNK_LOAD_PATTERNS = [
	/failed to fetch dynamically imported module/i, // Chromium / Vite
	/error loading dynamically imported module/i, // Firefox
	/importing a module script failed/i, // Safari / WebKit — the iOS case
	/unable to load module script/i, // Safari, older phrasing
	/unable to preload css/i, // Vite's CSS preload helper
	/is not a valid javascript mime type/i, // WebKit when a captive portal answers 200 + text/html
];

/**
 * True when `err` is a dynamic import that failed to LOAD — the chunk never arrived.
 *
 * Deliberately narrow. A module that loads and then throws while evaluating is a REAL bug
 * and must keep reaching the normal error path; widening this to "any error mentioning a
 * module" would relabel genuine crashes as a loading problem and hide them behind a reload
 * prompt that fixes nothing.
 */
export function isChunkLoadError(err: unknown): boolean {
	if (!err) return false;
	// Webpack-style bundlers name the error itself; Vite does not, but a consumer may wrap.
	const name = typeof err === 'object' && 'name' in err ? String((err as { name?: unknown }).name ?? '') : '';
	if (/^chunkloaderror$/i.test(name)) return true;
	const message =
		typeof err === 'string' ? err : typeof err === 'object' && 'message' in err ? String((err as { message?: unknown }).message ?? '') : '';
	if (!message) return false;
	return CHUNK_LOAD_PATTERNS.some((re) => re.test(message));
}

/**
 * User-facing copy for a failed chunk load. States only what is observable, and uses the ONE
 * signal the platform does give us to separate the two situations needing different advice:
 * reconnect, or reload.
 *
 * `online` is injectable so the branch is testable without stubbing the global.
 */
export function chunkLoadMessage(online: boolean = typeof navigator === 'undefined' || navigator.onLine !== false): string {
	return online
		? "Lattice couldn't load part of the app. Reload to continue."
		: "You're offline, so part of the app couldn't load. Reconnect, then reload.";
}

/**
 * Swap a caller's generic failure text for the accurate one when the real cause was a chunk
 * that never arrived. For the async import sites that report through a toast — they never
 * reach an ErrorBoundary, and their own copy blames the user's file, deck, or backup for
 * what is actually a stale tab or a dropped connection.
 */
export function messageForFailure(err: unknown, fallback: string): string {
	return isChunkLoadError(err) ? chunkLoadMessage() : fallback;
}
