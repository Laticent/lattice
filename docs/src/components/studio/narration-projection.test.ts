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

describe('projectSectionsToSpeech — project ALREADY-rendered sections (no second render)', () => {
	it('projects each section in place, index-aligned, with no engine render', async () => {
		// The export download (`shareCaptions`) already holds the rendered sections, so it
		// projects them directly — no second `buildDeckRender`. This is that shared path.
		const { projectSectionsToSpeech } = await import('./narration-projection');
		const sections = [
			'<section data-class="kpi"><h2>ARR grew</h2><p>Forty percent</p></section>',
			'<section></section>', // no readable prose → '' (alignment preserved, not dropped)
			'<section data-class="quote"><h2>Closer</h2><p>Ship it</p></section>',
		];
		const out = await projectSectionsToSpeech(sections);
		expect(out).toHaveLength(3);
		expect(out[0]).toContain('ARR grew');
		expect(out[1]).toBe('');
		expect(out[2]).toContain('Closer');
	});
});

describe('projectDeckSpeech through a split panes slide (the REAL engine render)', () => {
	// A portrait deck splits its panes slide into one slide per pane, so the render has one more
	// section than the deck has source slides. Present and the narration bake index by source slide
	// and used to refuse the whole projection on that mismatch; `foldPaneSplits` folds the split
	// back so the deck keeps projecting.
	it('projects one script per SOURCE slide, the split slide narrating both panes, its title once', async () => {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const engine = require('../../../../lib/engine/index.js') as { render: (md: string, theme: string) => { html: string } };
		const title = 'EMEA carried the quarter while APAC held flat.';
		const source = [
			'---\nsize: 9:16\n---\n\n# Opening',
			`## ${title}\n\n<!-- pane: list -->\n\n- EMEA closed three late deals\n- APAC renewals slipped\n\n<!-- pane: table -->\n\n| Region | Q3 |\n|---|---|\n| EMEA | 5.3 |`,
			'## After the split\n\nThe slide after it.',
		].join('\n\n---\n\n');
		html.current = engine.render(source, 'lattice').html;
		expect((html.current.match(/<section\b/g) || []).length).toBe(4); // the engine did split
		const out = await projectDeckSpeech(opts, source);
		expect(out).toHaveLength(3);
		expect(out[1]).toContain('EMEA closed three late deals');
		expect(out[1]).toContain('5.3');
		expect(out[1].split(title.replace(/\.$/, '')).length - 1).toBe(1);
		expect(out[2]).toContain('The slide after it');
	});
});
