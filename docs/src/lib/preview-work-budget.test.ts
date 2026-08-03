// THE PERFORMANCE GATE — and it is a gate, not a report.
//
// WHY COUNTS AND NOT MILLISECONDS. The regression this exists to stop is the one that actually
// happened: every keystroke re-parsed the WHOLE deck to work out a slide's page number and progress
// rail, costing 63.2ms per keypress on a 40-slide gallery deck against 3.0ms on a plain one. #1272
// and #1280 fixed it by supplying the position instead of re-deriving it.
//
// Nothing guarded that. The wall-clock harnesses cannot: `studio-preview-perf.spec.ts` prints its
// numbers and asserts nothing, and `bench:check` is unreliable on a shared runner — in one session
// it read 93.9ms and 43.1ms for identical code, and told me three times that a healthy tree had
// regressed by 60-124%. A gate that cries wolf gets ignored, and a gate that cannot fail is worse
// than none.
//
// But the regression is not fundamentally a TIME — it is an amount of WORK. One keystroke should
// cost ONE render of ONE slide. Re-parsing 40 slides instead of 1 is a counting fact: deterministic,
// machine-independent, measured in milliseconds, and impossible to flake. So this tier counts, and
// runs on the PR gate (`docs-build` → `npm test`, and docs-build is in ci.needs). Wall-clock still
// runs nightly as an alarm; it just isn't what blocks a merge.
//
// HOW TO READ A FAILURE. `wholeDeckRenders: 0 → 1` on a deck below means someone reintroduced the
// per-keystroke deck parse for that deck's shape. That is a 10-20x latency regression on every
// keypress, not a rounding error. Either restore the fast route, or — if the deck genuinely gained
// a deck-derived fact — move that row to the whole-deck budget WITH the reason, the same way
// `bench` re-blesses.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./render-engine', () => ({ renderMarkdown: vi.fn() }));
vi.mock('./theme-fetch', () => ({
	createThemeFetcher: () => ({ ensure: async () => {}, ensureBase: async () => {}, fetch: async () => {} }),
}));
vi.mock('../playground/font-embed.js', () => ({ previewFontFaceCss: () => '' }));

import { renderMarkdown } from './render-engine';
import { clearDeckMemo, clearSliceCache, createSingleSlideRenderer } from './single-slide-render';

const opts = { themeBase: 'https://x/themes/', runtimeUrl: 'https://x/rt.js' };

// ── The fixture decks — one per shape whose route we care about ──────────────
const slides = (n: number, decorate: (i: number) => string = () => '') =>
	Array.from({ length: n }, (_, i) => `${decorate(i)}# Slide ${i + 1}\n\nBody copy for slide ${i + 1}.\n`).join('\n---\n\n');

/** No deck-derived fact at all. The cheap route by construction. */
const PLAIN = slides(40);

/**
 * THE ONE THAT REGRESSED. Dividers drive the progress rail and the watermark glyph, both of which
 * used to be derived by walking every section — so this shape re-parsed the whole deck on every
 * keystroke (63.2ms p50). #1280 supplies the section position instead. It must stay on the slice route.
 */
const GALLERY = `---\npaginate: true\n---\n\n${slides(40, (i) => (i % 8 === 0 ? '<!-- _class: divider -->\n\n' : ''))}`;

/** Paginated but no dividers — the #1272 case. Also must stay on the slice route. */
const PAGINATED = `---\npaginate: true\n---\n\n${slides(40)}`;

/**
 * THE CONTROL. A running-global directive is text, not a number, so there is nothing to supply and
 * the whole-deck render is CORRECT here. Without this row the suite would pass just as well if the
 * gate always reported "slice", which is the failure mode of a guard that cannot fail.
 */
const RUNNING_HEADER = `<!-- header: Q3 Board Review -->\n\n${slides(40)}`;

const sectionsHtml = (n: number) =>
	`<article class="lattice">${Array.from({ length: n }, (_, i) => `<section class="form" id="${i + 1}"><div class="cell-stage"><h1>Slide ${i + 1}</h1></div></section>`).join('')}</article>`;

