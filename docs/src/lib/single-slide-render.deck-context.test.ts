// Behavior tests for the DECK-CONTEXT render (`renderInto`'s `opts.slideIndex`) — the fix for
// "every Studio preview prints 1 as the page number".
//
// WHY THIS EXISTS: the engine numbers a slide by its ORDINAL POSITION among the sections of the
// document it parses (lib/engine/slides.js `lattice_directives_apply`), and stamps the deck's
// section count as the total. There is no offset to pass — the count IS the position. So a host
// that slices one slide out and renders it alone necessarily gets "1 of 1", which is what all
// three Studio surfaces did. The fix renders the DECK and displays one section, so the number the
// slide carries was computed against the real deck.
//
// The engine + theme fetch are mocked (this is not an engine test — the engine's numbering is
// verified in test/unit/engine). What is under test is the module's own narrowing step: that it
// keeps the RIGHT section, keeps the `<article class="lattice">` wrapper the frame CSS and the
// patch path both depend on, preserves the engine's stamped attributes byte-for-byte, and FAILS
// CLOSED when it cannot prove which section is the shown slide (falling back to rendering that
// slide alone rather than guessing an index — see single-slide-render.alignment.test.ts for why
// that guard is load-bearing on decks that ship in this repo).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./render-engine', () => ({ renderMarkdown: vi.fn() }));
vi.mock('./theme-fetch', () => ({
	createThemeFetcher: () => ({ ensure: async () => {}, ensureBase: async () => {}, fetch: async () => {} }),
}));
vi.mock('../playground/font-embed.js', () => ({ previewFontFaceCss: () => '' }));

import { renderMarkdown } from './render-engine';
import { clearDeckMemo, createSingleSlideRenderer, DECK_DERIVED_FACTS } from './single-slide-render';

const opts = { themeBase: 'https://x/themes/', runtimeUrl: 'https://x/rt.js' };

// The markdown these cases pass must actually NEED deck context, or the gate in renderInto
// correctly declines to render the deck at all (see needsDeckContext): a deck with no `paginate`,
// no running-global directive and no divider has no deck-scoped fact to get right, so rendering
// the whole thing would be pure cost. `paginate: true` is the realistic trigger — a deck showing
// page numbers is precisely the case deck context exists for.
const PAGINATED = '---\npaginate: true\n---\n\ndeck body';

// A 3-slide deck exactly as the engine emits one: an `<article class="lattice">` wrapper, one
// `<section>` per slide carrying its positional `id`, its `data-lattice-pagination` ordinal, the
// deck-wide `data-lattice-pagination-total`, and the visible `<span class="lat-pagination">` the
// footer dock renders. Verified against real `render()` output while writing this fix.
const section = (n: number, total: number, body: string) =>
	`<section class="form" id="${n}" data-paginate="true" data-lattice-pagination="${n}" data-lattice-pagination-total="${total}">` +
	`<div class="cell-stage"><h1>${body}</h1></div>` +
	`<div class="cell-footer"><span class="lat-pagination">${n}</span></div></section>`;
const DECK = `<article class="lattice">\n${section(1, 3, 'One')}\n${section(2, 3, 'Two')}\n${section(3, 3, 'Three')}\n</article>`;

function mockRender(html: string) {
	(renderMarkdown as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => ({ html, css: '' }));
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
	// The whole-deck memo is MODULE state (deliberately — the overview grid's tiles share one
	// entry). Production is safe because the engine is deterministic: identical inputs always
	// produce identical html. A test that re-mocks DIFFERENT html for the same markdown would
	// otherwise be served the previous test's render, so drop the memo between cases.
	clearDeckMemo();
	mockRender(DECK);
});
afterEach(() => {
	(window as unknown as { LatticePlayground?: unknown }).LatticePlayground = undefined;
	document.body.innerHTML = '';
});

