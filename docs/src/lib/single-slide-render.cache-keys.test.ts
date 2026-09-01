// A HASH KEY IS A FILTER, NOT AN ANSWER.
//
// `deckMemo` and `sliceCache` (single-slide-render.ts) key on `memoKey`, which hashes the deck
// source and both author-CSS channels with djb2-32 and appends the source length. 32 bits decide
// whether two decks are "the same" — and a collision serves ANOTHER DECK'S rendered slide into
// the same-origin preview frame, which is the failure `lib/core/slide-boundaries.mjs` refuses at
// length for its own memo while these two did not (#1543; Amendment 7 of
// 2026-07-30-preview-deck-context-and-render-cost.md logged it as a live defect).
//
// Both caches now confirm a hit against the inputs the key only hashed. These tests FORCE the
// collision — `hashString` is stubbed to a constant, so any two decks of equal length share a
// key — and assert the wrong render is never served. Without the confirmation every case here
// fails by showing deck B the slide it rendered for deck A.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./render-engine', () => ({ renderMarkdown: vi.fn() }));
vi.mock('./theme-fetch', () => ({
	createThemeFetcher: () => ({ ensure: async () => {}, ensureBase: async () => {}, ensureKatexFaces: async () => {}, katexFacesActive: () => false, fetch: async () => {} }),
}));
vi.mock('../playground/font-embed.js', () => ({ previewFontFaceCss: () => '' }));
// THE COLLISION. Every string hashes to the same 32-bit value, which is what djb2-32 does to some
// pair of real decks eventually — this just makes "eventually" deterministic.
vi.mock('../playground/deck-preview.js', async (importOriginal) => {
	const actual = (await importOriginal()) as typeof import('../playground/deck-preview.js');
	return { ...actual, hashString: () => 1 };
});

import { renderMarkdown } from './render-engine';
import { clearDeckMemo, clearSanitizeMemo, clearSliceCache, createSingleSlideRenderer } from './single-slide-render';

const opts = { themeBase: 'https://x/themes/', runtimeUrl: 'https://x/rt.js' };
const engine = () => renderMarkdown as unknown as ReturnType<typeof vi.fn>;

/** Two decks of EXACTLY equal length and equal slide count — same key, different content. */
const deckOf = (word: string) => Array.from({ length: 8 }, (_, i) => `# ${word} ${i + 1}\n\nBody copy for ${word} slide ${i + 1}.\n`).join('\n---\n\n');
const DECK_A = deckOf('alpha');
const DECK_B = deckOf('bravo');
/** A deck-derived fact (a running header) buys the WHOLE-DECK route — the `deckMemo` side. */
const CONTEXT_A = `<!-- header: Alpha Board Review -->\n\n${DECK_A}`;
const CONTEXT_B = `<!-- header: Bravo Board Review -->\n\n${DECK_B}`;

/** The engine stand-in: one section per chunk, titled from that chunk's heading. */
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
});

function mountHost() {
	const host = document.createElement('figure');
	document.body.appendChild(host);
	return host;
}

async function show(r: ReturnType<typeof createSingleSlideRenderer>, host: HTMLElement, deck: string, i: number) {
	const parts = deck.split(/\n-{3,}\n/);
	return r.renderInto(host, deck, false, undefined, undefined, undefined, undefined, {
		slideIndex: i,
		slideCount: parts.length,
		slideMarkdown: parts[i],
		focused: true,
	});
}
const shownHtml = (host: HTMLElement) => host.querySelector('iframe')?.getAttribute('srcdoc') ?? '';

/**
 * jsdom creates the preview iframe but never parses its `srcdoc`, so `contentDocument` stays
 * empty and the patch / restyle fast paths are unreachable — every render takes the full write.
 * This furnishes the frame with what those paths look for (a live `.lattice` and the resident
 * theme `<style>`), which is the difference between testing the gate and testing nothing.
 */
function fakeLiveDocument(host: HTMLElement): Document {
	const doc = (host.querySelector('iframe') as HTMLIFrameElement).contentDocument as Document;
	doc.head.innerHTML = '<style id="lattice-theme">/* the resident sheet */</style>';
	doc.body.innerHTML = '<article class="lattice"><section class="form" id="1"><div class="cell-stage"><h1>resident</h1></div></section></article>';
	(host as HTMLElement & { __latticePendingLoad?: boolean }).__latticePendingLoad = false;
	return doc;
}

