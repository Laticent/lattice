// The preview THROUGH A SPLIT PANES SLIDE (`renderInto`'s `opts.paneCounts` / `opts.panePage`).
//
// A panes slide the engine splits renders as one slide per pane, so the caller's source slide k
// stops being section k after one (docs/src/components/studio/pane-pages.ts). Without the map the
// whole-deck render failed alignment and fell back to the chunk alone, and the #1551 one-page
// guard kept its FIRST page: the second pane was unreachable and every later slide was "1 of 1".
// The engine is mocked (the map is checked against the real engine in pane-pages.test.ts); what
// is under test is the narrowing, the page pick, the page report, and the supplied position.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./render-engine', () => ({ renderMarkdown: vi.fn() }));
vi.mock('./theme-fetch', () => ({
	createThemeFetcher: () => ({ ensure: async () => {}, ensureBase: async () => {}, ensureKatexFaces: async () => {}, katexFacesActive: () => false, fetch: async () => {} }),
}));
vi.mock('../playground/font-embed.js', () => ({ previewFontFaceCss: () => '' }));

import { renderMarkdown } from './render-engine';
import { clearDeckMemo, clearSliceCache, createSingleSlideRenderer } from './single-slide-render';

const opts = { themeBase: 'https://x/themes/', runtimeUrl: 'https://x/rt.js' };
const mock = () => renderMarkdown as unknown as ReturnType<typeof vi.fn>;

const section = (n: number, total: number, body: string) =>
	`<section class="form" id="${n}" data-paginate="true" data-lattice-pagination="${n}" data-lattice-pagination-total="${total}">` +
	`<div class="cell-stage"><h1>${body}</h1></div></section>`;
// Three SOURCE slides, the middle one a split panes slide: four rendered sections.
const DECK4 = `<article class="lattice">\n${section(1, 4, 'Opening')}\n${section(2, 4, 'Pane A')}\n${section(3, 4, 'Pane B')}\n${section(4, 4, 'After')}\n</article>`;
const ALONE = `<article class="lattice">\n${section(1, 2, 'Pane A')}\n${section(2, 2, 'Pane B')}\n</article>`;
// A deck that needs the whole-deck render (a running global), so narrowing is exercised.
const DECK_SCOPED = '<!-- header: Q3 -->\n\nbody';

