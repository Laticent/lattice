/**
 * DOES THE HOST PRODUCE THE RIGHT STAMP? — the question nothing asked.
 *
 * `data-lattice-swap` is what licenses the runtime to hold a rendered diagram on screen
 * while an edited fence re-renders. The runtime's own 24 arms all FEED it a stamp; before
 * this file, deleting the host-side answer entirely (an unconditional `'in-place'` here and
 * in `patchSections`) left 9134 root tests, 3889 docs tests and `check:ownership` green.
 * That is how a wrong stamp for the Studio's Delete-slide button reached a screenshot.
 *
 * These arms drive the real `renderInto` over the repo's own live-document harness and read
 * the attribute off the frame. The decision itself is unit-tested in
 * test/unit/core/swap-kind.test.js; what is tested HERE is the wiring — that this host asks,
 * and stamps what it is told, on every path that writes.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./render-engine', () => ({ renderMarkdown: vi.fn() }));
vi.mock('./theme-fetch', () => ({
	createThemeFetcher: () => ({ ensure: async () => {}, ensureBase: async () => {}, ensureKatexFaces: async () => {}, katexFacesActive: () => false, fetch: async () => {} }),
}));
vi.mock('../playground/font-embed.js', () => ({ previewFontFaceCss: () => '' }));

import { renderMarkdown } from './render-engine';
import { clearDeckMemo, clearSanitizeMemo, clearSliceCache, createSingleSlideRenderer } from './single-slide-render';

const opts = { themeBase: 'https://x/themes/', runtimeUrl: 'https://x/rt.js' };
const engine = () => renderMarkdown as unknown as ReturnType<typeof vi.fn>;

const slide = (word: string, n: number) => `# ${word} ${n}\n\nBody copy for ${word} slide ${n}.\n`;
const deckOf = (...slides: string[]) => slides.join('\n---\n\n');
const DECK = deckOf(slide('alpha', 1), slide('bravo', 2), slide('charlie', 3));

const titleOf = (chunk: string) => (chunk.split('\n').find((l) => l.startsWith('# ')) ?? '').slice(2).trim();
const htmlFor = (src: string) =>
	`<article class="lattice">${src
		.split(/\n-{3,}\n/)
		.map((s, i) => `<section class="form" id="${i + 1}"><div class="cell-stage"><h1>${titleOf(s)}</h1></div></section>`)
		.join('')}</article>`;

beforeEach(() => {
	class RO {
		observe = vi.fn();
		unobserve = vi.fn();
		disconnect = vi.fn();
	}
	(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
	(window as unknown as { LatticePlayground: unknown }).LatticePlayground = { hasTheme: () => false, addThemes: () => {} };
	engine().mockReset();
	engine().mockImplementation(async (_pg: unknown, src: string) => ({ html: htmlFor(src), css: '' }));
	clearDeckMemo();
	clearSliceCache();
	clearSanitizeMemo();
	document.body.innerHTML = '';
});

function mountHost() {
	const host = document.createElement('figure');
	document.body.appendChild(host);
	return host;
}

/** jsdom never parses the iframe's srcdoc, so furnish what the patch path looks for. */
function fakeLiveDocument(host: HTMLElement): Document {
	const doc = (host.querySelector('iframe') as HTMLIFrameElement).contentDocument as Document;
	doc.head.innerHTML = '<style id="lattice-theme">/* the resident sheet */</style>';
	doc.body.innerHTML = '<article class="lattice"><section class="form" id="1"><div class="cell-stage"><h1>resident</h1></div></section></article>';
	(host as HTMLElement & { __latticePendingLoad?: boolean }).__latticePendingLoad = false;
	return doc;
}

async function show(r: ReturnType<typeof createSingleSlideRenderer>, host: HTMLElement, deck: string, i: number, mermaid = false) {
	const parts = deck.split(/\n-{3,}\n/);
	return r.renderInto(host, deck, mermaid, undefined, undefined, undefined, undefined, {
		slideIndex: i,
		slideCount: parts.length,
		slideMarkdown: parts[i],
		focused: true,
	});
}

