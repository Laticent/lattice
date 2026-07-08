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
