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
import { clearDeckMemo, clearSliceCache, createSingleSlideRenderer, deckDerivedFactsFor } from './single-slide-render';

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
 * NOT 40 SLIDES, deliberately. Every other fixture is exactly 40, so a regression conditioned on
 * deck size — `slideCount > 40`, a chunking threshold, a cache bucket — kept the whole suite green
 * while the 117-slide gallery this change exists for rendered un-positioned. That failure also
 * disables the slice cache silently, because the supplied position is part of its key.
 */
const BIG = `---\npaginate: true\n---\n\n${slides(97)}`;

/**
 * A deck that trips a deck-derived fact. `glossary: auto` appends a derived appendix slide BUILT
 * FROM an `acronyms:` registry — the registry is what makes the transform actually fire, and the
 * first cut of this fixture omitted it. Without entries `appendAutoGlossary` returns the source
 * unchanged (`lib/core/glossary-auto.mjs`), so the deck's slide count did NOT change and the
 * comment claiming it did was false of its own fixture. Verified: 1680 bytes in, 1680 out.
 */
const GLOSSARY = `---\nglossary: auto\nacronyms:\n  ARR:\n    definition: Annual Recurring Revenue\n---\n\n${slides(40)}`;

/**
 * KNOWN-SLOW, AND TRACKED — not a requirement. This shape takes the whole-deck route today because
 * nothing supplies inherited running-global text to a slice yet. That is a COST, not a correctness
 * property: 54 committed decks trip this probe and nothing else (#1333). If you made running
 * globals sliceable and this row went red, that is the win landing — move it into FAST_ROUTE.
 */
const RUNNING_HEADER = `<!-- header: Q3 Board Review -->\n\n${slides(40)}`;

const sectionsHtml = (n: number) =>
	`<article class="lattice">${Array.from({ length: n }, (_, i) => `<section class="form" id="${i + 1}"><div class="cell-stage"><h1>Slide ${i + 1}</h1></div></section>`).join('')}</article>`;

type Page = { offset: number; total?: number; deckSection?: { index: number; total: number } };
/** One keystroke's worth of work: every render call, and the document each was handed. */
type Work = { calls: number; wholeDeck: number; slices: number; pages: (Page | undefined)[]; bytes: number[] };

