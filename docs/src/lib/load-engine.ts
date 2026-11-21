// Shared on-demand loader for the irreducible Lattice render engine
// (window.LatticePlayground). WRAP, DON'T REINVENT — this never reimplements the
// engine; it only controls *when* it loads.
//
// TWO SHAPES (2026-10-14, engineering/decisions/2026-10-14-engine-spine.md). The docs
// site loads the ESM engine, `…/esm/engine.js`, with `import()`: its chart kernels are
// separate modules (ensure-charts.ts), and it preloads its own static chunks from
// `esm/chunks.json` so the module graph is not discovered one round trip per level.
// The single-file `lattice-playground.js` still loads as a classic <script>, for the
// tools and fixtures that hand it one. Either way the engine sets
// `window.LatticePlayground`, and `engine-base.ts` records where it came from so its
// sibling assets (KaTeX, grammars, plugin data, chart kernels) resolve beside it.
//
// The shadcn migration loaded this bundle EAGERLY via `<script defer src>` in
// the <head> of every app page, so it competed with first paint and tanked
// mobile LCP even though the live preview is below the fold (landing) or after
// first paint (playground/studio). This module injects the same script
// ON DEMAND — the first time a surface actually needs the engine (island in
// view, app mounted, idle) — and resolves once `window.LatticePlayground` is
// set. The existing bridges/studios already poll for that global and tolerate
// it arriving late, so deferring the injection is safe.
//
// Idempotent: a module-level singleton keyed by URL. Concurrent or repeated
// callers share one <script> and one Promise; if the engine is already present
// (e.g. another surface, or a re-mount) it resolves immediately.

// `window.LatticePlayground` is declared once, canonically, in playground-global.d.ts.

import { ENGINE_ENTRY, engineBaseFor, recordEngineUrl, scriptTagFor } from './engine-base';
import { preloadEntry } from './ensure-charts';
import { installPreviewDrawHost } from './preview-draw-host';

// One in-flight/settled promise per engine URL (URLs are content-hashed, so a
// single page only ever sees one). Survives React StrictMode double-mounts and
// multiple islands on the same page.
const loaders = new Map<string, Promise<void>>();
/** How many times each engine URL's import has failed, so a retry asks for a URL the browser has not cached (below). */
const failedImports = new Map<string, number>();
/** The module loader, swappable for tests only: a bare `import()` cannot be intercepted in a unit test. */
const importEngine = (src: string): Promise<unknown> => import(/* @vite-ignore */ src);
let importModule: (src: string) => Promise<unknown> = importEngine;
/** Test hook: replace the module loader, and forget past failures and loaders. Not for product code. */
export function __setEngineImportForTests(fn: ((src: string) => Promise<unknown>) | null): void {
	importModule = fn ?? importEngine;
	failedImports.clear();
	loaders.clear();
}

const POLL_MS = 50;

/**
 * Ensure the engine bundle at `url` is loaded; resolve once
 * `window.LatticePlayground` is available.
 *
 * - First call injects `<script src=url defer>` into <head> and polls for the
 *   global (the bundle sets it synchronously on execute, but a `defer` script
 *   executes after the injecting task, so we poll rather than rely on `onload`
 *   alone — and `onload` may not fire if the bundle is already cached + parsed).
 * - Later calls (any surface) return the SAME promise.
 * - Resolves immediately if the engine is already present.
 */
