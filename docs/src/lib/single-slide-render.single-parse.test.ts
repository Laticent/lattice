/**
 * THE PATCH PATH PARSES SANITIZED MARKUP ONCE (#1993).
 *
 * DOMPurify's verdict holds for the tree it saw, which is the tree the FIRST parse of its output
 * builds. `patchSlideBody` used to parse that output into a holder and then write
 * `holder.innerHTML` back into the live `.lattice`, so the frame got a SECOND parse of a
 * serialization. Mutation XSS lives exactly in that gap: some trees do not survive a
 * serialize-and-parse round trip, and the second tree can hold an element the first one did not.
 *
 * The payload below is the nested-`<form>` shape that bypassed DOMPurify 2.0.0. Parsed once, the
 * `<img onerror>` is text inside a `<style>`; serialized and parsed again, the nested form is
 * dropped, the `<style>` moves into the MathML namespace and the `<img>` becomes a live element.
 * The first arm passes it straight through (a sanitizer that judged the first parse) and asserts
 * the live frame holds the first parse's tree; it is the arm that fails on the old double parse. The
 * second arm runs the real sanitizer and asserts the live frame equals its output, node for node; the
 * real sanitizer already neutralizes this payload, so that arm guards against a regression in the swap
 * itself and passes on the old code too.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const sanitizer = vi.hoisted(() => ({ passThrough: true }));

vi.mock('./render-engine', () => ({ renderMarkdown: vi.fn() }));
vi.mock('./theme-fetch', () => ({
	createThemeFetcher: () => ({ ensure: async () => {}, ensureBase: async () => {}, ensureKatexFaces: async () => {}, katexFacesActive: () => false, fetch: async () => {} }),
}));
vi.mock('../playground/font-embed.js', () => ({ previewFontFaceCss: () => '' }));
vi.mock('./sanitize-slide-html.js', async (importOriginal) => {
	const real = await importOriginal<typeof import('./sanitize-slide-html.js')>();
	return { ...real, sanitizeSlideHtml: (html: string) => (sanitizer.passThrough ? html : real.sanitizeSlideHtml(html)) };
});

import { renderMarkdown } from './render-engine';
import { sanitizeSlideHtml } from './sanitize-slide-html.js';
import { clearDeckMemo, clearSanitizeMemo, clearSliceCache, createSingleSlideRenderer } from './single-slide-render';

const opts = { themeBase: 'https://x/themes/', runtimeUrl: 'https://x/rt.js' };
const engine = () => renderMarkdown as unknown as ReturnType<typeof vi.fn>;

const MXSS = '<form><math><mtext></form><form><mglyph><style></math><img src onerror="window.__mxss=1">';
const DECK = '# one\n\n---\n\n# two\n';
let body = '';

beforeEach(() => {
	class RO {
		observe = vi.fn();
		unobserve = vi.fn();
		disconnect = vi.fn();
	}
	(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
	(window as unknown as { LatticePlayground: unknown }).LatticePlayground = { hasTheme: () => false, addThemes: () => {} };
	engine().mockReset();
	engine().mockImplementation(async () => ({ html: `<article class="lattice"><section class="form" id="1">${body}</section></article>`, css: '' }));
	clearDeckMemo();
	clearSliceCache();
	clearSanitizeMemo();
	sanitizer.passThrough = true;
	body = '<h1>start</h1>';
	document.body.innerHTML = '';
});

/** jsdom never parses the iframe's srcdoc, so furnish what the patch path looks for. */
function liveFrame(host: HTMLElement): Document {
	const doc = (host.querySelector('iframe') as HTMLIFrameElement).contentDocument as Document;
	doc.body.innerHTML = '<article class="lattice"><section class="form" id="1"><h1>resident</h1></section></article>';
	(host as HTMLElement & { __latticePendingLoad?: boolean }).__latticePendingLoad = false;
	return doc;
}

async function show(r: ReturnType<typeof createSingleSlideRenderer>, host: HTMLElement, deck: string) {
	const parts = deck.split(/\n-{3,}\n/);
	return r.renderInto(host, deck, false, undefined, undefined, undefined, undefined, {
		slideIndex: 0,
		slideCount: parts.length,
		slideMarkdown: parts[0],
		focused: true,
	});
}

/** Drive the real renderer onto its patch path, then patch in `next`. */
async function patchIn(next: string) {
	const r = createSingleSlideRenderer(opts);
	const host = document.createElement('figure');
	document.body.appendChild(host);
	await show(r, host, DECK);
	const doc = liveFrame(host);
	await show(r, host, DECK); // settle onto the patch path
	const resident = doc.querySelector('.lattice h1');
	body = next;
	await show(r, host, DECK.replace('# one', '# one, edited'));
	return { doc, patched: doc.querySelector('.lattice h1') !== resident || !doc.querySelector('.lattice h1') };
}

describe('patchSlideBody writes the tree the sanitizer judged, parsed once', () => {
	it('an mXSS-shaped payload stays inert: no <img> element reaches the live frame', async () => {
		const { doc, patched } = await patchIn(`<h2>edited</h2>${MXSS}`);
		expect(patched).toBe(true);
		expect(doc.querySelector('.lattice h2')?.textContent).toBe('edited');
		expect(doc.querySelectorAll('.lattice img')).toHaveLength(0);
		// The first parse's tree: the <img> is the TEXT of a <style>.
		expect(doc.querySelector('.lattice style')?.textContent).toContain('<img');
		// And the shape is real: one more parse of the same tree WOULD make the element live.
		const twice = doc.createElement('div');
		twice.innerHTML = (doc.querySelector('.lattice') as Element).innerHTML;
		expect(twice.querySelectorAll('img')).toHaveLength(1);
	});

	it('with the real sanitizer, the live frame equals the sanitizer output', async () => {
		sanitizer.passThrough = false;
		const html = `<h2>edited</h2><p title="a><img src=x onerror=alert(1)>">t</p>${MXSS}`;
		const { doc } = await patchIn(html);
		const expected = document.createElement('div');
		expected.innerHTML = sanitizeSlideHtml(`<article class="lattice"><section class="form" id="1">${html}</section></article>`);
		const live = doc.querySelector('.lattice') as Element;
		// Compare the section's content: the patch path stamps attributes on the section itself.
		expect(live.querySelector('section')?.innerHTML).toBe(expected.querySelector('section')?.innerHTML);
		expect(live.querySelectorAll('img')).toHaveLength(0);
	});
});