/** The attribute as the runtime's observer would read it, off the live frame. */
const stamp = (host: HTMLElement) => {
	const doc = (host.querySelector('iframe') as HTMLIFrameElement).contentDocument as Document;
	return doc.querySelector('.lattice')?.getAttribute('data-lattice-swap') ?? null;
};

describe('patchSlideBody stamps the swap kind the runtime acts on', () => {
	it('EDITING the shown slide stamps in-place — the case the hold exists for', async () => {
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		await show(r, host, DECK, 1);
		fakeLiveDocument(host);
		await show(r, host, DECK, 1); // settle onto the patch path
		const edited = deckOf(slide('alpha', 1), '# bravo 2\n\nBody copy, now edited.\n', slide('charlie', 3));
		await show(r, host, edited, 1);
		expect(stamp(host)).toBe('in-place');
	});

	it('DELETING a slide stamps reflow, though the shown index does not move', async () => {
		// The Studio's Delete-slide button: `deleteSlide` clamps the active index, so index 1
		// stays 1 and a different slide arrives under it. Stamped `in-place`, this painted the
		// deleted slide's diagram over its replacement for ~136ms on the built Studio.
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		await show(r, host, DECK, 1);
		fakeLiveDocument(host);
		await show(r, host, DECK, 1);
		await show(r, host, deckOf(slide('alpha', 1), slide('charlie', 3)), 1);
		expect(stamp(host)).toBe('reflow');
	});

	it('NAVIGATING to another slide stamps reflow', async () => {
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		await show(r, host, DECK, 1);
		fakeLiveDocument(host);
		await show(r, host, DECK, 1);
		await show(r, host, DECK, 2);
		expect(stamp(host)).toBe('reflow');
	});

	it('opening a DIFFERENT DECK at the same index stamps reflow', async () => {
		// `openDeck` does `setActiveSlide(0)` and the host is not remounted, so without deck
		// identity in the comparison this was deck A slide 0 vs deck B slide 0 — "same slide".
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		await show(r, host, DECK, 0);
		fakeLiveDocument(host);
		await show(r, host, DECK, 0);
		await show(r, host, deckOf(slide('zulu', 1), slide('yankee', 2), slide('xray', 3)), 0);
		expect(stamp(host)).toBe('reflow');
	});

	it('a FULL WRITE re-stamps the identity, so a return trip is not mistaken for an edit', async () => {
		// The mutant that survived every suite: `stampShownSlide()` was called only on the
		// patch and restyle paths, so a full write left the identity describing a slide the
		// frame was no longer showing — and navigating back to it read `in-place`.
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		await show(r, host, DECK, 1);
		fakeLiveDocument(host);
		await show(r, host, DECK, 1); // settle onto the patch path, identity = slide 1
		// Force a full write by flipping the mermaid flag, which is part of the frame `sig`.
		await show(r, host, DECK, 0, true);
		fakeLiveDocument(host);
		// Back to slide 1, with the flag now MATCHING the resident frame so this one patches.
		await show(r, host, DECK, 1, true); // a navigation, not an edit
		expect(stamp(host)).toBe('reflow');
	});

	it('a ONE-SLIDE deck without a deckId stamps reflow — two of them are indistinguishable', async () => {
		// `newDeckSource()` emits one slide, so this is the shape every Studio deck starts as.
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		const A1 = slide('alpha', 1);
		await show(r, host, A1, 0);
		fakeLiveDocument(host);
		await show(r, host, A1, 0);
		await show(r, host, slide('zulu', 1), 0);
		expect(stamp(host)).toBe('reflow');
	});

	it('a render with no slideIndex stamps reflow — a specimen has no deck to compare', async () => {
		// LayoutStudio, Fabricate and FieldCardsLive render one specimen without deck context.
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		await r.renderInto(host, DECK, false);
		fakeLiveDocument(host);
		await r.renderInto(host, DECK, false);
		await r.renderInto(host, `${DECK}\n\nmore`, false);
		expect(stamp(host)).toBe('reflow');
	});
});
