import { describe, expect, it } from 'vitest';
import { buildSrcdoc, fitSlideOnSheet, resolvePrintSheet } from './deck-preview.js';

// The filmstrip srcdoc must inject the heavy third-party assets ONLY when the deck
// actually uses them — KaTeX styles `.katex`, Mermaid renders `code.language-mermaid`
// fences — so a plain deck (the common case) pulls neither and never waits on a CDN.
const base = {
	css: 'section{}',
	mode: 'light' as const,
	geom: { w: 1280, h: 720 },
	runtimeUrl: '/rt.js',
	katexUrl: 'https://cdn.example/katex.css',
	mermaidUrl: 'https://cdn.example/mermaid.js',
};

describe('buildSrcdoc — asset gating', () => {
	it('a plain deck injects NEITHER KaTeX nor Mermaid', () => {
		const doc = buildSrcdoc({ ...base, html: '<section id="1"><h1>Hello</h1></section>' });
		expect(doc).not.toContain('katex.css');
		expect(doc).not.toContain('mermaid.js');
		// the runtime + fit agents are always present
		expect(doc).toContain('/rt.js');
	});

	it('a deck with rendered math injects the KaTeX stylesheet only', () => {
		const doc = buildSrcdoc({ ...base, html: '<section id="1"><span class="katex">x</span></section>' });
		expect(doc).toContain('katex.css');
		expect(doc).not.toContain('mermaid.js');
	});

	it('a deck with a mermaid fence injects the Mermaid runtime only', () => {
		const doc = buildSrcdoc({ ...base, html: '<section id="1"><pre><code class="language-mermaid">graph TD</code></pre></section>' });
		expect(doc).toContain('mermaid.js');
		expect(doc).not.toContain('katex.css');
	});
});

