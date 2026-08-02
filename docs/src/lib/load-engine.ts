// Shared on-demand loader for the irreducible Lattice render engine
// (window.LatticePlayground, the ~1.8MB/554KB-gz `lattice-playground.js`
// bundle). WRAP, DON'T REINVENT — this never reimplements the engine; it only
// controls *when* the existing classic <script> is injected.
//
// The shadcn migration loaded this bundle EAGERLY via `<script defer src>` in
// the <head> of every app page, so it competed with first paint and tanked
// mobile LCP even though the live preview is below the fold (landing) or after
// first paint (playground/workbench). This module injects the same script
// ON DEMAND — the first time a surface actually needs the engine (island in
// view, app mounted, idle) — and resolves once `window.LatticePlayground` is
// set. The existing bridges/studios already poll for that global and tolerate
// it arriving late, so deferring the injection is safe.
//
// Idempotent: a module-level singleton keyed by URL. Concurrent or repeated
// callers share one <script> and one Promise; if the engine is already present
// (e.g. another surface, or a re-mount) it resolves immediately.

// `window.LatticePlayground` is declared once, canonically, in playground-global.d.ts.

// One in-flight/settled promise per engine URL (URLs are content-hashed, so a
// single page only ever sees one). Survives React StrictMode double-mounts and
// multiple islands on the same page.
const loaders = new Map<string, Promise<void>>();

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
	if (window.LatticePlayground) return Promise.resolve();

	const existing = loaders.get(url);
	if (existing) return existing;

	const p = new Promise<void>((resolve, reject) => {
		let attempts = 0;
		const MAX_ATTEMPTS = 200; // ~10s at POLL_MS — bound the poll so a script that
		// loads but never sets the global can't spin forever.
		const fail = (msg: string) => {
			loaders.delete(url); // allow a later call to retry
			reject(new Error(msg));
		};
		const finish = () => {
			if (window.LatticePlayground) {
				resolve();
				return true;
			}
			return false;
		};

		// If a matching <script> was already injected (e.g. a legacy eager tag,
		// or a prior call on a different URL string), don't add a second one —
		// just poll for the global.
		const already = document.querySelector<HTMLScriptElement>(`script[data-lattice-engine][src="${cssEscape(url)}"]`);
		if (!already) {
			const s = document.createElement('script');
			s.src = url;
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
		const t = setInterval(() => {
			if (finish()) {
				clearInterval(t);
				return;
			}
			if (++attempts >= MAX_ATTEMPTS) {
				clearInterval(t);
				fail('lattice engine load timed out');
			}
		}, POLL_MS);
	});

	loaders.set(url, p);
	return p;
}

// Minimal attribute-selector escape for the URL (which can contain `?`/`.`/`=`
// from the cache-buster). Avoids depending on CSS.escape's spotty support.
function cssEscape(value: string): string {
	return value.replace(/["\\]/g, '\\$&');
}
