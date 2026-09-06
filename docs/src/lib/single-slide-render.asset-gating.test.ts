// The URL half of the Mermaid gate on the SINGLE-SLIDE path.
//
// `deck-preview.js` (the multi-slide filmstrip) has its own arms for this in
// deck-preview.test.ts. This is the third injection site, and it had no coverage at all
// when the CDN fallbacks were deleted on 2026-09-03 — an independent checker found it.
//
// WHAT WENT WRONG. All three sites keyed on CONTENT alone (`if (mermaid) …`), which was
// correct while a jsdelivr URL sat behind every caller's optional `mermaidUrl`. With that
// fallback removed, a diagram slide meeting a caller that passes no URL emitted
// `<script src=""></script>` — not "no tag". Measured in real Chromium an empty `src`
// produces no request, so the harm was dead markup rather than a bad fetch; the reason it
// still mattered is that the self-hosting record's stated safety property ("a missing URL
// means no tag, a visible local failure") was false exactly where it was most quoted, in a
// change whose whole subject was claims nobody re-derives.
//
// With no fallback behind an absent URL, injecting nothing is the only correct behavior.
// See engineering/decisions/2026-09-03-self-hosted-runtime-deps.md.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./render-engine', () => ({ renderMarkdown: vi.fn() }));
vi.mock('./theme-fetch', () => ({
	createThemeFetcher: () => ({ ensure: async () => {}, ensureBase: async () => {}, ensureKatexFaces: async () => {}, katexFacesActive: () => false, fetch: async () => {} }),
}));
vi.mock('../playground/font-embed.js', () => ({ previewFontFaceCss: () => '' }));

import { renderMarkdown } from './render-engine';
import { __resetLiveRenderersForTest, clearDeckMemo, clearSliceCache, createSingleSlideRenderer } from './single-slide-render';

const base = { themeBase: 'https://x/themes/', runtimeUrl: 'https://x/rt.js' };
// A slide carrying a Mermaid fence — `language-mermaid` is what the renderer counts.
const DIAGRAM_HTML =
	'<article class="lattice"><section class="form" id="1"><div class="cell-stage">' +
	'<pre><code class="language-mermaid">graph TD; A--&gt;B</code></pre></div></section></article>';