// Print CSS (browser ⌘P / "Print deck") — pick the least-wasteful standard sheet for
// the deck's aspect, pre-select the orientation, and scale each slide to fit the page.
// (engineering/decisions/2026-06-14-deck-print-styling.md, Build A.)
describe('buildSrcdoc — print sheet + fit', () => {
	const zoomOf = (doc: string) => Number((doc.match(/zoom:([0-9.]+)/) || [])[1]);
	const pageOf = (doc: string) => (doc.match(/@page\{size:([^;]+);/) || [])[1];

	it('screen preview (printRules off) emits no @page/print block', () => {
		const doc = buildSrcdoc({ ...base, html: '<section id="1"></section>' });
		expect(doc).not.toContain('@page');
		expect(doc).not.toContain('@media print');
	});

	it('16:9 → US Legal landscape (the least-wasteful sheet), fit ≤ 1', () => {
		const doc = buildSrcdoc({ ...base, geom: { w: 1280, h: 720 }, printRules: true, html: '<section id="1"></section>' });
		expect(pageOf(doc)).toBe('legal landscape');
		expect(zoomOf(doc)).toBeGreaterThan(0.9);
		expect(zoomOf(doc)).toBeLessThanOrEqual(1);
	});

	it('4:3 → US Letter landscape (fits ~edge-to-edge, never upscaled past 1)', () => {
		const doc = buildSrcdoc({ ...base, geom: { w: 960, h: 720 }, printRules: true, html: '<section id="1"></section>' });
		expect(pageOf(doc)).toBe('letter landscape');
		expect(zoomOf(doc)).toBe(1);
	});

	it('tall (9:16) → Letter portrait, scaled well down to fit the page', () => {
		const doc = buildSrcdoc({ ...base, geom: { w: 1080, h: 1920 }, printRules: true, html: '<section id="1"></section>' });
		expect(pageOf(doc)).toBe('letter portrait');
		expect(zoomOf(doc)).toBeLessThan(0.6);
	});

	it('the fit factor is floored (never rounded up past the printable box)', () => {
		// A 9:16 slide fits the page height near-exactly; rounding UP would spill every
		// slide onto a second sheet. The value must be floored, so scaled height < page.
		const doc = buildSrcdoc({ ...base, geom: { w: 1080, h: 1920 }, printRules: true, html: '<section id="1"></section>' });
		const SAFE = Math.round(9 * (96 / 25.4));
		const printableH = 1056 - 2 * SAFE - 2; // Letter portrait height px, minus safe margin + guard
		expect(zoomOf(doc) * 1920).toBeLessThanOrEqual(printableH);
	});

	// printOpts (from the Print deck panel) override the auto sheet-pick.
	const hd = { w: 1280, h: 720 };
	it('explicit paper + orientation override the aspect-based auto pick', () => {
		expect(pageOf(buildSrcdoc({ ...base, geom: hd, printRules: true, printOpts: { paper: 'a4', orientation: 'portrait' }, html: '<section id="1"></section>' }))).toBe('a4 portrait');
		expect(pageOf(buildSrcdoc({ ...base, geom: hd, printRules: true, printOpts: { paper: 'letter', orientation: 'landscape' }, html: '<section id="1"></section>' }))).toBe('letter landscape');
	});

	it('fit:"actual" prints at 1:1; fit:"page" (default) scales to fit', () => {
		expect(zoomOf(buildSrcdoc({ ...base, geom: hd, printRules: true, printOpts: { fit: 'actual' }, html: '<section id="1"></section>' }))).toBe(1);
		expect(zoomOf(buildSrcdoc({ ...base, geom: hd, printRules: true, printOpts: { fit: 'page' }, html: '<section id="1"></section>' }))).toBeLessThan(1);
	});

	it('auto paper still applies when only some opts are given (paper auto, orientation forced)', () => {
		// 16:9 with orientation:portrait forced → auto paper (legal) + portrait.
		expect(pageOf(buildSrcdoc({ ...base, geom: hd, printRules: true, printOpts: { paper: 'auto', orientation: 'portrait' }, html: '<section id="1"></section>' }))).toBe('legal portrait');
	});

	// The vector `@page`/zoom path above drives the Drawing Board's browser print. The
	// Studio "Print deck" now prints a REAL PDF whose page geometry comes from these two
	// shared helpers (share-export.ts bakes them into the MediaBox) — iOS honors a PDF's
	// page size where it ignores CSS @page. Same paper decision, one source of truth (#1).
	it('the print @page is emitted AFTER the deck css so its sheet + margin win', () => {
		// The engine `css` carries its OWN `@page{size:<slide-px>;margin:0}` (one slide per
		// page for the colour PDF). CSS merges same-named @page rules LATER-wins-per-descriptor,
		// so if our print @page came first, the raw slide sheet + margin:0 would override it and
		// the paper pick was silently inert (the real PDF came out slide-sized, edge-to-edge —
		// caught only by rendering the actual artifact, not this string check). Pin the order.
		const doc = buildSrcdoc({ ...base, geom: hd, printRules: true, css: '@page{size:1280px 720px;margin:0}section{}', html: '<section id="1"></section>' });
		expect(doc).toContain('@page{size:legal landscape;margin:9mm;}');
		expect(doc.indexOf('@page{size:legal landscape')).toBeGreaterThan(doc.indexOf('size:1280px 720px'));
	});
});

// The real-PDF print path (Studio "Print deck"): the SAME paper decision as the vector
// CSS, but emitted as px page geometry for the PDF MediaBox + a fit-and-center rect.
describe('resolvePrintSheet / fitSlideOnSheet — print-PDF page geometry', () => {
	it('auto-picks the least-wasteful sheet + orientation from the deck aspect', () => {
		// 16:9 → US Legal landscape (1344×816 px @96dpi); 4:3 → US Letter landscape; tall → portrait.
		expect(resolvePrintSheet(1280, 720)).toEqual({ paper: 'legal', orientation: 'landscape', pageW: 1344, pageH: 816 });
		expect(resolvePrintSheet(960, 720)).toEqual({ paper: 'letter', orientation: 'landscape', pageW: 1056, pageH: 816 });
		expect(resolvePrintSheet(1080, 1920)).toEqual({ paper: 'letter', orientation: 'portrait', pageW: 816, pageH: 1056 });
	});

	it('a near-square deck (1.0 ≤ aspect < 1.15) stays letter PORTRAIT (not gw≥gh landscape)', () => {
		// Preserves the original three-way ladder for the shared Drawing Board vector print:
		// a bare `gw >= gh` would flip these wide-of-square-but-not-really decks to landscape.
		expect(resolvePrintSheet(1080, 1080)).toEqual({ paper: 'letter', orientation: 'portrait', pageW: 816, pageH: 1056 }); // 1:1
		expect(resolvePrintSheet(1100, 1000)).toEqual({ paper: 'letter', orientation: 'portrait', pageW: 816, pageH: 1056 }); // 1.10
		// …and just past the threshold flips to landscape.
		expect(resolvePrintSheet(1150, 1000).orientation).toBe('landscape'); // 1.15
	});

	it('explicit paper/orientation override the auto pick (→ the PDF MediaBox)', () => {
		expect(resolvePrintSheet(1280, 720, { paper: 'a4', orientation: 'portrait' })).toEqual({ paper: 'a4', orientation: 'portrait', pageW: 794, pageH: 1123 });
		expect(resolvePrintSheet(1280, 720, { paper: 'letter', orientation: 'landscape' })).toEqual({ paper: 'letter', orientation: 'landscape', pageW: 1056, pageH: 816 });
	});

	it('fit:"page" scales the slide inside the safe margin, centered; never upscaled', () => {
		const { pageW, pageH } = resolvePrintSheet(1280, 720); // legal landscape 1344×816
		const r = fitSlideOnSheet(1280, 720, pageW, pageH, 'page');
		const SAFE = Math.round(9 * (96 / 25.4));
		expect(r.w).toBeLessThanOrEqual(pageW - 2 * SAFE + 0.001); // inside the printable box
		expect(r.h).toBeLessThanOrEqual(pageH - 2 * SAFE + 0.001);
		expect(r.w / r.h).toBeCloseTo(1280 / 720, 5); // aspect preserved
		expect(r.x).toBeCloseTo((pageW - r.w) / 2, 5); // centered horizontally
		expect(r.y).toBeCloseTo((pageH - r.h) / 2, 5); // centered vertically
	});

	it('fit:"actual" prints at 1:1 — an oversized slide overhangs the page (clips)', () => {
		// On a Letter PORTRAIT sheet a 1280px-wide slide is wider than the page → x is
		// negative (overhangs both edges), which is the documented "may clip" behavior.
		const r = fitSlideOnSheet(1280, 720, 816, 1056, 'actual');
		expect(r.w).toBe(1280);
		expect(r.h).toBe(720);
		expect(r.x).toBeLessThan(0);
	});
});
