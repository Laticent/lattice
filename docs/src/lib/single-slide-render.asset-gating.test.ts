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

async function srcdocFor(opts: Record<string, unknown>): Promise<string> {
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
