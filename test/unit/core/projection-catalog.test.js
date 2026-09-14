/**
 * The projection catalog — the nine rosters it replaced, and the one thing it changed.
 *
 * `lib/core/projection-catalog.generated.mjs` is projected from every component
 * manifest's `projection` block and replaces nine hand-maintained literals across five
 * files and two module systems. Four of those literals held the IDENTICAL twelve names
 * under four different names, and none of the nine went red when a chart was missing
 * from it — a chart absent from the chart-token roster rendered BLACK fills, one absent
 * from the vector rosters silently exported as PNG.
 *
 * These arms pin the two claims that matter and that nothing else can see:
 *
 *   1. PARITY — eight of the nine derived sets are exactly the sets the literals held.
 *      That is what makes "the declarations are right" a measurement rather than an
 *      assertion, and it is checked against the literal MEMBERSHIP recorded here, not
 *      against the deleted source (which would be untestable) .
 *   2. THE ONE CHANGE — `DATA_LAYOUTS` gains exactly `journey`, `matrix-grid` and
 *      `roadmap`, three chart layouts the old roster's own comment said belonged to it.
 *      Pinned by NAME so the change stays deliberate: a fourth name appearing here is a
 *      scoring change nobody decided on.
 *
 * The catalog's freshness is NOT this file's job — that is
 * `tools/build-projection-catalog.js --check`, via `build:check`. Coverage is
 * `checkProjectionCoverage`. This file is about what the sets CONTAIN.
 *
 * See engineering/decisions/2026-09-13-projected-rosters.md.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAll } = require('../../../lib/components');

// The exact membership each hand-maintained literal carried at the commit before this
// change (d05807e), transcribed once. Sorted here so a reader can diff them by eye; the
// literals themselves were in three different orders, which is part of why nobody
// noticed four of them were the same list.
const WAS = {
	// prose-projection.mjs — five sets
	CHART_TOKEN_COMPONENTS: ['bar', 'bullet', 'funnel', 'line', 'map', 'piechart', 'quadrant', 'radar', 'scatter', 'slope', 'stacked-bar', 'waterfall'],
	MEDIA_COMPONENTS: ['bar', 'bullet', 'diagram', 'funnel', 'image', 'journey', 'line', 'map', 'math', 'piechart', 'quadrant', 'radar', 'scatter', 'slope', 'stacked-bar', 'state-chart', 'video', 'waterfall', 'word-cloud'],
	FLOW_CHART_COMPONENTS: ['gantt', 'kanban', 'progress', 'roadmap', 'timeline-list'],
	SPATIAL_BOUNDED_COMPONENTS: ['word-cloud'],
	SPATIAL_PLACEHOLDER_COMPONENTS: ['journey', 'state-chart'],
	// image-set.js, deck-export.js, export-chart-svg.js — the same twelve, three times
	KEYED_CHART_LAYOUTS: ['bar', 'bullet', 'funnel', 'line', 'map', 'piechart', 'quadrant', 'radar', 'scatter', 'slope', 'stacked-bar', 'waterfall'],
	CLEAN_SVG_LAYOUTS: ['bar', 'bullet', 'funnel', 'line', 'map', 'piechart', 'quadrant', 'radar', 'scatter', 'slope', 'stacked-bar', 'waterfall'],
	TOOLS_KEYED: ['bar', 'bullet', 'funnel', 'line', 'map', 'piechart', 'quadrant', 'radar', 'scatter', 'slope', 'stacked-bar', 'waterfall'],
	// scorecard.js — the one that had drifted
	DATA_LAYOUTS: ['bar', 'big-number', 'bullet', 'funnel', 'gantt', 'kanban', 'kpi', 'line', 'map', 'piechart', 'progress', 'quadrant', 'radar', 'scatter', 'slope', 'stacked-bar', 'state-chart', 'stats', 'timeline-list', 'waterfall', 'word-cloud'],
};

/**
 * Members that did not EXIST at d05807e, so no literal could have carried them.
 *
 * Kept separate from WAS on purpose: WAS is a transcription of deleted source and
 * must stay a faithful one, or the "four rosters were one fact" finding stops being
 * re-derivable. A new component is not a drift in those rosters — it is a new row
 * the projection has an answer for. Naming it here keeps BOTH facts checkable: the
 * historical membership, and exactly which names were added since and by whom.
 *
 * `heatmap` — the chart family's numeric matrix (#2170). `figure: "svg"` because
 * the kernel emits one self-contained <svg>, so it extracts as a standalone vector
 * and re-hosts in the prose projection; `data: true` because a matrix IS data, so a
 * deck built on it scores Data rather than reporting N/A.
 */
const ADDED_SINCE = ['heatmap'];
const plus = (was, added = ADDED_SINCE) => sorted([...was, ...added]);

