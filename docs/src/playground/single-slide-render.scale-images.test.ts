// The preview-sized photo copies (./preview-image-scale.ts) are OPT-IN per renderer, and only
// DeckPreview opts in. While a copy is being made the renderer writes the photo with no `url()` at
// all, and only a host that re-renders on `lattice:preview-images-ready` ever shows the copy. A
// renderer that did not opt in (the specimen pages, the landing showcases) must write the photo's
// own address, as it did before the copies existed, or its panel would hold the Underpainting
// until the reader's next edit.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/render-engine', () => ({ renderMarkdown: vi.fn() }));
vi.mock('../lib/theme-fetch', () => ({
	createThemeFetcher: () => ({ ensure: async () => {}, ensureBase: async () => {}, ensureKatexFaces: async () => {}, katexFacesActive: () => false, fetch: async () => {} }),
}));
vi.mock('./font-embed.js', () => ({ previewFontFaceCss: () => '' }));

import * as scale from '../lib/preview-image-scale';
import { renderMarkdown } from '../lib/render-engine';
import { __resetLiveRenderersForTest, clearDeckMemo, clearSliceCache, createSingleSlideRenderer } from './single-slide-render';

const base = { themeBase: 'https://x/themes/', runtimeUrl: 'https://x/rt.js' };
// Same origin as the page, so the web-image gate lets it through and the rewrite may scale it.
const PHOTO = `${window.location.origin}/samples/photo-wide.jpg`;
const HTML = `<article class="lattice"><section class="image" id="1"><div class="lattice-bg" style="background-image:url(&quot;${PHOTO}&quot;)"></div><h1>One</h1></section></article>`;

class FakeWorker {
	onmessage: ((e: MessageEvent) => void) | null = null;
	onerror: (() => void) | null = null;
	postMessage() {}
	terminate() {}
}

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
	vi.stubGlobal('Worker', FakeWorker);
	vi.stubGlobal('createImageBitmap', () => {});
	vi.stubGlobal('OffscreenCanvas', class {});
	URL.createObjectURL = vi.fn(() => 'blob:x/1');
	URL.revokeObjectURL = vi.fn();
	scale.reset();
	clearDeckMemo();
	clearSliceCache();
	__resetLiveRenderersForTest();
	document.body.innerHTML = '';
});
afterEach(() => {
	scale.reset();
	vi.unstubAllGlobals();
});

async function srcdocFor(scaleImages?: boolean): Promise<string> {
	const host = document.createElement('figure');
	document.body.appendChild(host);
	const r = createSingleSlideRenderer({ ...base, ...(scaleImages === undefined ? {} : { scaleImages }) });
	await r.renderInto(host, 'one', false);
	const fr = host.querySelector<HTMLIFrameElement>('iframe.live');
	if (!fr) throw new Error('no live frame');
	return fr.srcdoc;
}

describe('preview-sized photo copies are opt-in per renderer', () => {
	it('a renderer that did not opt in writes the photo by its own address', async () => {
		const doc = await srcdocFor(undefined);
		expect(doc).toContain('photo-wide.jpg');
		expect(doc).not.toContain('data-lattice-painting=""');
	});

	it('a renderer that opted in never hands the frame the original while the copy is made', async () => {
		const doc = await srcdocFor(true);
		expect(doc, 'the frame was handed the full-size original').not.toContain('photo-wide.jpg');
		expect(doc).toContain('data-lattice-painting');
	});
});
