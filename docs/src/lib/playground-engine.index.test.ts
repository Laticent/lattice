import { beforeEach, describe, expect, it, vi } from 'vitest';

// The bridge's rendered index (rendered-index.ts) is LAZY and reads the stamps of the one
// splitForPreview call. The engine and the frame controller are faked; what is under test is the
// wiring: no work until asked, one split, the stamps join the outline, and a deck whose slide
// count differs from its part count asks the engine for each part.

const render = vi.fn();
vi.mock('./render-engine', () => ({ renderMarkdown: (...a: unknown[]) => render(...a) }));
vi.mock('./load-engine', () => ({ ensureEngine: async () => {} }));
vi.mock('./theme-fetch', () => ({ createThemeFetcher: () => ({ ensure: async () => {}, fetch: async () => {}, baseVersion: () => 0, baseSignature: () => '0', growBase: async () => false, backstop: async () => false }) }));

import { createEngineBridge } from './playground-engine';

const section = (stamp: string) => `<section data-lattice-slide="${stamp}"></section>`;
const deckHtml = (stamps: string[]) => `<article class="lattice">${stamps.map(section).join('')}</article>`;

function setup(stamps: string[]) {
	const splitForPreview = vi.fn((html: string) => ({ html: deckHtml(stamps), changed: 0, applies: false }));
	const renderDeck = vi.fn((a: { html: string }) => ({ count: stamps.length, state: {}, patched: false, anchor: null, html: a.html }));
	(window as unknown as Record<string, unknown>).LatticePlayground = { hasTheme: () => true, splitForPreview };
	(window as unknown as Record<string, unknown>).LatticeDeckPreview = { renderDeck };
	render.mockImplementation(async (_pg: unknown, md: string) => ({ html: md.includes('# B') ? deckHtml(['1', '2']) : deckHtml(['1']), css: '', width: 1280, height: 720 }));
	return { splitForPreview, renderDeck };
}

describe('the bridge rendered index', () => {
	beforeEach(() => {
		render.mockReset();
	});

	it('does no work until a map asks, then joins the stamps to the outline', async () => {
		const { splitForPreview } = setup(['1', '2', '3']);
		const bridge = createEngineBridge('/themes/', '/rt.js', undefined, []);
		const frame = document.createElement('iframe');
		const out = await bridge.renderInto(frame, '# A\n\n---\n\n# B\n\n---\n\n# C\n', 'cuoio', 'light', { frameSig: '', lastSections: null }, true);
		if (out.status !== 'rendered') throw new Error(out.status);
		expect(render).toHaveBeenCalledTimes(1);
		const ix = await out.index();
		expect(ix.pages.map((p) => p.flat)).toEqual([0, 1, 2]);
		expect(ix.unexplainedPages).toEqual([]);
		expect(render).toHaveBeenCalledTimes(1);
		expect(splitForPreview).toHaveBeenCalledTimes(1);
		expect(await out.index()).toBe(ix);
	});

	it('asks the engine how many slides each part makes only when the counts differ', async () => {
		setup(['1', '2', '3']);
		const bridge = createEngineBridge('/themes/', '/rt.js', undefined, []);
		const frame = document.createElement('iframe');
		const out = await bridge.renderInto(frame, '# A\n\n---\n\n# B\n', 'cuoio', 'light', { frameSig: '', lastSections: null }, true);
		if (out.status !== 'rendered') throw new Error(out.status);
		render.mockClear();
		const ix = await out.index();
		// B alone makes two slides, so the three pages are A, B, B-clone.
		expect(render).toHaveBeenCalledTimes(2);
		expect(ix.pages.map((p) => [p.flat, p.copy])).toEqual([
			[0, 0],
			[1, 0],
			[1, 1],
		]);
		expect(ix.unexplainedPages).toEqual([]);
	});
});
