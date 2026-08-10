// #1463 — the THUMBNAIL flag on the rendered frame.
//
// A thumbnail is a miniature in a grid of its peers (the add-slide gallery, Present's
// slide overview). `options.thumbnail` stamps `<html data-lattice-thumbnail>` on the
// frame it writes, and the engine runtime reads that to route its overflow / type-floor
// watcher to `off` — the level that installs no probe, no observer and no resize
// handler, so a grid of ~33 frames is not running ~33 of them to draw marks nobody can
// read at 260px (and which, in the gallery, describe a catalog sample nobody can fix).
//
// What is under test here is only this module's half: that the attribute reaches the
// frame when asked and is ABSENT otherwise. The runtime's half — that the flag really
// silences the watcher — is pinned against the real bundled runtime in
// test/integration/parity/runtime-overflow-marker.test.js, and end-to-end on the real
// Studio in docs/e2e/gallery-preview-budget.spec.ts.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./render-engine', () => ({ renderMarkdown: vi.fn() }));
vi.mock('./theme-fetch', () => ({
	createThemeFetcher: () => ({ ensure: async () => {}, ensureBase: async () => {}, fetch: async () => {} }),
}));
vi.mock('../playground/font-embed.js', () => ({ previewFontFaceCss: () => '' }));

import { renderMarkdown } from './render-engine';
import { clearDeckMemo, clearSliceCache, createSingleSlideRenderer } from './single-slide-render';

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
	document.body.innerHTML = '';
});

async function srcdocFor(thumbnail?: boolean): Promise<string> {
	const host = document.createElement('figure');
	document.body.appendChild(host);
	const r = createSingleSlideRenderer(thumbnail === undefined ? base : { ...base, thumbnail });
	await r.renderInto(host, '# One', false);
	const fr = host.querySelector<HTMLIFrameElement>('iframe.live');
	if (!fr) throw new Error('no live frame');
	return fr.srcdoc;
}

describe('the thumbnail flag on the rendered frame (#1463)', () => {
	it('stamps <html data-lattice-thumbnail> when the host renders thumbnails', async () => {
		const doc = await srcdocFor(true);
		expect(doc).toMatch(/^<!doctype html><html data-lattice-thumbnail>/);
	});

	it('leaves the tag bare for a full-size host — every other preview keeps its watcher', async () => {
		// The control for the claim that this change is inert everywhere else: the Studio's
		// own preview, the landing islands and the specimens all take this path, and
		// e2e/reader-alarms.spec.ts' positive control depends on their watcher still running.
		const doc = await srcdocFor(undefined);
		expect(doc).toMatch(/^<!doctype html><html>/);
		expect(doc).not.toContain('data-lattice-thumbnail');
	});

	it('an explicit false is the same as omitting it', async () => {
		expect(await srcdocFor(false)).not.toContain('data-lattice-thumbnail');
	});

	it('does not disturb the rest of the document head — the theme style still carries its id', async () => {
		// The RESTYLE fast path finds the resident theme <style> by id; a malformed <html>
		// tag would be a parse problem the flag has no business causing.
		const doc = await srcdocFor(true);
		expect(doc).toContain('<head><meta charset="utf-8"><style id="lattice-theme">');
	});
});