function mountHost() {
	const host = document.createElement('figure');
	document.body.appendChild(host);
	return host;
}
/** The document the renderer wrote into the live frame. */
function srcdocOf(host: HTMLElement): string {
	const fr = host.querySelector<HTMLIFrameElement>('iframe.live');
	if (!fr) throw new Error('no live frame');
	return fr.srcdoc;
}

/** Record which document each render was handed, so a gate's or memo's choice is observable. */
function recordRenders() {
	const seen: string[] = [];
	(renderMarkdown as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (_pg: unknown, src: string) => {
		seen.push(src);
		return { html: DECK, css: '' };
	});
	return seen;
}

describe('deck-context render (renderInto opts.slideIndex)', () => {
	it('shows ONE section carrying the page number the engine computed for the DECK', async () => {
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		// Slide 2 of a 3-slide deck. Before this option, the caller passed slide 2's markdown
		// ALONE and the engine — correctly, for a one-slide document — stamped it "1 of 1".
		const status = await r.renderInto(host, PAGINATED, false, undefined, undefined, undefined, undefined, { slideIndex: 1 });
		expect(status.ok).toBe(true);

		const doc = srcdocOf(host);
		// Exactly one slide reaches the frame — the srcdoc stays a single-slide document, so the
		// frame's CSS parse + runtime cost (the dominant preview cost) is unchanged.
		expect(doc.match(/<section\b/g)?.length).toBe(1);
		// …and it is slide 2, with the DECK's total — not 1 of 1.
		expect(doc).toContain('data-lattice-pagination="2"');
		expect(doc).toContain('data-lattice-pagination-total="3"');
		expect(doc).toContain('<span class="lat-pagination">2</span>');
		expect(doc).not.toContain('data-lattice-pagination="1"');
		expect(doc).not.toContain('data-lattice-pagination="3"');
		// The reported section count still describes what the frame holds (one slide), so callers
		// that key off it (DeckPreview's chart-detail re-pin uses onSlide(0)) are unaffected.
		expect(status.slides).toBe(1);
	});

	it('keeps the `.lattice` wrapper — the patch path and frame CSS both key on it', async () => {
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		await r.renderInto(host, PAGINATED, false, undefined, undefined, undefined, undefined, { slideIndex: 2 });
		const doc = srcdocOf(host);
		// `article.lattice > section` is the engine's own selector shape (lib/engine/css.js), and
		// patchSlideBody swaps `.lattice`'s innerHTML — losing the wrapper would break both.
		expect(doc).toContain('<article class="lattice">');
		expect(doc).toContain('</article>');
		expect(doc).toContain('data-lattice-pagination="3"');
	});

	it('numbers each slide of the deck differently — the grid-of-thumbnails case', async () => {
		// The most visible face of the bug: an overview grid where every tile printed "1". Each
		// tile renders the same deck and displays its own index.
		const r = createSingleSlideRenderer(opts);
		const seen: string[] = [];
		for (const i of [0, 1, 2]) {
			const host = mountHost();
			await r.renderInto(host, PAGINATED, false, undefined, undefined, undefined, undefined, { slideIndex: i });
			seen.push(srcdocOf(host).match(/data-lattice-pagination="(\d+)"/)?.[1] ?? '');
		}
		expect(seen).toEqual(['1', '2', '3']);
	});

	it('preserves the non-section markup around the sections, not just the wrapper', async () => {
		// The walk keeps every inter-section run — it removes sections, nothing else. A deck-level
		// tail node must survive being narrowed to one slide. (Note this can only assert what the
		// #22 sanitize pass also admits: a `<style>`/`<script>` tail is stripped downstream by
		// DOMPurify regardless, which is a property of the sanitizer, not of this narrowing.)
		mockRender(`<article class="lattice">${section(1, 2, 'One')}${section(2, 2, 'Two')}<div class="deck-tail">tail</div></article>`);
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		await r.renderInto(host, PAGINATED, false, undefined, undefined, undefined, undefined, { slideIndex: 1 });
		const doc = srcdocOf(host);
		expect(doc.match(/<section\b/g)?.length).toBe(1);
		expect(doc).toContain('data-lattice-pagination="2"');
		expect(doc).toContain('deck-tail');
	});

	it('omitting slideIndex renders the whole document — unchanged for standalone hosts', async () => {
		// Landing islands + component specimens render a genuinely standalone slide, where 1-of-1
		// is the truth. They must keep passing no opts at all and behave exactly as before.
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		const status = await r.renderInto(host, PAGINATED, false);
		expect(status.slides).toBe(3);
		expect(srcdocOf(host).match(/<section\b/g)?.length).toBe(3);
	});

	it('FAILS CLOSED on a slide-count mismatch — falls back to the shown slide, not a wrong one', async () => {
		// The critical case. `slideIndex` indexes the CALLER's authored slides; narrowing indexes the
		// ENGINE's sections. On a `_focusSteps` / `split: headings` deck those differ, and picking by
		// index would paint a slide the author did not select. The caller passes the count it believes
		// plus the shown slide alone; on disagreement we render that slide — right content, 1 of 1.
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		const calls: string[] = [];
		(renderMarkdown as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (_pg: unknown, md: string) => {
			calls.push(md);
			// First call: the deck (3 sections). Second call: the fallback slide alone (1 section).
			return md === 'FALLBACK' ? { html: `<article class="lattice">${section(1, 1, 'Shown')}</article>`, css: '' } : { html: DECK, css: '' };
		});
		// The engine reports 3 sections; the caller believes the deck has 5 slides → mismatch.
		const status = await r.renderInto(host, PAGINATED, false, undefined, undefined, undefined, undefined, { slideIndex: 4, slideCount: 5, slideMarkdown: 'FALLBACK' });
		expect(status.ok).toBe(true);
		expect(calls).toEqual([PAGINATED, 'FALLBACK']); // rendered the deck, then fell back to the slide
		const doc = srcdocOf(host);
		expect(doc.match(/<section\b/g)?.length).toBe(1);
		expect(doc).toContain('Shown');
		// Honest 1-of-1 rather than a confidently wrong deck position.
		expect(doc).toContain('data-lattice-pagination-total="1"');
	});

	it('narrows normally when the caller\'s count MATCHES the engine', async () => {
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		await r.renderInto(host, PAGINATED, false, undefined, undefined, undefined, undefined, { slideIndex: 1, slideCount: 3, slideMarkdown: 'unused' });
		const doc = srcdocOf(host);
		expect(doc.match(/<section\b/g)?.length).toBe(1);
		expect(doc).toContain('data-lattice-pagination="2"');
		expect(doc).toContain('data-lattice-pagination-total="3"');
	});

	it('shows the whole render as a LAST RESORT when a mismatch has no fallback markdown', async () => {
		// Only reachable from a caller that passes slideIndex without slideMarkdown — a contract
		// violation. Showing the deck is visibly odd; showing nothing is a broken preview.
		const r = createSingleSlideRenderer(opts);
		for (const bad of [-1, 3, 99]) {
			const host = mountHost();
			await r.renderInto(host, PAGINATED, false, undefined, undefined, undefined, undefined, { slideIndex: bad });
			expect(srcdocOf(host).match(/<section\b/g)?.length).toBe(3);
		}
	});

	it('is a no-op for a single-section render', async () => {
		mockRender(`<article class="lattice">${section(1, 1, 'Only')}</article>`);
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		const status = await r.renderInto(host, PAGINATED, false, undefined, undefined, undefined, undefined, { slideIndex: 0 });
		expect(status.slides).toBe(1);
		expect(srcdocOf(host)).toContain('data-lattice-pagination="1"');
	});
});