beforeEach(() => {
	class RO {
		observe = vi.fn();
		unobserve = vi.fn();
		disconnect = vi.fn();
	}
	(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
	(window as unknown as { LatticePlayground: unknown }).LatticePlayground = { hasTheme: () => false, addThemes: () => {} };
	mock().mockReset();
	clearDeckMemo();
	clearSliceCache();
	mock().mockImplementation(async (_pg: unknown, md: string) => ({ html: md === 'ALONE' ? ALONE : DECK4, css: '' }));
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
const srcdocOf = (host: HTMLElement) => host.querySelector<HTMLIFrameElement>('iframe.live')?.srcdoc ?? '';
const counts = [1, 2, 1];

describe('whole-deck render through a split panes slide', () => {
	it('the slide AFTER the split narrows to its own section, numbered as the PDF numbers it', async () => {
		const host = mountHost();
		const r = createSingleSlideRenderer(opts);
		const status = await r.renderInto(host, DECK_SCOPED, false, undefined, undefined, undefined, undefined, { slideIndex: 2, slideCount: 3, slideMarkdown: 'ALONE', paneCounts: counts });
		const doc = srcdocOf(host);
		expect(doc.match(/<section\b/g)?.length).toBe(1);
		expect(doc).toContain('After');
		expect(doc).toContain('data-lattice-pagination="4"');
		expect(mock().mock.calls.map((c) => c[1])).toEqual([DECK_SCOPED]); // no fallback render
		expect(status.page).toBeUndefined();
	});

	it('WITHOUT the map the same deck fails closed to the slide alone — the bug this fixes', async () => {
		const host = mountHost();
		const r = createSingleSlideRenderer(opts);
		await r.renderInto(host, DECK_SCOPED, false, undefined, undefined, undefined, undefined, { slideIndex: 2, slideCount: 3, slideMarkdown: 'ALONE' });
		expect(mock().mock.calls.map((c) => c[1])).toEqual([DECK_SCOPED, 'ALONE']);
	});

	it('the split slide shows the caret’s page, and reports the run so ‹ › can step it', async () => {
		const host = mountHost();
		const r = createSingleSlideRenderer(opts);
		const status = await r.renderInto(host, DECK_SCOPED, false, undefined, undefined, undefined, undefined, { slideIndex: 1, slideCount: 3, slideMarkdown: 'ALONE', paneCounts: counts, panePage: 1, deckId: 'd' });
		const doc = srcdocOf(host);
		expect(doc).toContain('Pane B');
		expect(doc).not.toContain('Pane A');
		expect(status.page).toMatchObject({ index: 1, count: 2, label: '3' });
		expect(status.canSplit).toBe(true);
	});

	it('an explicit page from navigation wins over the caret, and past-the-end means the last page', async () => {
		const host = mountHost();
		const r = createSingleSlideRenderer(opts);
		const a = await r.renderInto(host, DECK_SCOPED, false, undefined, undefined, undefined, undefined, { slideIndex: 1, slideCount: 3, slideMarkdown: 'ALONE', paneCounts: counts, panePage: 1, pageIndex: 0, deckId: 'd' });
		expect(a.page?.index).toBe(0);
		const b = await r.renderInto(host, DECK_SCOPED, false, undefined, undefined, undefined, undefined, { slideIndex: 1, slideCount: 3, slideMarkdown: 'ALONE', paneCounts: counts, pageIndex: Number.POSITIVE_INFINITY, deckId: 'd' });
		expect(b.page?.index).toBe(1);
	});

	it('a caret that places nowhere keeps the page already shown', async () => {
		const host = mountHost();
		const r = createSingleSlideRenderer(opts);
		await r.renderInto(host, DECK_SCOPED, false, undefined, undefined, undefined, undefined, { slideIndex: 1, slideCount: 3, slideMarkdown: 'ALONE', paneCounts: counts, panePage: 1, deckId: 'd' });
		const kept = await r.renderInto(host, `${DECK_SCOPED} `, false, undefined, undefined, undefined, undefined, { slideIndex: 1, slideCount: 3, slideMarkdown: 'ALONE', paneCounts: counts, deckId: 'd' });
		expect(kept.page?.index).toBe(1);
	});

	it('a map whose length is not the slide count is ignored', async () => {
		const host = mountHost();
		const r = createSingleSlideRenderer(opts);
		await r.renderInto(host, DECK_SCOPED, false, undefined, undefined, undefined, undefined, { slideIndex: 2, slideCount: 3, slideMarkdown: 'ALONE', paneCounts: [1, 2] });
		expect(mock().mock.calls.map((c) => c[1])).toEqual([DECK_SCOPED, 'ALONE']);
	});
});

describe('slice render through a split panes slide', () => {
	// A real panes deck never reaches the slice route today: `<!-- pane: X -->` reads as a running
	// global to the route gate, so it takes the whole-deck render above. The slice route still has
	// to be right when it IS taken (a fallback render, or a gate that learns the marker), so these
	// drive it with a deck that paginates and nothing else, handing the renderer the map directly.
	const PAGINATED = '---\npaginate: true\n---\n\nOpening\n\n---\n\nsplit\n\n---\n\nAfter';
	it('keeps the caret’s page of the lone slide, not always the first', async () => {
		const host = mountHost();
		const r = createSingleSlideRenderer(opts);
		await r.renderInto(host, PAGINATED, false, undefined, undefined, undefined, undefined, { slideIndex: 1, slideCount: 3, slideMarkdown: 'ALONE', paneCounts: counts, panePage: 1 });
		expect(mock().mock.calls.map((c) => c[1])).toEqual(['ALONE']);
		expect(srcdocOf(host)).toContain('Pane B');
		expect(srcdocOf(host)).not.toContain('Pane A');
	});

	it('supplies the RENDERED position: the slide after the split is 0-based section 3 of 4', async () => {
		const host = mountHost();
		const r = createSingleSlideRenderer(opts);
		await r.renderInto(host, PAGINATED, false, undefined, undefined, undefined, undefined, { slideIndex: 2, slideCount: 3, slideMarkdown: 'ALONE', paneCounts: counts });
		expect(mock().mock.calls[0][3]).toMatchObject({ page: { offset: 3, total: 4 } });
	});
});

describe('author CSS reaches a pane (extraCss)', () => {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const paneCss = require('../../../lib/core/pane-css.js') as {
		widenForPanes: (css: string, classes: string[], components?: string[]) => string;
		paneClasses: (html: string) => string[];
		paneComponents: (html: string) => string[];
	};
	// The playground bundle's `widenPaneCss`, built from the same kernel.
	const widenPaneCss = (css: string, html: string) => {
		const classes = paneCss.paneClasses(html);
		return classes.length ? paneCss.widenForPanes(css, classes, paneCss.paneComponents(html)) : css;
	};
	const PANED = `<article class="lattice">\n<section class="lat-pane-host"><div class="cell-stage"><lat-pane class="my-card form"><ul><li>a</li></ul></lat-pane></div></section>\n</article>`;

	it('a saved component\'s rule gains its pane twin in the frame; a deck without panes keeps it as written', async () => {
		(window as unknown as { LatticePlayground: unknown }).LatticePlayground = { hasTheme: () => false, addThemes: () => {}, widenPaneCss };
		mock().mockImplementation(async (_pg: unknown, md: string) => ({ html: md === 'PANES' ? PANED : DECK4, css: '' }));
		const css = 'section.my-card li { letter-spacing: 1px; }';
		const host = mountHost();
		await createSingleSlideRenderer(opts).renderInto(host, 'PANES', false, undefined, undefined, undefined, css);
		expect(srcdocOf(host)).toContain('section.my-card li, section lat-pane.my-card li{');
		const plainHost = mountHost();
		await createSingleSlideRenderer(opts).renderInto(plainHost, 'PLAIN', false, undefined, undefined, undefined, css);
		expect(srcdocOf(plainHost)).toContain(css);
		expect(srcdocOf(plainHost)).not.toContain('lat-pane.my-card');
	});
});
