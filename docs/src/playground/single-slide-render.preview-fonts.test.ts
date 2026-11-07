// The Studio's live preview frame must be marked as a PREVIEW for the runtime's font settle.
//
// The runtime (lib/runtime/index.js `isPreviewFonts`) settles fonts two ways. A document whose
// <html> carries `data-lattice-preview` waits only for the faces its laid-out text uses
// (`settleLaidOutFonts`). Anything else is treated as an export and force-loads EVERY declared
// face (`settleFonts`): 28 files, the emoji subsets among them. In a frame that does that,
// `document.fonts.ready` goes pending again, so the reveal gate (lib/core/preview-font-gate.mjs)
// waits out its whole PREVIEW_FONT_GATE_MS backstop. On the phone profile the Studio's first
// slide became visible about 1.5 s after it was in the frame, for that reason alone.
//
// This module builds that frame, so the flag is pinned here. The runtime's half (that the flag
// selects `settleLaidOutFonts`) is the runtime's own contract.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/render-engine', () => ({ renderMarkdown: vi.fn() }));
vi.mock('../lib/theme-fetch', () => ({
	createThemeFetcher: () => ({ ensure: async () => {}, ensureBase: async () => {}, ensureKatexFaces: async () => {}, katexFacesActive: () => false, fetch: async () => {} }),
}));
vi.mock('./font-embed.js', () => ({ previewFontFaceCss: () => '' }));

import { renderMarkdown } from '../lib/render-engine';
import { __resetLiveRenderersForTest, clearDeckMemo, clearSliceCache, createSingleSlideRenderer } from './single-slide-render';

const base = { themeBase: 'https://x/themes/', runtimeUrl: 'https://x/rt.js' };
const HTML = '<article class="lattice"><section class="form" id="1"><div class="cell-stage"><h1>One</h1></div></section></article>';

beforeEach(() => {
	class RO {
		observe = vi.fn();
		unobserve = vi.fn();
		disconnect = vi.fn();
	}
	(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
	(window as unknown as { LatticePlayground: unknown }).LatticePlayground = { hasTheme: () => false, addThemes: () => {} };
	(renderMarkdown as unknown as ReturnType<typeof vi.fn>).mockReset();
	(renderMarkdown as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => ({ html: HTML, css: '' }));
	clearDeckMemo();
	clearSliceCache();
	__resetLiveRenderersForTest();
	document.body.innerHTML = '';
});

async function htmlTagFor(opts: Record<string, unknown> = {}): Promise<string> {
	const host = document.createElement('figure');
	document.body.appendChild(host);
	const r = createSingleSlideRenderer({ ...base, ...opts });
	await r.renderInto(host, '# One', false);
	const fr = host.querySelector<HTMLIFrameElement>('iframe.live');
	if (!fr) throw new Error('no live frame');
	const tag = fr.srcdoc.match(/<html[^>]*>/);
	if (!tag) throw new Error('no <html> tag');
	return tag[0];
}

describe('the live preview frame settles only the faces it lays out', () => {
	it('stamps data-lattice-preview on the Studio preview frame', async () => {
		expect(await htmlTagFor()).toMatch(/\sdata-lattice-preview[\s>]/);
	});

	it('stamps it on specimen and chromeless frames too: every frame this module writes is on screen', async () => {
		expect(await htmlTagFor({ specimen: true })).toMatch(/\sdata-lattice-preview[\s>]/);
		expect(await htmlTagFor({ chromeless: true })).toMatch(/\sdata-lattice-preview[\s>]/);
	});
});
