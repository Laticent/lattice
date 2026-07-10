// Connection-first warming for the marp render engine bundle
// (`lattice-playground.js`, ~1.8MB / ~554KB-gz). This is the ONLY heavy thing
// on the site; the pages themselves are cheap (Astro's built-in `prefetch`
// handles HTML hover-prefetch). WRAP, DON'T REINVENT — this never loads or
// reimplements the engine, it only drops a `<link rel="prefetch">` so the
// bundle is already in the HTTP cache by the time a surface needs it:
//   • this page's own idle-injection (load-engine.ts), AND
//   • the NEXT navigation to an app page — the URL is content-hashed, so the
//     same hash is one cache entry shared across every page.
//
// ONE decision function (`decide`), identical on desktop, tablet, and mobile.
// Capability (the connection), not form factor, is the lever; the viewport is
// only the fallback when the browser won't tell us the connection (Safari and
// Firefox have no Network Information API). Page context caps the appetite: the
// landing funnel may warm eagerly (`allowEager`), every other surface tops out
// at intent (warm only when a pointer/focus/touch reaches for an app link).
//
//   Save-Data / prefers-reduced-data → off   (explicit "don't spend my data")
//   effectiveType slow-2g / 2g       → off   (never burn 554KB on a crawl)
//   effectiveType 3g                 → intent
//   effectiveType 4g                 → eager (capped to intent off the funnel)
//   unknown (no NetInfo API)         → viewport proxy: ≥768px eager, else intent

export type Decision = 'eager' | 'intent' | 'off';

export interface WarmSignals {
	/** Network Information API `saveData` — an explicit "conserve my data". */
	saveData: boolean;
	/** CSS `prefers-reduced-data: reduce` — the cross-browser equivalent. */
	reducedData: boolean;
	/** Network Information API `effectiveType` ('4g' | '3g' | '2g' | 'slow-2g'). */
	effectiveType: string | undefined;
	/** Viewport ≥ 768px — only consulted when `effectiveType` is unknown. */
	wideViewport: boolean;
}

/**
 * The warming decision, as a PURE function of the signals + page context, so
 * the branch matrix is unit-testable without a DOM. Connection sets the
 * ceiling; `allowEager` (the landing funnel only) is the sole context that may
 * keep `eager` — everywhere else `eager` is demoted to `intent`.
 */
export function decide(signals: WarmSignals, allowEager: boolean): Decision {
	// Explicit data-saving — honoured on every device, including desktop.
	if (signals.saveData || signals.reducedData) return 'off';

	let mode: Decision;
	switch (signals.effectiveType) {
		case 'slow-2g':
		case '2g':
			return 'off';
		case '3g':
			mode = 'intent';
			break;
		case '4g':
			mode = 'eager';
			break;
		default:
			// No Network Information API (or a future/unknown type): use the
			// viewport as a capability proxy — desktop/tablet are usually on
			// broadband, phones often on cellular.
			mode = signals.wideViewport ? 'eager' : 'intent';
	}

	if (mode === 'eager' && !allowEager) mode = 'intent';
	return mode;
}

interface NetworkInformation {
	saveData?: boolean;
	effectiveType?: string;
}

function readSignals(): WarmSignals {
	const conn = (navigator as Navigator & { connection?: NetworkInformation }).connection;
	return {
		saveData: Boolean(conn?.saveData),
		reducedData: Boolean(window.matchMedia?.('(prefers-reduced-data: reduce)')?.matches),
		effectiveType: conn?.effectiveType,
		wideViewport: Boolean(window.matchMedia?.('(min-width: 768px)')?.matches),
	};
}