/** One keystroke's worth of work: every render call, and the document each was handed. */
type Work = { calls: number; wholeDeck: number; slices: number; pages: ({ offset: number; total?: number } | undefined)[] };

function recordWork(deck: string): { seen: Work } {
	const seen: Work = { calls: 0, wholeDeck: 0, slices: 0, pages: [] };
	(renderMarkdown as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (_pg: unknown, src: string, _theme: unknown, o?: { page?: { offset: number; total?: number } }) => {
		seen.calls += 1;
		if (src === deck) seen.wholeDeck += 1;
		else seen.slices += 1;
		seen.pages.push(o?.page);
		return { html: sectionsHtml(40), css: '' };
	});
	return { seen };
}

beforeEach(() => {
	class RO {
		observe = vi.fn();
		unobserve = vi.fn();
		disconnect = vi.fn();
	}
	(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
	(window as unknown as { LatticePlayground: unknown }).LatticePlayground = { hasTheme: () => false, addThemes: () => {} };
	(renderMarkdown as unknown as ReturnType<typeof vi.fn>).mockReset();
	clearDeckMemo();
	clearSliceCache();
});

function mountHost() {
	const host = document.createElement('figure');
	document.body.appendChild(host);
	return host;
}

/** Drive ONE edit of the shown slide, exactly as the Studio's editor preview does. */
async function typeOneSlide(deck: string, slideIndex: number) {
	const { seen } = recordWork(deck);
	const r = createSingleSlideRenderer(opts);
	const chunks = deck.replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n/, '').split(/\n-{3,}\n/);
	await r.renderInto(mountHost(), deck, false, undefined, undefined, undefined, undefined, {
		slideIndex,
		slideCount: chunks.length,
		slideMarkdown: chunks[slideIndex],
		focused: true,
	});
	return seen;
}

// ── The budget ────────────────────────────────────────────────────────────────
// `wholeDeck` is the number that matters: it is the count of times a single keystroke re-parsed
// every slide in the deck. Anything above 0 on a fast-route row is the 63.2ms regression returning.
describe('preview work budget — one keystroke costs one slide render', () => {
	const FAST_ROUTE: [name: string, deck: string][] = [
		['plain 40-slide deck', PLAIN],
		['paginated deck (#1272)', PAGINATED],
		['gallery deck with dividers (#1280 — the 63.2ms case)', GALLERY],
	];

	for (const [name, deck] of FAST_ROUTE) {
		it(`${name}: 1 render, 0 whole-deck parses`, async () => {
			const w = await typeOneSlide(deck, 20);
			expect(w.calls, 'one keystroke must cost exactly one engine render').toBe(1);
			expect(w.wholeDeck, 'the whole deck was re-parsed — this is the per-keystroke regression').toBe(0);
			expect(w.slices).toBe(1);
		});

		it(`${name}: the slice is handed its true deck position`, async () => {
			// The other half of the bargain: rendering one slide alone is only correct because the
			// caller supplies what the slide would otherwise have to derive. A slice rendered WITHOUT
			// a position is cheap and wrong — it numbers itself "1 of 1".
			const w = await typeOneSlide(deck, 20);
			expect(w.pages[0], 'the slice was rendered with no supplied position').toBeDefined();
			expect(w.pages[0]?.offset).toBe(20);
			expect(w.pages[0]?.total).toBe(40);
		});
	}

	it('running-header deck: the whole-deck render is CORRECT and still happens', async () => {
		// The control. A running global is text, so there is no position to hand over — the deck
		// render is the right answer here, and this row is what proves the rows above are measuring
		// a real decision rather than always reporting "slice".
		const w = await typeOneSlide(RUNNING_HEADER, 20);
		expect(w.wholeDeck, 'a deck-derived fact must still buy the whole-deck render').toBe(1);
		expect(w.slices).toBe(0);
	});
});