describe('render caches — a colliding key does not serve another deck', () => {
	it('the decks really do collide, so these tests test something', () => {
		// The premise, asserted rather than assumed: equal lengths and (with hashString stubbed)
		// equal hashes on every keyed input. If a future edit desynchronizes the fixtures, this
		// fails here instead of silently turning every case below into a plain cache miss.
		expect(DECK_A.length).toBe(DECK_B.length);
		expect(DECK_A).not.toBe(DECK_B);
		expect(CONTEXT_A.length).toBe(CONTEXT_B.length);
	});

	it('slice cache: deck B gets its own render, not deck A\'s slide', async () => {
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		await show(r, host, DECK_A, 2);
		expect(engine()).toHaveBeenCalledTimes(1);
		expect(shownHtml(host)).toContain('alpha 3');
		await show(r, host, DECK_B, 2);
		expect(engine(), 'the colliding key was trusted — deck B was served deck A\'s cached render').toHaveBeenCalledTimes(2);
		expect(shownHtml(host)).toContain('bravo 3');
		expect(shownHtml(host)).not.toContain('alpha');
	});

	it('deck memo: a whole-deck render is not reused across a collision', async () => {
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		await show(r, host, CONTEXT_A, 1);
		expect(engine()).toHaveBeenCalledTimes(1);
		expect(shownHtml(host)).toContain('alpha 2');
		await show(r, host, CONTEXT_B, 1);
		expect(engine(), 'the whole-deck memo served deck B the render it made for deck A').toHaveBeenCalledTimes(2);
		expect(shownHtml(host)).toContain('bravo 2');
	});

	it('author CSS is confirmed too — same deck, different live component CSS', async () => {
		// `extraCss` and the component-CSS channel are hashed into the key the same way, and a
		// Studio author edits them live. Serving the previous CSS's render is the same defect.
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		const parts = DECK_A.split(/\n-{3,}\n/);
		const draw = (css: string) =>
			r.renderInto(host, DECK_A, false, undefined, undefined, undefined, css, { slideIndex: 0, slideCount: parts.length, slideMarkdown: parts[0], focused: true });
		await draw('.a{color:red}');
		expect(engine()).toHaveBeenCalledTimes(1);
		await draw('.a{color:blue}'); // same length, same hash under the stub
		expect(engine(), 'a live CSS edit hit the colliding key and reused the old render').toHaveBeenCalledTimes(2);
		expect(shownHtml(host)).toContain('color:blue');
	});

	it('the PATCH fast path confirms the author CSS too — a colliding sig cannot skip the restyle', async () => {
		// The third djb2 key in this file is the patch gate's frame signature, which hashes the same
		// two CSS channels. A collision there is not another deck's content — the patch reuses the
		// RESIDENT <style>, so the author's live CSS edit silently never applies. The patch path
		// needs a live document, which jsdom does not build from a srcdoc, so it is faked here:
		// that is what makes this reachable at all, and the write-path assertion is the observable.
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		const parts = DECK_A.split(/\n-{3,}\n/);
		const draw = (css: string, i: number) =>
			r.renderInto(host, DECK_A, false, undefined, undefined, undefined, css, { slideIndex: i, slideCount: parts.length, slideMarkdown: parts[i], focused: true });
		await draw('.a{color:red}', 0);
		fakeLiveDocument(host);
		const same = await draw('.a{color:red}', 1);
		expect(same.writePath, 'unchanged CSS must still take the cheap patch path — this guard must not cost the fast path').toBe('patch');
		fakeLiveDocument(host);
		const edited = await draw('.a{color:blue}', 2); // same length, same hash under the stub
		expect(edited.writePath, 'the colliding signature was trusted — the edit patched the body and left the old <style> resident').not.toBe('patch');
		const resident = (host.querySelector('iframe') as HTMLIFrameElement).contentDocument?.getElementById('lattice-theme')?.textContent ?? '';
		expect(resident, 'the new author CSS never reached the frame').toContain('color:blue');
	});

	it("the DERIVED-THEME css channel is confirmed too, not just the author's", async () => {
		// `extra.css` is Fabricate's live derived theme, hashed into the key exactly like `extraCss`.
		// It had no test at all: every renderInto call in the docs suite passes `undefined` there, so
		// both sides of that comparison were always '' === '' and the clause could be deleted with the
		// whole suite still green. It is also the channel this PR is most about — a live theme edit
		// landing on a colliding key is the "the edit silently never applied" failure.
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		const parts = DECK_A.split(/\n-{3,}\n/);
		const draw = (css: string) =>
			r.renderInto(host, DECK_A, false, undefined, { name: 'derived', css }, undefined, undefined, {
				slideIndex: 0,
				slideCount: parts.length,
				slideMarkdown: parts[0],
				focused: true,
			});
		await draw('.t{--bg:#010101}');
		expect(engine()).toHaveBeenCalledTimes(1);
		await draw('.t{--bg:#020202}'); // same length, same hash under the stub
		expect(engine(), 'a derived-theme edit hit the colliding key and reused the old render').toHaveBeenCalledTimes(2);
		// The call count is the whole observable here, and deliberately so: a derived theme reaches
		// the frame as the ENGINE's `out.css`, which the stand-in above does not model. What matters
		// is that the edit was not answered from a colliding cache entry.
	});

	it('a rejected hit is replaced, so the collision cannot serve twice', async () => {
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		await show(r, host, DECK_A, 0);
		await show(r, host, DECK_B, 0); // collides, rejected, re-rendered, entry overwritten
		expect(engine()).toHaveBeenCalledTimes(2);
		await show(r, host, DECK_B, 0); // now a real hit on B's own entry
		expect(engine(), 'deck B should now be cached under that key').toHaveBeenCalledTimes(2);
		expect(shownHtml(host)).toContain('bravo 1');
	});
});
