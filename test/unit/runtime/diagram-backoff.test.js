/**
 * THE DISPATCH BACK-OFF — the policy that decides whether the author's next keystroke costs
 * a render, and the three numbers it needs.
 *
 * This exists because the mechanism it replaces was wrong in a way no suite could see. The
 * branch shipped "coalescing on completion" — at most one diagram run in flight, re-run if
 * the source moved while it ran — with 9,179 tests green, and the mechanism cannot fire:
 * `mermaid.render` occupies the main thread, so a keystroke never ARRIVES while a run is in
 * flight. Driven on the built Studio, a 64-node fence took 8 renders for an 8-character
 * burst and stretched the burst from 1101ms to 2726ms. Every test passed throughout, because
 * every test fed the scheduler events it would never see in that order.
 *
 * So these arms pin the DECISION FUNCTIONS against costs, not the plumbing: given what a
 * render last cost, is there a back-off, how long is the wait, and how long is idle. The
 * numbers in the assertions are the measured ones from
 * engineering/decisions/2026-09-07-diagram-render-latency.md §8.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { JSDOM } from 'jsdom';

const RUNTIME_SRC = readFileSync(new URL('../../../lib/runtime/index.js', import.meta.url), 'utf8');
const BEGIN = '  // ── BEGIN BACK-OFF PORT';
const END = '  // ── END BACK-OFF PORT';

/** Lift the shipped policy, with the render cost under our control. */
function liftPolicy(html = '') {
	const start = RUNTIME_SRC.indexOf(BEGIN);
	const end = RUNTIME_SRC.indexOf(END);
	assert.notEqual(start, -1, 'the back-off must stay bracketed with BEGIN BACK-OFF PORT');
	assert.notEqual(end, -1, 'the back-off must stay bracketed with END BACK-OFF PORT');
	const src = RUNTIME_SRC.slice(start, end);
	for (const fn of ['function diagramBackoffMs()', 'function anyFenceWithoutInk()', 'function medianRenderCostMs()']) {
		assert.ok(src.includes(fn), `the port must hold ${fn}`);
	}
	const dom = new JSDOM(`<body>${html}</body>`);
	// eslint-disable-next-line no-new-func
	const make = new Function(
		'document',
		'PENDING_FENCE_SELECTOR',
		`${src}\nreturn {
			diagramBackoffMs, anyFenceWithoutInk, medianRenderCostMs,
			// Feed the policy the way the runtime does: one sample per render, one per source
			// change. Poking a single variable would test a policy this no longer has.
			setCost(ms) { for (let i = 0; i < 3; i++) recordRenderCost(ms); },
			render(ms) { recordRenderCost(ms); },
			RENDER_COST_FLOOR_MS, RENDER_COST_CAP_MS, DIAGRAM_MAX_WAIT_MS,
		};`,
	);
	return make(dom.window.document, 'pre[data-mermaid-state="pending"],marp-pre[data-mermaid-state="pending"]');
}

/** A pending fence whose slot either holds a drawing or does not. */
const FENCE = (hasInk) => `<pre data-mermaid-state="pending"><code>flowchart LR</code></pre><div class="mermaid">${hasInk ? '<svg></svg>' : ''}</div>`;

