/**
 * The Playground's RESTYLE path: a palette or light/dark flip changes the live document's
 * stylesheet and its sections in place, instead of writing a new document.
 *
 * The write it replaces hid the whole deck until the new document fit and its fonts
 * settled, and started it at scroll 0 — measured on the built Playground, an Edit-view
 * reader on slide 3 was thrown to slide 1 on every palette change. These pin the three
 * things that make the in-place swap safe: it happens only when nothing but the theme and
 * mode moved, never with a Mermaid fence (the runtime caches diagram colors per document),
 * and the stylesheet it writes is the one a fresh write would have built.
 */

import { describe, expect, it } from 'vitest';
import { docStyleText } from './deck-preview.js';
import { renderDeck, restyleDocument } from './deck-render.js';

const deck = (title: string) => `<section class="form"><h1>${title}</h1></section><section class="form"><p>two</p></section>`;

/** A live preview frame: a document with the `#lattice-doc` sheet and a `.lattice` body. */
function liveFrame(css: string) {
	const doc = document.implementation.createHTMLDocument('preview');
	const style = doc.createElement('style');
	style.id = 'lattice-doc';
	style.textContent = css;
	doc.head.append(style);
	doc.body.innerHTML = `<article class="lattice">${deck('one')}</article>`;
	// The document the last write produced carries that write's id (see renderDeck).
	doc.documentElement.setAttribute('data-lattice-write', '1');
	let srcdoc = '';
	const frame = {
		contentDocument: doc,
		contentWindow: {},
		get srcdoc() {
			return srcdoc;
		},
		set srcdoc(v: string) {
			srcdoc = v;
		},
	};
	return frame as unknown as HTMLIFrameElement & { srcdoc: string };
}

const base = { mode: 'light', geom: { w: 1280, h: 720 }, runtimeUrl: '/r.js', restyleKey: '1280x720' };

describe('renderDeck restyles in place when only the theme moved', () => {
	it('a theme change swaps the sheet and the sections, and writes no new document', () => {
		const frame = liveFrame('old');
		const state = { frameSig: 'indaco|light|1280x720', lastSections: [deck('one')], restyleSig: '1280x720|W:|C:', writeId: 1 };
		const r = renderDeck({ ...base, frame, html: deck('one'), css: '.x{color:red}', sig: 'cuoio|light|1280x720', state });
		expect(r.restyled).toBe(true);
		expect(r.patched).toBe(true);
		expect(frame.srcdoc).toBe('');
		const sheet = frame.contentDocument?.getElementById('lattice-doc')?.textContent ?? '';
		expect(sheet).toBe(docStyleText({ css: '.x{color:red}', mode: 'light', geom: base.geom }));
		expect(frame.contentDocument?.querySelector('.lattice')?.getAttribute('data-lattice-swap')).toBe('reflow');
	});

	it('a SIZE change is a full write — the slide box is baked into the document', () => {
		const frame = liveFrame('old');
		const state = { frameSig: 'cuoio|light|1280x720', lastSections: [deck('one')], restyleSig: '1280x720|W:|C:', writeId: 1 };
		const r = renderDeck({ ...base, frame, html: deck('one'), css: '', geom: { w: 1080, h: 1350 }, restyleKey: '1080x1350', sig: 'cuoio|light|1080x1350', state });
		expect(r.restyled).toBe(false);
		expect(frame.srcdoc).toContain('<style id="lattice-doc">');
	});

	it('a deck with a Mermaid fence is a full write — its diagrams hold the old colors', () => {
		const frame = liveFrame('old');
		const mm = '<section class="form"><pre><code class="language-mermaid">graph TD; A-->B</code></pre></section>';
		const state = { frameSig: 'indaco|light|1280x720M', lastSections: [mm], restyleSig: '1280x720M|W:|C:', writeId: 1 };
		const r = renderDeck({ ...base, frame, html: mm, css: '', sig: 'cuoio|light|1280x720', state });
		expect(r.restyled).toBe(false);
		expect(frame.srcdoc.length).toBeGreaterThan(0);
	});

	it('a fresh render (a deck swap) never restyles', () => {
		const frame = liveFrame('old');
		const state = { frameSig: 'indaco|light|1280x720', lastSections: [deck('one')], restyleSig: '1280x720|W:|C:', writeId: 1 };
		const r = renderDeck({ ...base, frame, html: deck('two'), css: '', sig: 'cuoio|light|1280x720', state, fresh: true });
		expect(r.restyled).toBe(false);
		expect(frame.srcdoc.length).toBeGreaterThan(0);
	});

	it('restyleDocument refuses a document it cannot restyle', () => {
		const doc = document.implementation.createHTMLDocument('bare');
		doc.body.innerHTML = '<article class="lattice"></article>';
		expect(restyleDocument({ contentDocument: doc, contentWindow: {} } as unknown as HTMLIFrameElement, [], 'x')).toBe(false);
	});
});

