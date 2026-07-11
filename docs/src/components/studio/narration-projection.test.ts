import { describe, expect, it, vi } from 'vitest';

// The engine render is the one heavy dependency — stub `buildDeckRender` to return a
// fixed rendered-deck HTML so the test exercises the REAL glue (split → sanitize →
// parse → the shared `projectDeckToSpeech` from the player-core bundle) without
// booting the engine. currentPaletteMode is stubbed to a valid pair (its value is
// irrelevant — narration text is theme-invariant).
const html = vi.hoisted(() => ({ current: '' }));
vi.mock('./share-export', () => ({ buildDeckRender: vi.fn(async () => ({ html: html.current })) }));
vi.mock('@/lib/single-slide-render', () => ({ currentPaletteMode: () => ({ palette: 'indaco', mode: 'light' }) }));

import { projectDeckSpeech } from './narration-projection';

const opts = {} as unknown as Parameters<typeof projectDeckSpeech>[0];

describe('projectDeckSpeech — live narration from the shared DOM projection', () => {
	it('returns one narration string per rendered slide, index-aligned', async () => {
		html.current =
			'<section data-class="stats"><h2>Total revenue</h2><p>Up strongly this quarter</p></section>' +
			'<section data-class="quote"><h2>What they said</h2><p>A ringing endorsement</p></section>';
		const out = await projectDeckSpeech(opts, 'ignored — buildDeckRender is stubbed');
		expect(out).toHaveLength(2);
		// The real shared kernel ran: each slide's heading + prose is spoken, in order.
		expect(out[0]).toContain('Total revenue');
		expect(out[0]).toContain('Up strongly this quarter');
		expect(out[1]).toContain('What they said');
		expect(out[1]).toContain('A ringing endorsement');
	});

	it('keeps the array aligned when a slide has no readable prose (empty → "")', async () => {
		html.current = '<section data-class="stats"><h2>Metric</h2><p>Body</p></section><section></section>';
		const out = await projectDeckSpeech(opts, 'ignored');
		expect(out).toHaveLength(2);
		expect(out[0]).toContain('Metric');
		expect(out[1]).toBe(''); // the empty slide's slot is preserved, not dropped
	});

	it('produces the SAME projection the CLI export would — it is the shared kernel', async () => {
		// Present and the export both run `projectDeckToSpeech` over the rendered
		// sections; feeding the helper the deck's rendered HTML yields exactly what the
		// export's per-slide projection yields (unification, by construction).
		html.current = '<section data-class="kpi"><h2>ARR</h2><p>Climbing</p></section>';
		const [deckMod, coreMod, sanitizeMod] = await Promise.all([
			import('@/playground/deck-preview.js'),
			import('@/playground/player-core.generated.js'),
			import('@/lib/sanitize-slide-html.js'),
		]);
		const { splitSections } = deckMod as unknown as { splitSections: (h: string) => string[] };
		const { projectDeckToSpeech } = coreMod as unknown as { projectDeckToSpeech: (s: Element[]) => string[] };
		const { sanitizeSlideHtml } = sanitizeMod;
		const parser = new DOMParser();
		const direct = splitSections(html.current).map((h) => {
			const s = parser.parseFromString(sanitizeSlideHtml(h), 'text/html').querySelector('section');
			return s ? projectDeckToSpeech([s])[0] : '';
		});
		const out = await projectDeckSpeech(opts, 'ignored');
		expect(out).toEqual(direct);
	});
});