describe('the diagram dispatch back-off', () => {
	test('a CHEAP render is never delayed — the live per-keystroke redraw is the feature', () => {
		// Measured: an 8-character burst on a ~30ms fence stretched 1086ms → 1130ms with a
		// render on every keystroke. 44ms across eight is not a beat anyone can feel, and the
		// diagram updating as you type is what "blazing fast" means on a small diagram.
		const p = liftPolicy();
		for (const cost of [0, 5, 22, 30, 36, p.RENDER_COST_FLOOR_MS]) {
			p.setCost(cost);
			assert.equal(p.diagramBackoffMs(), 0, `${cost}ms must not be throttled`);
		}
	});

	test('an EXPENSIVE render waits twice its cost, so re-rendering is a third of the time', () => {
		// Rendering for `c` out of every `c + 2c` is one third, whatever the diagram costs.
		// That is the point of doubling rather than picking a number.
		const p = liftPolicy();
		p.setCost(60);
		assert.equal(p.diagramBackoffMs(), 120);
		p.setCost(70);
		assert.equal(p.diagramBackoffMs(), 140, 'still under the cap');
	});

	test('the wait never exceeds the fixed debounce this work removed', () => {
		// A fence that already holds a drawing ALWAYS waits now, so a wait above 150 would
		// make a single keystroke on a large diagram slower than the build we replaced —
		// 150 + the render, either way. Being slower than what came before is the one
		// outcome this is not allowed to have.
		const p = liftPolicy();
		assert.equal(p.RENDER_COST_CAP_MS, 150, 'the cap IS the old debounce, deliberately');
		p.setCost(248); // 64 nodes
		assert.equal(p.diagramBackoffMs(), 150);
		p.setCost(4000);
		assert.equal(p.diagramBackoffMs(), 150, 'the cap binds however costly the render');
	});

	test('a fence with NOTHING on screen is never made to wait — that is arrival, not editing', () => {
		// The leading edge. Waiting buys the reader nothing when the slot is empty and costs
		// them the whole wait, so first paint and navigating onto a slide go straight through
		// however expensive the diagram is.
		const p = liftPolicy(FENCE(false));
		p.setCost(248);
		assert.ok(p.diagramBackoffMs() > 0, 'the diagram is expensive enough to be throttled');
		assert.equal(p.anyFenceWithoutInk(), true, 'and yet it must not be, because the slot is empty');
	});

	test('a fence ALREADY SHOWING a drawing waits — blocking a keystroke to redraw it is never worth it', () => {
		const p = liftPolicy(FENCE(true));
		assert.equal(p.anyFenceWithoutInk(), false);
	});

	test('ONE empty slot among several is enough to go now', () => {
		// The question is whether anybody is looking at nothing, not whether everybody is.
		const p = liftPolicy(`${FENCE(true)}${FENCE(false)}${FENCE(true)}`);
		assert.equal(p.anyFenceWithoutInk(), true);
	});

	test('the leading edge asks about INK, not about a clock — the regression that cost', () => {
		// The clock version asked "has the author been idle?", which is TRUE at the first
		// keystroke of a burst exactly as it is on a click. So it fired a 248ms blocking
		// render as someone started typing: 3 renders and 1508ms for an 8-character burst on
		// a 64-node fence, against 1 and 1101ms on the build before this branch. An edit is
		// distinguishable from an arrival by what is on screen, and by nothing about timing.
		const editing = liftPolicy(FENCE(true));
		const arriving = liftPolicy(FENCE(false));
		assert.notEqual(editing.anyFenceWithoutInk(), arriving.anyFenceWithoutInk(), 'the two cases must not read the same');
		assert.doesNotMatch(RUNTIME_SRC, /diagramIdleMs/, 'the clock-based leading edge is gone, not merely bypassed');
	});

	test('a COLD first render does not throttle the burst that follows it', () => {
		// The first `mermaid.render` of a session also pays Mermaid's initialization, so a
		// 4-node fence that costs ~36ms every other time measured 200ms+ once. Reading only
		// the latest sample, that one number threw away the live per-keystroke redraw for the
		// whole burst after it — measured as 1 render where 8 were wanted.
		const p = liftPolicy();
		p.render(210); // the cold one
		p.render(36);
		p.render(34);
		assert.equal(p.medianRenderCostMs(), 36, 'the median ignores the outlier');
		assert.equal(p.diagramBackoffMs(), 0, 'so a cheap diagram still streams');
	});

	test('the floor sits between the two measurements that bracket it', () => {
		// ~30ms per render stretched a burst by 44ms (invisible); ~70ms stretched it by 406ms
		// (visible). A floor outside that range is either throttling a diagram that costs
		// nothing to redraw live, or letting one through that visibly blocks typing.
		const p = liftPolicy();
		assert.ok(p.RENDER_COST_FLOOR_MS > 36, 'a ~30ms render must stay un-throttled');
		assert.ok(p.RENDER_COST_FLOOR_MS < 70, 'a ~70ms render must be throttled');
	});
});
