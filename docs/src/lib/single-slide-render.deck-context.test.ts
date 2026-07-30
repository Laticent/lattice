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
import { clearDeckMemo, createSingleSlideRenderer } from './single-slide-render';

const opts = { themeBase: 'https://x/themes/', runtimeUrl: 'https://x/rt.js' };

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

describe('deck-context render (renderInto opts.slideIndex)', () => {
	it('shows ONE section carrying the page number the engine computed for the DECK', async () => {
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		// Slide 2 of a 3-slide deck. Before this option, the caller passed slide 2's markdown
		// ALONE and the engine — correctly, for a one-slide document — stamped it "1 of 1".
		const status = await r.renderInto(host, 'whole deck source', false, undefined, undefined, undefined, undefined, { slideIndex: 1 });
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
		await r.renderInto(host, 'deck', false, undefined, undefined, undefined, undefined, { slideIndex: 2 });
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
			await r.renderInto(host, 'deck', false, undefined, undefined, undefined, undefined, { slideIndex: i });
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
		await r.renderInto(host, 'deck', false, undefined, undefined, undefined, undefined, { slideIndex: 1 });
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
		const status = await r.renderInto(host, 'deck', false);
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
		const status = await r.renderInto(host, 'deck', false, undefined, undefined, undefined, undefined, { slideIndex: 4, slideCount: 5, slideMarkdown: 'FALLBACK' });
		expect(status.ok).toBe(true);
		expect(calls).toEqual(['deck', 'FALLBACK']); // re-rendered the shown slide
		const doc = srcdocOf(host);
		expect(doc.match(/<section\b/g)?.length).toBe(1);
		expect(doc).toContain('Shown');
		// Honest 1-of-1 rather than a confidently wrong deck position.
		expect(doc).toContain('data-lattice-pagination-total="1"');
	});

	it('narrows normally when the caller\'s count MATCHES the engine', async () => {
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		await r.renderInto(host, 'deck', false, undefined, undefined, undefined, undefined, { slideIndex: 1, slideCount: 3, slideMarkdown: 'unused' });
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
			await r.renderInto(host, 'deck', false, undefined, undefined, undefined, undefined, { slideIndex: bad });
			expect(srcdocOf(host).match(/<section\b/g)?.length).toBe(3);
		}
	});

	it('is a no-op for a single-section render', async () => {
		mockRender(`<article class="lattice">${section(1, 1, 'Only')}</article>`);
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		const status = await r.renderInto(host, 'deck', false, undefined, undefined, undefined, undefined, { slideIndex: 0 });
		expect(status.slides).toBe(1);
		expect(srcdocOf(host)).toContain('data-lattice-pagination="1"');
	});
});
