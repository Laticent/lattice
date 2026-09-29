// The pane layouts as picker entries: every sample and every Explore slide they carry must be
// lint-clean and must really render as two panes (not split, not re-oriented), because the picker
// is where an author first meets `columns` and `rows`.
import { describe, expect, it } from 'vitest';
import { buildCatalog, buildLenses, groupCatalog } from './families.mjs';
import { PANE_LAYOUT_ENTRIES } from './pane-layout-entries.mjs';
import { PANE_LAYOUT_SAMPLES } from './pane-layout-samples.mjs';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { lintText } = require('../../../lib/authoring/lint.js') as { lintText: (md: string) => { rule: string; severity: string; message: string }[] };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createEngine } = require('../../../lib/engine/index.js') as { createEngine: () => { render: (md: string) => { html: string } } };

const deck = (md: string) => `---\ntheme: indaco\n---\n\n${md}`;
const slidesOf = (e: (typeof PANE_LAYOUT_ENTRIES)[number]) => {
	const x = PANE_LAYOUT_SAMPLES[e.name as keyof typeof PANE_LAYOUT_SAMPLES];
	return [x.sample, e.skeleton, ...x.plan.filter((s) => s.kind !== 'title').map((s) => s.md)];
};

describe('pane layout picker entries', () => {
	for (const e of PANE_LAYOUT_ENTRIES) {
		it(`${e.name}: every sample is lint-clean and renders as two panes`, () => {
			const engine = createEngine();
			for (const md of slidesOf(e)) {
				const loud = lintText(deck(md)).filter((f) => f.severity === 'error' || f.severity === 'warning' || f.rule.startsWith('pane-'));
				expect(loud, md).toEqual([]);
				const html = engine.render(deck(md)).html;
				expect(html.match(/<lat-pane\b/g)?.length, md).toBe(2);
				expect(html, md).toContain(`data-panes="${e.name === 'columns' ? 'side' : 'stack'}"`);
			}
		});
	}

	it('file under Split layouts, and under a Layout group of their own for Function and Substance', () => {
		const catalog = buildCatalog(PANE_LAYOUT_ENTRIES as unknown as object[], () => 'layout') as { name: string; family: string }[];
		expect(catalog.map((c) => [c.name, c.family])).toEqual([
			['columns', 'splits'],
			['rows', 'splits'],
		]);
		expect((buildLenses() as { id: string }[]).map((l) => l.id)).toEqual(['family', 'function', 'substance', 'az']);
		for (const id of ['function', 'substance']) {
			const groups = groupCatalog(catalog, id) as { key: string; label: string }[];
			expect(groups.map((g) => [g.key, g.label])).toEqual([['layout', 'Layout']]);
		}
	});
});
