import { describe, expect, it } from 'vitest';
import { buildSrcdoc } from './deck-preview.js';

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
});