// ── The GATE: is a whole-deck render needed at all? ───────────────────────────────────────
// Found by the adversarial trio's inversion lens. Every fact deck context buys — the page number,
// inherited running-global directives, the divider-derived progress rail — requires the deck to
// carry that state. Rendering the deck unconditionally taxed the universal case (a plain prose deck
// with pagination off, which is the product's default: none of the three shipped Studio decks sets
// `paginate`) to buy correctness in the opt-in case.
describe('deck-context gate (needsDeckContext)', () => {
	it('renders the SLICE for a deck with no deck-scoped state', async () => {
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		const seen = recordRenders();
		// No paginate, no running-global directive, no divider — nothing the deck could contribute.
		await r.renderInto(host, 'plain body\n\n---\n\nmore body', false, undefined, undefined, undefined, undefined, { slideIndex: 1, slideCount: 2, slideMarkdown: 'THE SLICE' });
		expect(seen).toEqual(['THE SLICE']); // one render, of the slide alone — main's cost
	});

	it('renders the DECK when `paginate` is on', async () => {
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		const seen = recordRenders();
		const deck = '---\npaginate: true\n---\n\nbody\n\n---\n\nmore';
		await r.renderInto(host, deck, false, undefined, undefined, undefined, undefined, { slideIndex: 1, slideCount: 2, slideMarkdown: 'THE SLICE' });
		expect(seen[0]).toBe(deck); // the gate chose the deck; a later fallback is the guard's business
	});

	it('renders the DECK when a running-global directive could be inherited', async () => {
		// A bare `<!-- header: … -->` applies to its slide AND every one after, so a slice loses it.
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		const seen = recordRenders();
		const deck = 'body\n\n---\n\n<!-- header: Q3 Review -->\n\nmore';
		await r.renderInto(host, deck, false, undefined, undefined, undefined, undefined, { slideIndex: 1, slideCount: 2, slideMarkdown: 'THE SLICE' });
		expect(seen[0]).toBe(deck); // the gate chose the deck; a later fallback is the guard's business
	});

	it('renders the DECK when a divider drives the progress rail', async () => {
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		const seen = recordRenders();
		const deck = '<!-- _class: divider -->\n\n# Part One\n\n---\n\nbody';
		await r.renderInto(host, deck, false, undefined, undefined, undefined, undefined, { slideIndex: 1, slideCount: 2, slideMarkdown: 'THE SLICE' });
		expect(seen[0]).toBe(deck); // the gate chose the deck; a later fallback is the guard's business
	});

	it('a SPOT `_paginate` still needs the deck — the number is deck-relative', async () => {
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		const seen = recordRenders();
		const deck = 'body\n\n---\n\n<!-- _paginate: true -->\n\nmore';
		await r.renderInto(host, deck, false, undefined, undefined, undefined, undefined, { slideIndex: 1, slideCount: 2, slideMarkdown: 'THE SLICE' });
		expect(seen[0]).toBe(deck); // the gate chose the deck; a later fallback is the guard's business
	});

	it('`paginate: false` does NOT trigger a deck render', async () => {
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		const seen = recordRenders();
		await r.renderInto(host, '---\npaginate: false\n---\n\nbody\n\n---\n\nmore', false, undefined, undefined, undefined, undefined, { slideIndex: 1, slideCount: 2, slideMarkdown: 'THE SLICE' });
		expect(seen).toEqual(['THE SLICE']);
	});
});

