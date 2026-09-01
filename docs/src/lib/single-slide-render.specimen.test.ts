// #1463 — the SPECIMEN flag on the rendered frame, and the shared-memo refcount.
//
// A SPECIMEN is a catalog sample the author did not write and cannot edit — the add-slide
// gallery's tiles. `options.specimen` stamps `<html data-lattice-specimen>` on the
// frame it writes, and the engine runtime reads that to route its overflow / type-floor
// watcher to `off` — the level that installs no probe, no observer and no resize
// handler, so a grid of ~33 frames is not running ~33 of them to draw marks nobody can
// read at 260px (and which, in the gallery, describe a catalog sample nobody can fix).
//
// What is under test here is only this module's half: that the attribute reaches the
// frame when asked and is ABSENT otherwise. The runtime's half — that the flag really
// silences the watcher — is pinned against the real bundled runtime in
// test/integration/parity/runtime-overflow-marker.test.js, and end-to-end on the real
// Studio in docs/e2e/gallery-preview-budget.spec.ts.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./render-engine', () => ({ renderMarkdown: vi.fn() }));
vi.mock('./theme-fetch', () => ({
	createThemeFetcher: () => ({ ensure: async () => {}, ensureBase: async () => {}, ensureKatexFaces: async () => {}, katexFacesActive: () => false, fetch: async () => {} }),
}));
vi.mock('../playground/font-embed.js', () => ({ previewFontFaceCss: () => '' }));

import { renderMarkdown } from './render-engine';
import { __resetLiveRenderersForTest, clearDeckMemo, clearSliceCache, createSingleSlideRenderer } from './single-slide-render';

const base = { themeBase: 'https://x/themes/', runtimeUrl: 'https://x/rt.js' };
const HTML = '<article class="lattice"><section class="form" id="1"><div class="cell-stage"><h1>One</h1></div></section></article>';