const sorted = (a) => [...a].sort();

test('the projected catalog', async (t) => {
	const c = await import('../../../lib/core/projection-catalog.generated.mjs');

	await t.test('four rosters were one fact wearing four names', () => {
		// The finding that shaped the design. If this ever stops holding, the four were
		// NOT the same fact and collapsing them was wrong.
		assert.deepEqual(WAS.KEYED_CHART_LAYOUTS, WAS.CHART_TOKEN_COMPONENTS);
		assert.deepEqual(WAS.CLEAN_SVG_LAYOUTS, WAS.CHART_TOKEN_COMPONENTS);
		assert.deepEqual(WAS.TOOLS_KEYED, WAS.CHART_TOKEN_COMPONENTS);
		assert.deepEqual(sorted(c.SVG_CHART_LAYOUTS), plus(WAS.CHART_TOKEN_COMPONENTS),
			'SVG_CHART_LAYOUTS must carry exactly what all four literals carried, plus ADDED_SINCE');
	});

	await t.test('the eight unchanged sets are exactly what the literals held', () => {
		assert.deepEqual(sorted(c.SVG_CHART_LAYOUTS), plus(WAS.CHART_TOKEN_COMPONENTS));
		assert.deepEqual(sorted(c.MEDIA_COMPONENTS), plus(WAS.MEDIA_COMPONENTS));
		assert.deepEqual(sorted(c.FLOW_CHART_COMPONENTS), WAS.FLOW_CHART_COMPONENTS);
		assert.deepEqual(sorted(c.SPATIAL_BOUNDED_COMPONENTS), WAS.SPATIAL_BOUNDED_COMPONENTS);
		assert.deepEqual(sorted(c.SPATIAL_PLACEHOLDER_COMPONENTS), WAS.SPATIAL_PLACEHOLDER_COMPONENTS);
	});

	await t.test('DATA_LAYOUTS changes by exactly three named layouts, and no more', () => {
		const now = sorted(c.DATA_LAYOUTS);
		const added = now.filter((n) => !WAS.DATA_LAYOUTS.includes(n));
		const removed = WAS.DATA_LAYOUTS.filter((n) => !now.includes(n));
		assert.deepEqual(added, sorted(['journey', 'matrix-grid', 'roadmap', ...ADDED_SINCE]),
			'the intended changes are the three chart layouts the old roster had drifted past, ' +
			'plus ADDED_SINCE. A name here that is not one of those is a deck-scoring change ' +
			'nobody decided on — decide it, then update this list.');
		assert.deepEqual(removed, [],
			'nothing may LOSE its data classification: a deck that scored Data would start ' +
			'reporting N/A, and no test renders that');
	});

	await t.test('MEDIA is every figure except flow — the rule, not a copy of the answer', () => {
		// The derivation itself, so the generator cannot quietly change what MEDIA means
		// while still matching the frozen list above.
		const figured = Object.entries(c.PROJECTION).filter(([, p]) => p.figure);
		const expected = figured
			.filter(([, p]) => p.figure !== 'flow' && p.figure !== 'none')
			.map(([n]) => n);
		assert.deepEqual(sorted(c.MEDIA_COMPONENTS), sorted(expected));
		for (const kind of ['flow', 'none']) {
			for (const [n, p] of figured) {
				if (p.figure === kind) {
					assert.ok(!c.MEDIA_COMPONENTS.includes(n), `${kind} member ${n} leaked into MEDIA`);
				}
			}
		}
	});

	await t.test('the catalog is a function of the manifests and nothing else', () => {
		// A guard on the guard: if the catalog were stale, every arm above would still
		// pass against the frozen lists. This is what ties it to the tree.
		const declared = {};
		for (const m of loadAll()) if (m.projection) declared[m.name] = m.projection;
		assert.deepEqual(Object.keys(c.PROJECTION).sort(), Object.keys(declared).sort(),
			'the catalog names a different set of components than the manifests declare — ' +
			'run node tools/build-projection-catalog.js');
		for (const [name, block] of Object.entries(declared)) {
			assert.deepEqual({ ...c.PROJECTION[name] }, block, `${name}: catalog and manifest disagree`);
		}
	});

	await t.test('every chart declares a figure, and every declared figure is a known kind', () => {
		const KINDS = ['svg', 'flow', 'spatial', 'placeholder', 'bare', 'none'];
		const charts = loadAll().filter((m) => (m.bucket || m.function) === 'chart');
		assert.ok(charts.length >= 21, `expected the chart bucket to be populated, saw ${charts.length}`);
		for (const m of charts) {
			assert.ok(KINDS.includes(m.projection?.figure),
				`${m.name}: chart with no valid projection.figure (${JSON.stringify(m.projection)})`);
		}
	});
});