describe('whole-deck memo boundedness', () => {
	// BOUNDEDNESS IS STRUCTURAL, SO TEST IT STRUCTURALLY. The memo is module-level and shared by
	// every host (deliberately — the overview grid's N tiles show one deck), so "does it grow?" is
	// the memory question that matters. Three browser attempts to answer it by watching the heap all
	// measured nothing: two drove `page.reload()` between decks, which destroys the realm and
	// recreates the memo empty, and the third's readbacks (`.cm-content.textContent`, then the
	// preview iframe) were both blind to whether the deck had actually been swapped. The property is
	// not really about the heap: it is that the memo holds AT MOST ONE entry, so alternating two
	// decks must show a miss every time rather than two warm hits.
	it('alternating two decks misses every time — the memo never holds two entries', async () => {
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		const seen = recordRenders();
		// `slideCount: 3` matches the mocked DECK's three sections — with a mismatch `narrowToSlide`
		// fails closed and the renderer falls back to the slice, which adds a second render per round
		// and makes the counts unreadable. (It did, the first time this was written.)
		const deckA = '---\npaginate: true\n---\n\nalpha\n\n---\n\ntwo\n\n---\n\nthree';
		const deckB = '---\npaginate: true\n---\n\nbeta\n\n---\n\ntwo\n\n---\n\nthree';
		const arg = { slideIndex: 1, slideCount: 3, slideMarkdown: 'SLICE' };
		for (let i = 0; i < 6; i++) await r.renderInto(host, i % 2 ? deckA : deckB, false, undefined, undefined, undefined, undefined, arg);
		// Six alternating renders, six engine calls: a two-entry cache would have served four of them
		// from memory and this would read 2.
		expect(seen).toEqual([deckB, deckA, deckB, deckA, deckB, deckA]);
	});

	it('the same deck twice in a row is served from the memo', async () => {
		// The converse, so the test above cannot pass by the memo being broken outright.
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		const seen = recordRenders();
		const arg = { slideIndex: 1, slideCount: 3, slideMarkdown: 'SLICE' };
		const deck = '---\npaginate: true\n---\n\nalpha\n\n---\n\ntwo\n\n---\n\nthree';
		for (let i = 0; i < 4; i++) await r.renderInto(host, deck, false, undefined, undefined, undefined, undefined, arg);
		expect(seen).toEqual([deck]);
	});
});