beforeEach(() => {
	class RO {
		observe = vi.fn();
		unobserve = vi.fn();
		disconnect = vi.fn();
	}
	(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
	(window as unknown as { LatticePlayground: unknown }).LatticePlayground = { hasTheme: () => false, addThemes: () => {} };
	(renderMarkdown as unknown as ReturnType<typeof vi.fn>).mockReset();
	(renderMarkdown as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => ({ html: DIAGRAM_HTML, css: '' }));
	clearDeckMemo();
	clearSliceCache();
	__resetLiveRenderersForTest();
	document.body.innerHTML = '';
});

// A DRAWN state chart, as the transform emits it: the `data-sc-transitions` attribute is
// what the dagre gate keys on, and only the DEFAULT variant carries it (the `inline`
// variant is chips and needs no layout engine). Trimmed to the attribute and one node —
// the gate is a string test, so a full figure would assert nothing extra.
const STATE_CHART_HTML =
	'<section class="lattice"><div class="state-chart-figure" data-variant="default" '
	+ 'data-sc-dir="tb" data-states="2" data-transitions="1" data-sc-transitions="[]">'
	+ '<ol class="state-nodes"><li class="state-node" data-index="1">A</li></ol></div></section>';

async function srcdocFor(opts: Record<string, unknown>, html?: string): Promise<string> {
	if (html) {
		(renderMarkdown as unknown as ReturnType<typeof vi.fn>)
			.mockImplementation(async () => ({ html, css: '' }));
	}
	const host = document.createElement('figure');
	document.body.appendChild(host);
	const r = createSingleSlideRenderer({ ...base, ...opts });
	await r.renderInto(host, '```mermaid\ngraph TD; A-->B\n```', true);
	const fr = host.querySelector<HTMLIFrameElement>('iframe.live');
	if (!fr) throw new Error('no live frame');
	return fr.srcdoc;
}

describe('single-slide Mermaid gating — content AND url', () => {
	it('a diagram slide WITH a vendored URL injects that exact script', async () => {
		const doc = await srcdocFor({ mermaidUrl: '/playground/v/abc/export/mermaid-v11.min.js' });
		expect(doc).toContain('/playground/v/abc/export/mermaid-v11.min.js');
		// the runtime always ships, and is a different URL
		expect(doc).toContain('https://x/rt.js');
	});

	it('a diagram slide with NO mermaidUrl injects no script tag — never an empty src', async () => {
		const doc = await srcdocFor({});
		expect(doc).not.toContain('src=""');
		expect(doc).not.toContain('mermaid-v11');
		// …and the frame is otherwise intact: the runtime still loads, so this is a missing
		// diagram rather than a broken preview.
		expect(doc).toContain('https://x/rt.js');
	});

	it('an explicitly empty mermaidUrl behaves the same as omitting it', async () => {
		const doc = await srcdocFor({ mermaidUrl: '' });
		expect(doc).not.toContain('src=""');
		expect(doc).toContain('https://x/rt.js');
	});

	it('no CDN host can reach the frame through this path', async () => {
		// The property the whole change exists for, asserted where the tag is actually
		// written rather than only at the constant that used to hold the URL.
		const doc = await srcdocFor({ mermaidUrl: '/playground/v/abc/export/mermaid-v11.min.js' });
		expect(doc).not.toContain('jsdelivr');
		expect(doc).not.toContain('unpkg');
		expect(doc).not.toContain('cdnjs');
	});
});

// The SAME gate, for the dagre layout engine — added when dagre was split out of the
// runtime bundle (it had been inlined, so every reader of every deck paid 25.9 KiB
// gzipped for an engine only a BRANCHING state chart uses). Same content-AND-url shape
// as Mermaid above, and the same failure to avoid: an absent URL must emit no tag, never
// `src=""`. One difference worth stating — an absent engine is not a missing diagram
// here. The chart still draws; it draws as the NUMBERED COLUMN, which is a plausible
// layout, so nothing on the page looks wrong. That is why lib/runtime/index.js warns.
describe('single-slide dagre gating — content AND url', () => {
	it('a state-chart slide WITH a vendored URL injects that exact script', async () => {
		const doc = await srcdocFor({ dagreUrl: '/playground/v/abc/lattice-dagre.js' }, STATE_CHART_HTML);
		expect(doc).toContain('/playground/v/abc/lattice-dagre.js');
		expect(doc).toContain('https://x/rt.js');
	});

	// The ORDER is the mechanism, not a preference: both are classic scripts, so they run
	// in document order, and the runtime's pass reads `globalThis.__latticeDagre`
	// synchronously on its first draw. A dagre tag after the runtime tag arrives too late
	// and every branching machine silently paints as a column — which looks like a
	// working chart, so no other assertion here would catch it.
	it('the engine tag comes BEFORE the runtime tag', async () => {
		const doc = await srcdocFor({ dagreUrl: '/playground/v/abc/lattice-dagre.js' }, STATE_CHART_HTML);
		expect(doc.indexOf('lattice-dagre.js')).toBeLessThan(doc.indexOf('https://x/rt.js'));
	});

	it('a state-chart slide with NO dagreUrl injects no script tag — never an empty src', async () => {
		const doc = await srcdocFor({}, STATE_CHART_HTML);
		expect(doc).not.toContain('src=""');
		expect(doc).not.toContain('lattice-dagre');
		expect(doc).toContain('https://x/rt.js');
	});

	// The saving itself, asserted rather than assumed: a slide with no state chart must
	// not pull the engine even when the host passes a perfectly good URL. This is the
	// arm that would go red if the gate were ever loosened to "always inject".
	it('a slide with NO state chart never fetches the engine', async () => {
		const doc = await srcdocFor({ dagreUrl: '/playground/v/abc/lattice-dagre.js' }, DIAGRAM_HTML);
		expect(doc).not.toContain('lattice-dagre');
		expect(doc).toContain('https://x/rt.js');
	});
});