export function ensureEngine(url: string): Promise<void> {
	if (typeof window === 'undefined') return Promise.resolve();
	// The engine is same-origin. The barrier is INLINE at the sink because CodeQL js/xss-through-dom reads it here and
	// not through a helper: an empty URL, or one holding a quote, angle bracket, backtick, backslash or
	// whitespace, is refused; the rest is resolved and refused unless it shares this page's origin AND
	// scheme (which also turns away `javascript:`, `data:` and a same-origin `blob:`). Only the resolved
	// href reaches the sink.
	let resolved: URL | null = null;
	try {
		if (url && !/[<>"'`\\\s]/.test(url)) resolved = new URL(url, window.location.href);
	} catch {
		// an unparseable URL is refused just below
	}
	if (resolved === null || resolved.origin !== window.location.origin || resolved.protocol !== window.location.protocol) return Promise.reject(new Error(`lattice engine URL refused: ${url}`));
	const safeSrc = resolved.href;
	// Record only a URL that passed the barrier: the asset directory it names feeds other loaders (the code
	// formatter's import() among them), so a refused URL recorded first would overwrite a good base.
	recordEngineUrl(safeSrc);
	// Every surface that shows a preview loads the engine here, so this is where the page offers its frames a draw host.
	installPreviewDrawHost();
	if (window.LatticePlayground) return Promise.resolve();

	const existing = loaders.get(url);
	if (existing) return existing;

	const base = engineBaseFor(url);
	if (base && url.endsWith(ENGINE_ENTRY)) {
		void preloadEntry(base, 'engine.js');
		// A FAILED import() IS CACHED BY THE BROWSER for the page's lifetime (the module map keeps the failure), so
		// importing the same URL again rejects at once without a fetch: measured on Chromium, WebKit and Gecko, the
		// preview's Retry made no request at all (PR #3385). So a retry asks for a URL the module map has not seen:
		// `?retry=N` on the entry. The engine's own chunk imports resolve relative to it, so they are unaffected.
		const failures = failedImports.get(url) ?? 0;
		const src = failures ? `${safeSrc}${safeSrc.includes('?') ? '&' : '?'}retry=${failures}` : safeSrc;
		const m = importModule(src).then(() => {
			if (!window.LatticePlayground) throw new Error(`lattice engine loaded but did not register: ${url}`);
		});
		// Un-cache our own promise too, so a later call does not wait on a settled failure.
		m.catch(() => {
			loaders.delete(url);
			failedImports.set(url, failures + 1);
		});
		loaders.set(url, m);
		return m;
	}

	const p = new Promise<void>((resolve, reject) => {
		let attempts = 0;
		const MAX_ATTEMPTS = 200; // ~10s at POLL_MS — bound the poll so a script that
		// loads but never sets the global can't spin forever.
		let t: ReturnType<typeof setInterval> | undefined;
		const fail = (msg: string) => {
			// Stop polling too: a poll left running after a load error rejected outlived it by ~10 s, and on timing out
			// deleted the loader of a later retry (the twin of ensure-katex.ts's leak, PR #3070).
			clearInterval(t);
			loaders.delete(url); // allow a later call to retry
			reject(new Error(msg));
		};
		const finish = () => {
			if (window.LatticePlayground) {
				// Stop polling here too: a poll left running after the load event resolved read `window` on its next
				// tick, after a test environment had gone (an unhandled "window is not defined" that failed docs-build).
				clearInterval(t);
				resolve();
				return true;
			}
			return false;
		};

		// If a matching <script> was already injected (e.g. a legacy eager tag,
		// or a prior call on a different URL string), don't add a second one —
		// just poll for the global.
		const already = scriptTagFor('data-lattice-engine', safeSrc);
		if (!already) {
			const s = document.createElement('script');
			s.src = safeSrc;
			s.defer = true;
			s.setAttribute('data-lattice-engine', '');
			// onload covers the not-yet-cached case; the poll below covers the
			// cached/already-parsed case and the defer-execution timing.
			s.addEventListener('load', () => finish());
			// onerror: surface the failure (reject + un-cache) instead of letting
			// the poll spin forever, so callers' .catch can show an error state.
			s.addEventListener('error', () => fail(`lattice engine failed to load: ${url}`));
			document.head.appendChild(s);
		}

		if (finish()) return;
		t = setInterval(() => {
			if (finish()) return;
			if (++attempts >= MAX_ATTEMPTS) fail('lattice engine load timed out');
		}, POLL_MS);
	});

	loaders.set(url, p);
	return p;
}