describe('buildSrcdoc and the restyle path build ONE stylesheet', () => {
	it('the written document carries docStyleText verbatim in #lattice-doc', async () => {
		const { buildSrcdoc } = await import('./deck-preview.js');
		const opts = { css: '.y{}', mode: 'dark', geom: { w: 1280, h: 720 }, center: true };
		const html = buildSrcdoc({ ...opts, html: deck('one'), runtimeUrl: '/r.js' });
		expect(html).toContain(`<style id="lattice-doc">${docStyleText(opts)}</style>`);
	});
});

describe('a full write reports where the reader was', () => {
	it('a fresh write (a different deck) reports no anchor', () => {
		const frame = liveFrame('old');
		const state = { frameSig: 'indaco|light|1280x720', lastSections: [deck('one')], restyleSig: '1280x720|W:|C:', writeId: 1 };
		const r = renderDeck({ ...base, frame, html: deck('two'), css: '', sig: 'cuoio|light|1280x720', state, fresh: true });
		expect(r.anchor).toBeNull();
	});
});

describe('a restyle never lands in a document that is being replaced', () => {
	it('a theme flip right after a full write writes again instead of restyling the outgoing document', () => {
		const frame = liveFrame('old');
		const state = { frameSig: 'indaco|light|1280x720', lastSections: [deck('one')], restyleSig: '1280x720|W:|C:', writeId: 1 };
		// A size change: a full write. In a browser `contentDocument` stays the OLD document
		// until the new one loads — this fake frame never loads, which is that window held open.
		const w = renderDeck({ ...base, frame, html: deck('one'), css: '', geom: { w: 1080, h: 1080 }, restyleKey: '1080x1080', sig: 'indaco|light|1080x1080', state });
		expect(w.patched).toBe(false);
		expect(frame.srcdoc).toContain('data-lattice-write="2"');
		// The theme flip arrives before that document loads.
		const r = renderDeck({ ...base, frame, html: deck('one'), css: '.red{}', geom: { w: 1080, h: 1080 }, restyleKey: '1080x1080', sig: 'cuoio|light|1080x1080', state: w.state });
		expect(r.restyled).toBe(false);
		expect(frame.srcdoc).toContain('data-lattice-write="3"');
		expect(frame.srcdoc).toContain('.red{}');
	});
});

describe('a theme whose CSS reaches a different web host is a full write', () => {
	it('the policy in <head> is built from the CSS, and a restyle never rewrites it', () => {
		const frame = liveFrame('old');
		const state = { frameSig: 'indaco|light|1280x720', lastSections: [deck('one')], restyleSig: '1280x720|W:|C:', writeId: 1 };
		const css = '@font-face{font-family:x;src:url(https://fonts.example.com/x.woff2)}';
		const r = renderDeck({ ...base, frame, html: deck('one'), css, sig: 'cuoio|light|1280x720', state });
		expect(r.restyled).toBe(false);
		expect(frame.srcdoc.length).toBeGreaterThan(0);
	});
});
