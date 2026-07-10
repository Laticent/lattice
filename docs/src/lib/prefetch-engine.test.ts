import { afterEach, describe, expect, it } from 'vitest';
import { __resetWarmState, decide, injectPrefetch, type WarmSignals, warmEngine } from './prefetch-engine';

const ENGINE_URL = '/lattice/playground/v/177833f49f4e/lattice-playground.js';

// Default jsdom has no Network Information API and no matchMedia, so readSignals
// yields { saveData:false, reducedData:false, effectiveType:undefined,
// wideViewport:false } → decide() = 'intent'. That lets us exercise the intent
// path end-to-end without stubbing globals.
function base(over: Partial<WarmSignals> = {}): WarmSignals {
	return { saveData: false, reducedData: false, effectiveType: undefined, wideViewport: false, ...over };
}

// A minimal stand-in for the on-demand engine global — the prefetch code only
// checks `window.LatticePlayground` for truthiness ("engine already present"), so
// the methods are inert stubs typed to the real interface (no `as any`).
const engineStub: Window['LatticePlayground'] = {
	render: () => ({ html: '', css: '' }),
	addThemes: () => {},
	hasTheme: () => false,
};

function prefetchLinks(): NodeListOf<HTMLLinkElement> {
	return document.head.querySelectorAll('link[rel="prefetch"]');
}

afterEach(() => {
	__resetWarmState();
	document.head.innerHTML = '';
	document.body.innerHTML = '';
	delete (window as Window & { LatticePlayground?: unknown }).LatticePlayground;
});

describe('decide — connection-first policy', () => {
	it('off whenever data-saving is requested, regardless of speed or context', () => {
		expect(decide(base({ saveData: true, effectiveType: '4g', wideViewport: true }), true)).toBe('off');
		expect(decide(base({ reducedData: true, effectiveType: '4g', wideViewport: true }), true)).toBe('off');
	});

	it('off on a genuinely slow link (2g / slow-2g), even on the funnel', () => {
		expect(decide(base({ effectiveType: '2g' }), true)).toBe('off');
		expect(decide(base({ effectiveType: 'slow-2g' }), true)).toBe('off');
	});

	it('3g → intent everywhere (never eager, even on the funnel)', () => {
		expect(decide(base({ effectiveType: '3g' }), true)).toBe('intent');
		expect(decide(base({ effectiveType: '3g' }), false)).toBe('intent');
	});

	it('4g → eager on the funnel, capped to intent elsewhere', () => {
		expect(decide(base({ effectiveType: '4g' }), true)).toBe('eager');
		expect(decide(base({ effectiveType: '4g' }), false)).toBe('intent');
	});

	it('unknown connection falls back to the viewport, then the funnel cap', () => {
		// Wide viewport (desktop/tablet) → eager on the funnel, intent elsewhere.
		expect(decide(base({ effectiveType: undefined, wideViewport: true }), true)).toBe('eager');
		expect(decide(base({ effectiveType: undefined, wideViewport: true }), false)).toBe('intent');
		// Narrow viewport (mobile) → intent regardless.
		expect(decide(base({ effectiveType: undefined, wideViewport: false }), true)).toBe('intent');
		expect(decide(base({ effectiveType: undefined, wideViewport: false }), false)).toBe('intent');
	});

	it('a future/unknown effectiveType is treated like unknown (viewport proxy)', () => {
		expect(decide(base({ effectiveType: '5g', wideViewport: true }), true)).toBe('eager');
		expect(decide(base({ effectiveType: '5g', wideViewport: false }), true)).toBe('intent');
	});
});

describe('injectPrefetch', () => {
	it('adds a single rel=prefetch link, idempotently', () => {
		injectPrefetch(ENGINE_URL);
		injectPrefetch(ENGINE_URL);
		const links = prefetchLinks();
		expect(links).toHaveLength(1);
		expect(links[0].getAttribute('href')).toBe(ENGINE_URL);
		expect(links[0].hasAttribute('as')).toBe(false); // classic <script> reuse — no `as`
	});

	it('skips when the engine is already loaded', () => {
		window.LatticePlayground = engineStub;
		injectPrefetch(ENGINE_URL);
		expect(prefetchLinks()).toHaveLength(0);
	});

	it('skips when the real engine <script> is already injected', () => {
		const s = document.createElement('script');
		s.setAttribute('data-lattice-engine', '');
		s.src = ENGINE_URL;
		document.head.appendChild(s);
		injectPrefetch(ENGINE_URL);
		expect(prefetchLinks()).toHaveLength(0);
	});
});

describe('warmEngine — eager path', () => {
	afterEach(() => {
		// @ts-expect-error — test-only stub removal
		delete window.matchMedia;
	});

	it('prefetches immediately on a wide-viewport funnel visit, with no idle/timeout wait', () => {
		// jsdom has no Network Information API, so `decide` falls back to the
		// viewport proxy (see the `decide` suite above) — stub matchMedia wide.
		window.matchMedia = ((query: string) => ({ matches: query.includes('min-width'), media: query }) as MediaQueryList) as typeof window.matchMedia;
		warmEngine(ENGINE_URL, { allowEager: true });
		// Synchronous — no fake-timer advance, no requestIdleCallback flush.
		expect(prefetchLinks()).toHaveLength(1);
		expect(prefetchLinks()[0].getAttribute('href')).toBe(ENGINE_URL);
	});
});

describe('warmEngine — intent path (jsdom default signals)', () => {
	function addAppLink(href = '/lattice/playground/'): HTMLAnchorElement {
		const a = document.createElement('a');
		a.href = href;
		document.body.appendChild(a);
		return a;
	}

	it('arms listeners but does not prefetch until intent', () => {
		const a = addAppLink();
		warmEngine(ENGINE_URL);
		expect(prefetchLinks()).toHaveLength(0);

		a.dispatchEvent(new Event('pointerenter'));
		expect(prefetchLinks()).toHaveLength(1);
	});

	it('fires at most once across repeated intent events', () => {
		const a = addAppLink();
		warmEngine(ENGINE_URL);
		a.dispatchEvent(new Event('pointerenter'));
		a.dispatchEvent(new Event('focus'));
		a.dispatchEvent(new Event('pointerenter'));
		expect(prefetchLinks()).toHaveLength(1);
	});

	it('is a no-op when no engine-bound links are present', () => {
		document.body.innerHTML = '<a href="/lattice/overview/">Docs</a>';
		warmEngine(ENGINE_URL);
		document.querySelector('a')?.dispatchEvent(new Event('pointerenter'));
		expect(prefetchLinks()).toHaveLength(0);
	});

	it('is idempotent per URL — a second call does not re-arm', () => {
		const a = addAppLink();
		warmEngine(ENGINE_URL);
		warmEngine(ENGINE_URL); // handled set → no second arming
		a.dispatchEvent(new Event('pointerenter'));
		expect(prefetchLinks()).toHaveLength(1);
	});

	it('does nothing when the engine is already loaded', () => {
		window.LatticePlayground = engineStub;
		const a = addAppLink();
		warmEngine(ENGINE_URL);
		a.dispatchEvent(new Event('pointerenter'));
		expect(prefetchLinks()).toHaveLength(0);
	});
});