// The fact the first cut of this gate was blind to. `cat-N` on a `split-panel proof` run
// comes from the slide's ordinal among the deck's proof slides, so a slice rendered alone
// is always "the first one" and takes `cat-1` — a leveled deck presented as N identical
// panels. It survived the original gate only because the reported deck also paginates.
describe('deck-context gate — split-panel proof runs', () => {
	const proofDeck = (extra = '') =>
		`---\ntheme: indaco${extra}\n---\n\n<!-- _class: split-panel proof -->\n\n## One.\n\n---\n\n<!-- _class: split-panel proof -->\n\n## Two.`;

	it('renders the DECK for a proof run with NO paginate', async () => {
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		const seen = recordRenders();
		const deck = proofDeck();
		await r.renderInto(host, deck, false, undefined, undefined, undefined, undefined, { slideIndex: 1, slideCount: 2, slideMarkdown: 'THE SLICE' });
		expect(seen[0]).toBe(deck);
	});

	it('renders the DECK for a capstone run (capstone implies proof)', async () => {
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		const seen = recordRenders();
		const deck = '<!-- _class: split-panel capstone -->\n\n## One.\n\n---\n\nbody';
		await r.renderInto(host, deck, false, undefined, undefined, undefined, undefined, { slideIndex: 1, slideCount: 2, slideMarkdown: 'THE SLICE' });
		expect(seen[0]).toBe(deck);
	});

	it('renders the DECK when the class arrives via front matter rather than a directive', async () => {
		// deckClassPropagate can supply `split-panel` deck-wide, so the probe must not
		// require the token to sit in the same directive comment.
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		const seen = recordRenders();
		const deck = '---\nclass: split-panel proof\n---\n\n## One.\n\n---\n\n## Two.';
		await r.renderInto(host, deck, false, undefined, undefined, undefined, undefined, { slideIndex: 1, slideCount: 2, slideMarkdown: 'THE SLICE' });
		expect(seen[0]).toBe(deck);
	});

	it('still renders the SLICE for a deck with neither proof nor any other deck-derived fact', async () => {
		// The optimization has to survive: adding a fact must not make every deck pay.
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		const seen = recordRenders();
		await r.renderInto(host, '<!-- _class: split-panel -->\n\n## Plain.\n\n---\n\nbody', false, undefined, undefined, undefined, undefined, { slideIndex: 1, slideCount: 2, slideMarkdown: 'THE SLICE' });
		expect(seen).toEqual(['THE SLICE']);
	});
});