function recordWork(deck: string): { seen: Work } {
	const seen: Work = { calls: 0, wholeDeck: 0, slices: 0, pages: [], bytes: [] };
	(renderMarkdown as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (_pg: unknown, src: string, _theme: unknown, o?: { page?: Page }) => {
		seen.calls += 1;
		if (src === deck) seen.wholeDeck += 1;
		else seen.slices += 1;
		seen.pages.push(o?.page);
		// THE SIZE, not just the identity. `src === deck` is an exact-bytes oracle, so a regression
		// that hands the engine a whole deck it derived or normalized first — one byte different —
		// scores a perfect `wholeDeck: 0`. `renderMarkdown` already rewrites its input on the way
		// in (appendAutoGlossary), so this is not hypothetical. Recording the byte count lets the
		// budget below assert the engine was handed roughly ONE SLIDE, which is the actual claim.
		seen.bytes.push(src.length);
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

/** The deck's real slide count, by the same split the renderer's caller uses. */
const slideCountOf = (deck: string) => deck.replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n/, '').split(/\n-{3,}\n/).length;

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
		['97-slide deck (size-conditioned regressions)', BIG],
	];

	// EVERY row below drives the deck's FIRST, MIDDLE and LAST slide. All five fixtures used to be
	// exactly 40 slides and every test typed at index 20, so two ordinary regressions kept the whole
	// suite green: an off-by-one that drops the supplied position at index 0 and index count-1 (the
	// two slides an author looks at most), and a bug conditioned on `slideCount > 40` — which also
	// silently disables the slice cache, since `slicePage` is part of its key.
	const AT: [label: string, at: (n: number) => number][] = [
		['first slide', () => 0],
		['middle slide', (n) => Math.floor(n / 2)],
		['last slide', (n) => n - 1],
	];

	for (const [name, deck] of FAST_ROUTE) {
		it(`${name}: 1 render, 0 whole-deck parses`, async () => {
			const w = await typeOneSlide(deck, Math.floor(slideCountOf(deck) / 2));
			expect(w.calls, 'one keystroke must cost exactly one engine render').toBe(1);
			expect(w.wholeDeck, 'the whole deck was re-parsed — this is the per-keystroke regression').toBe(0);
			expect(w.slices).toBe(1);
			// The byte backstop. `wholeDeck` alone is an exact-identity check and a regression only
			// has to change one byte to slip past it; a 40-slide deck handed to the engine is ~40x
			// the work whether or not it is byte-identical to the source.
			//
			// WHAT IT ACTUALLY ASSERTS, stated honestly: a fifth of these fixtures is ~330 bytes and
			// one slide is 37, so this permits up to ~9 slides, not "roughly one". It reliably
			// catches the regression it exists for — a whole-deck parse is 1656+ bytes, five times
			// the threshold — but a hypothetical regression handing over a 5-slide window would pass.
			// Tightening it further would make it brittle against a legitimately long single slide,
			// which is a likelier failure than the 2-to-9-slide regression it would catch.
			expect(w.bytes[0], `the engine was handed ${w.bytes[0]} of the deck's ${deck.length} bytes — that is a whole-deck parse wearing a different byte string`).toBeLessThan(deck.length / 5);
		});

		for (const [where, at] of AT) {
			it(`${name}: the slice is handed its true deck position — ${where}`, async () => {
				// The other half of the bargain: rendering one slide alone is only correct because the
				// caller supplies what the slide would otherwise have to derive. A slice rendered
				// WITHOUT a position is cheap and wrong — it numbers itself "1 of 1".
				const n = slideCountOf(deck);
				const i = at(n);
				const w = await typeOneSlide(deck, i);
				expect(w.pages[0], `slide ${i + 1} of ${n} was rendered with no supplied position`).toBeDefined();
				expect(w.pages[0]?.offset).toBe(i);
				expect(w.pages[0]?.total).toBe(n);
			});
		}
	}

	it('gallery deck: the slice is handed its SECTION position too, not just its page number', async () => {
		// The #1280 half of the payload, and the one the position rows above do not cover: they
		// check `offset`/`total` (the #1272 page number), so dropping `deckSection` entirely left
		// all seven rows green. The gallery deck's progress rail and watermark glyph are derived
		// from this — losing it is what sent the whole deck back through the parser every keystroke.
		const w = await typeOneSlide(GALLERY, 20);
		const sec = w.pages[0]?.deckSection;
		expect(sec, 'the divider deck lost its supplied section — the rail would have to re-derive it from the whole deck').toBeDefined();
		expect(sec?.total, 'dividers every 8th slide of 40 give 5 sections').toBe(5);
		expect(sec?.index, 'slide 20 sits in the third section (dividers at 0, 8, 16, 24, 32)').toBe(3);
	});

	// THE DERIVED CONTROL, and it is the one that cannot expire. Every row above names a deck SHAPE,
	// so each is only true until someone makes that shape sliceable — which is exactly how the first
	// control (a running `header:`) turned into a lock on the next optimization, and how the second
	// (`glossary: auto`) nearly did. This one asserts the INVARIANT instead: the route taken must
	// agree with the registry's own answer about the deck. When running globals become sliceable the
	// probe is deleted and this row follows automatically — no editing, nothing to get wrong.
	it('the route always agrees with the registry — no fixture can drift from it', async () => {
		for (const [name, deck] of [...FAST_ROUTE, ['glossary', GLOSSARY], ['running header', RUNNING_HEADER]] as [string, string][]) {
			const facts = deckDerivedFactsFor(deck);
			const w = await typeOneSlide(deck, Math.floor(slideCountOf(deck) / 2));
			expect(
				w.wholeDeck > 0,
				`${name}: the registry reports ${facts.length ? `facts [${facts.join(', ')}]` : 'no deck-derived fact'}, but the render took the ${w.wholeDeck > 0 ? 'whole-deck' : 'slice'} route`,
			).toBe(facts.length > 0);
		}
	});

	it('glossary deck: an unsliceable fact still buys the whole-deck render', async () => {
		// `glossary: auto` changes the deck's slide count, so the engine must count for itself. This
		// row is what proves the rows above measure a real decision rather than always reporting
		// "slice" — and unlike a running global, it can never become sliceable, so it will not go
		// red when the next optimization lands.
		const w = await typeOneSlide(GLOSSARY, 20);
		expect(w.wholeDeck, 'an unsliceable deck-derived fact must still buy the whole-deck render').toBe(1);
		expect(w.slices).toBe(0);
	});

	it('running-header deck: whole-deck TODAY — a tracked cost, not a requirement (#1333)', async () => {
		// Records the status quo so a change is visible, and says in its message that going red here
		// is a WIN rather than a regression. See the fixture comment for what to do about it.
		const w = await typeOneSlide(RUNNING_HEADER, 20);
		// `toBe(1)` emits one message for ANY non-1 value, so a 2-render regression used to fail
		// here telling the reader "you made them sliceable, delete this row" — instructions to
		// remove a row that was catching a real defect. Split the two directions.
		expect(w.wholeDeck, 'more than one whole-deck parse per keystroke — this is a regression, not the #1333 win').toBeLessThanOrEqual(1);
		expect(
			w.wholeDeck,
			'running-global decks no longer take the whole-deck route — if you made them sliceable, that is #1333 landing: move this row into FAST_ROUTE',
		).toBe(1);
		// Dropped when this row was reframed, which let it pass under a 2-render-per-keystroke
		// regression. The suite only survived because GLOSSARY exercises the same route and kept it.
		expect(w.slices, 'a whole-deck render must not ALSO cost a slice render').toBe(0);
	});
});