beforeEach(() => {
	class RO {
		observe = vi.fn();
		unobserve = vi.fn();
		disconnect = vi.fn();
	}
	(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
	(window as unknown as { LatticePlayground: unknown }).LatticePlayground = { hasTheme: () => false, addThemes: () => {} };
	(renderMarkdown as unknown as ReturnType<typeof vi.fn>).mockReset();
	(renderMarkdown as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => ({ html: HTML, css: '' }));
	clearDeckMemo();
	clearSliceCache();
	__resetLiveRenderersForTest();
	document.body.innerHTML = '';
});

// A deck the whole-deck memo actually serves: a running-global header is a deck-derived fact, so
// `needsDeckContext` is true, the render is NOT sliced, and sibling tiles showing different slides
// share one memoized parse. This is Present's slide-overview shape.
const DECK_SCOPED = '<!-- header: Q3 Review -->\n\ndeck body';

// The engine's real output shape for a 3-slide deck. The section COUNT has to match the
// `slideCount` the caller believes, or narrowing declines and the render falls back to the
// single-slide slice path — which uses the slice cache, not the memo, and would make every
// assertion below vacuous. (That fallback is itself deliberate; see the deck-context suite.)
const section = (n: number) =>
	`<section class="form" id="${n}" data-lattice-pagination="${n}" data-lattice-pagination-total="3">` +
	`<div class="cell-stage"><h1>Slide ${n}</h1></div></section>`;
const DECK3 = `<article class="lattice">\n${section(1)}\n${section(2)}\n${section(3)}\n</article>`;

/** Mount a host, render slide `index` of the deck through its own renderer, and hand back the
 *  renderer so the caller can dispose it the way a recycled tile does. */
async function mountTile(index: number, specimen = true) {
	const host = document.createElement('figure');
	document.body.appendChild(host);
	const r = createSingleSlideRenderer({ ...base, specimen });
	await r.renderInto(host, DECK_SCOPED, false, undefined, undefined, undefined, undefined, {
		slideIndex: index,
		slideCount: 3,
		slideMarkdown: 'fallback',
	});
	return r;
}

describe('recycling must not wipe the SHARED whole-deck memo (#1463)', () => {
	// THE REGRESSION THIS PINS. `dispose()` released the module-level deck memo, which was
	// harmless while a tile never unmounted — dispose fired once, at grid close. Two-way
	// windowing makes it fire every time the budget reclaims a slot, i.e. at scroll frequency,
	// and each one cost every OTHER host on the page its memo. Worst on Present's overview,
	// where the grid renders the WHOLE DECK per tile and shares one entry: every eviction cost
	// the next tile a cold whole-deck parse (~39ms on a 58-slide deck) where there had been one
	// parse for the entire grid. Found by the adversarial trio; reproduced here first.
	const engineCalls = () => (renderMarkdown as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
	beforeEach(() => {
		(renderMarkdown as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => ({ html: DECK3, css: '' }));
	});

	it('a sibling tile reuses the memo — the property the grid depends on', async () => {
		await mountTile(0);
		const afterFirst = engineCalls();
		await mountTile(1);
		expect(engineCalls(), 'a second tile of the same deck re-parsed it').toBe(afterFirst);
	});

	it('a RECYCLED tile does not cost the next tile a whole-deck parse', async () => {
		await mountTile(0);
		const recycled = await mountTile(1);
		const before = engineCalls();
		recycled.dispose(); // exactly what the budget does when it reclaims a slot
		await mountTile(2);
		expect(engineCalls(), 'the recycle wiped the memo and the next tile parsed the deck cold').toBe(before);
	});

	// N1, found by the red team re-attacking the refcount above. `FieldCardsLive` and
	// `RestyleShowcase` both write `useRef(createSingleSlideRenderer(...))`, and JavaScript
	// evaluates that argument on EVERY render while useRef keeps only the first instance — each
	// paired with exactly one dispose. Counting at CONSTRUCTION therefore drifted upward once per
	// re-render, and RestyleShowcase auto-cycles every 2.6s, so the landing page's count would
	// climb forever and the memo would never be released. The refcount joins on first RENDER
	// instead, which makes it independent of how a caller constructs.
	it('a constructed-but-never-rendered renderer does not hold the count open', async () => {
		const live = await mountTile(0);
		// Twelve discarded constructions, exactly as a re-rendering host produces them.
		for (let i = 0; i < 12; i++) createSingleSlideRenderer({ ...base, specimen: true });
		const before = engineCalls();
		live.dispose(); // the only renderer that ever rendered
		await mountTile(0);
		expect(engineCalls(), 'discarded constructions kept the memo pinned open').toBe(before + 1);
	});

	// The other edge of the same seam: `renderInto` after `dispose()` must not join the count.
	// It returns the disposed sentinel either way, but joining would flip `counted` true while
	// `wasDisposed` blocks any second decrement — pinning the shared memo for the page's life.
	it('a render AFTER dispose does not join the count', async () => {
		const live = await mountTile(0);
		const late = createSingleSlideRenderer({ ...base, specimen: true });
		late.dispose();
		const host = document.createElement('figure');
		document.body.appendChild(host);
		const status = await late.renderInto(host, DECK_SCOPED, false, undefined, undefined, undefined, undefined, {
			slideIndex: 1,
			slideCount: 3,
			slideMarkdown: 'fallback',
		});
		expect(status.error).toBe('renderer disposed');
		const before = engineCalls();
		live.dispose(); // the only renderer that ever really rendered — the memo must release
		await mountTile(0);
		expect(engineCalls(), 'a post-dispose render pinned the memo open').toBe(before + 1);
	});

	it('the LAST host out still releases it — the retention dispose() exists to prevent', async () => {
		const a = await mountTile(0);
		const b = await mountTile(1);
		const before = engineCalls();
		a.dispose();
		b.dispose(); // no live renderers left
		await mountTile(0);
		expect(engineCalls(), 'the memo survived the last dispose').toBe(before + 1);
	});
});

async function srcdocFor(specimen?: boolean): Promise<string> {
	const host = document.createElement('figure');
	document.body.appendChild(host);
	const r = createSingleSlideRenderer(specimen === undefined ? base : { ...base, specimen });
	await r.renderInto(host, '# One', false);
	const fr = host.querySelector<HTMLIFrameElement>('iframe.live');
	if (!fr) throw new Error('no live frame');
	return fr.srcdoc;
}

describe('the specimen flag on the rendered frame (#1463)', () => {
	it('stamps <html data-lattice-specimen> when the host renders catalog specimens', async () => {
		const doc = await srcdocFor(true);
		expect(doc).toMatch(/^<!doctype html><html data-lattice-specimen>/);
	});

	it('leaves the tag bare for a full-size host — every other preview keeps its watcher', async () => {
		// The control for the claim that this change is inert everywhere else: the Studio's
		// own preview, the landing islands and the specimens all take this path, and
		// e2e/reader-alarms.spec.ts' positive control depends on their watcher still running.
		const doc = await srcdocFor(undefined);
		expect(doc).toMatch(/^<!doctype html><html>/);
		expect(doc).not.toContain('data-lattice-specimen');
	});

	it('an explicit false is the same as omitting it', async () => {
		expect(await srcdocFor(false)).not.toContain('data-lattice-specimen');
	});

	it('does not disturb the rest of the document head — the theme style still carries its id', async () => {
		// The RESTYLE fast path finds the resident theme <style> by id; a malformed <html>
		// tag would be a parse problem the flag has no business causing.
		//
		// Asserted as three facts rather than one literal string. This used to match
		// `<head><meta charset="utf-8"><style id="lattice-theme">` as one span, which pinned
		// the ADJACENCY of the charset meta and the theme style — more than the fast path
		// needs, and it went red the moment the preview CSP meta was added between them
		// (#1753). What the fast path actually requires is that the head opens well and the
		// style is findable by id; a `<meta>` in between is exactly what a head is for.
		const doc = await srcdocFor(true);
		expect(doc).toContain('<head><meta charset="utf-8">');
		expect(doc).toContain('<style id="lattice-theme">');
		expect(doc.indexOf('<style id="lattice-theme">')).toBeLessThan(doc.indexOf('</head>'));
	});
});