// STRUCTURAL, not behavioral. The gate is a registry precisely so that adding a
// deck-derived feature is one entry with a stated reason, instead of a regex appended to
// an anonymous chain — which is how `split-panel proof` came to be missing. These assert
// the registry stays self-describing, so a future entry cannot be half-added.
describe('deck-derived fact registry', () => {
	it('every fact is named, justified, and has at least one probe', () => {
		expect(DECK_DERIVED_FACTS.length).toBeGreaterThan(0);
		for (const f of DECK_DERIVED_FACTS) {
			expect(f.fact, 'fact needs a name').toBeTruthy();
			expect(f.why.length, `${f.fact} needs a stated reason`).toBeGreaterThan(20);
			expect(f.probes.length, `${f.fact} needs a probe`).toBeGreaterThan(0);
		}
	});

	it('names are unique, so a duplicate entry is visible', () => {
		const names = DECK_DERIVED_FACTS.map((f) => f.fact);
		expect(new Set(names).size).toBe(names.length);
	});

	// THE ONE THAT ACTUALLY GUARDS. Every other assertion in this block iterates
	// DECK_DERIVED_FACTS, so DELETING a fact deletes it from the check and they all still
	// pass — verified: removing the `glossary: auto` entry left the whole repo green. That is
	// the exact bug class this registry is presented as closing, reproduced against the
	// registry itself, found by an inversion review.
	//
	// So the expected SET is pinned by name. Removing an entry now fails here, and adding one
	// fails too — deliberately, because a new deck-derived fact should force a human to
	// confirm it belongs and to add a BEHAVIORAL test for it, not merely to have been typed.
	// This is a tripwire, not a description: it cannot detect a fact nobody registered, which
	// is a real remaining gap (see the note in single-slide-render.ts).
	it('the registry holds exactly the expected facts — deleting one FAILS here', () => {
		expect(DECK_DERIVED_FACTS.map((f) => f.fact).sort()).toEqual([
			'divider',
			'glossary: auto',
			'pagination',
			'running-global directive',
			'split-panel proof run',
		]);
	});

	it('every probe actually matches something — no dead regex', () => {
		// A probe that can never fire is worse than no probe: it reads as coverage.
		const samples = [
			'---\npaginate: true\n---\n\nbody',
			'<!-- _paginate: true -->\n\nbody',
			'<!-- header: Q3 -->\n\nbody',
			'<!-- _class: divider -->\n\nbody',
			'---\nglossary: auto\n---\n\nbody',
			'<!-- _class: split-panel proof -->\n\nbody',
			'<!-- _class: split-panel capstone -->\n\nbody',
			'---\nclass: split-panel proof\n---\n\nbody',
		];
		for (const f of DECK_DERIVED_FACTS) {
			for (const p of f.probes) {
				expect(samples.some((s) => p.test(s)), `${f.fact}: probe ${p} matches none of the samples`).toBe(true);
			}
		}
	});

	it('the glossary fact has BEHAVIORAL coverage, not just a registry row', () => {
		// It was the only entry with none — which is how its deletion went unnoticed.
		const g = DECK_DERIVED_FACTS.find((f) => f.fact === 'glossary: auto');
		expect(g?.probes.some((p) => p.test('---\nglossary: auto\n---\n\nbody'))).toBe(true);
		expect(g?.probes.some((p) => p.test('---\nglossary: manual\n---\n\nbody'))).toBe(false);
	});

	it('covers the proof run — the fact whose absence was the reported bug', () => {
		const proof = DECK_DERIVED_FACTS.find((f) => /proof/i.test(f.fact));
		expect(proof, 'a split-panel proof fact must be registered').toBeDefined();
		expect(proof?.probes.some((p) => p.test('<!-- _class: split-panel proof -->'))).toBe(true);
	});
});