// App routes that actually instantiate the engine. Intent on a link into any
// of these warms the bundle a beat before the navigation lands.
const ENGINE_ROUTE = /\/(playground|drawing-board|workbench|components)(?:\/|$|[?#])/;

// Engine URLs already scheduled (eager) or armed (intent) on this page, so a
// repeat call — or a second <EngineWarm> instance — can't double-arm and leak
// listeners. Keyed by URL (content-hashed → one per page) like load-engine.ts.
const handled = new Set<string>();

/**
 * Warm the engine bundle per {@link decide}.
 *
 * @param engineUrl  the content-hashed `lattice-playground.js` URL (same string
 *                   the app pages load, so it shares one cache entry).
 * @param allowEager pass `true` only on the landing funnel; elsewhere the
 *                   decision is capped at `intent`.
 */
export function warmEngine(engineUrl: string, opts: { allowEager?: boolean } = {}): void {
	if (typeof window === 'undefined' || !engineUrl) return;
	// Already loaded (e.g. an app page that injects it directly) → nothing to warm.
	if ((window as Window & { LatticePlayground?: unknown }).LatticePlayground) return;
	if (handled.has(engineUrl)) return;
	handled.add(engineUrl);

	const mode = decide(readSignals(), Boolean(opts.allowEager));
	if (mode === 'off') return;
	if (mode === 'eager') {
		// Immediate, not idle-deferred: `rel=prefetch` is already a low-priority
		// hint (the browser won't let it compete with render-blocking resources —
		// the actual LCP protection), so queuing it behind `requestIdleCallback`
		// (up to a 3s timeout, or a flat 1200ms fallback) bought no real LCP
		// safety while forfeiting the one thing eager mode exists for: a network
		// head start on the 554KB engine bundle, in parallel with island
		// hydration, before DeckPreview's own mount effect requests it via
		// load-engine.ts's `ensureEngine`. Confirmed on the landing page: the
		// idle delay meant this prefetch link consistently lost the race to
		// DeckPreview's own script injection, so it was never actually warming
		// anything within the page's real load window.
		injectPrefetch(engineUrl);
		return;
	}
	armIntent(engineUrl);
}

// Idempotent: skip if the engine arrived in the meantime, if a prefetch link is
// already present, or if the real <script> was injected (load-engine.ts marks
// it data-lattice-engine — its fetch already populates the cache). This is also
// the guard for the intent path, where listeners may sit armed for a while.
export function injectPrefetch(engineUrl: string): void {
	if ((window as Window & { LatticePlayground?: unknown }).LatticePlayground) return;
	const href = cssEscape(engineUrl);
	if (document.querySelector(`link[rel="prefetch"][href="${href}"]`)) return;
	if (document.querySelector(`script[data-lattice-engine][src="${href}"]`)) return;
	const link = document.createElement('link');
	link.rel = 'prefetch';
	link.href = engineUrl;
	document.head.appendChild(link);
}

// NOTE: links are snapshotted once, here, at warm time. These pages are static
// (no client-side router), so the app links exist by the time this runs; a
// future surface that injects app links dynamically would not be covered.
function armIntent(engineUrl: string): void {
	const links = [...document.querySelectorAll<HTMLAnchorElement>('a[href]')].filter((a) => {
		try {
			return ENGINE_ROUTE.test(new URL(a.href, location.href).pathname);
		} catch {
			return false;
		}
	});
	if (!links.length) return;

	let fired = false;
	const fire = () => {
		if (fired) return;
		fired = true;
		for (const a of links) {
			a.removeEventListener('pointerenter', fire);
			a.removeEventListener('focus', fire);
			// `passive` is not part of removeEventListener's match key (only the
			// capture flag is), so omitting it here still removes the listener.
			a.removeEventListener('touchstart', fire);
		}
		injectPrefetch(engineUrl);
	};

	for (const a of links) {
		a.addEventListener('pointerenter', fire);
		a.addEventListener('focus', fire);
		a.addEventListener('touchstart', fire, { passive: true });
	}
}

// Minimal attribute-selector escape (the URL carries `?`/`.`/`=` from the
// content hash). Mirrors load-engine.ts rather than lean on CSS.escape.
function cssEscape(value: string): string {
	return value.replace(/["\\]/g, '\\$&');
}

// Test-only: reset the per-page idempotency set between cases.
export function __resetWarmState(): void {
	handled.clear();
}
