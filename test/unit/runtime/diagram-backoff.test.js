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

const RUNTIME_SRC = readFileSync(new URL('../../../lib/runtime/index.js', import.meta.url), 'utf8');
const BEGIN = '  // ── BEGIN BACK-OFF PORT';
const END = '  // ── END BACK-OFF PORT';

/** Lift the shipped policy, with the render cost under our control. */
function liftPolicy() {
	const start = RUNTIME_SRC.indexOf(BEGIN);
	const end = RUNTIME_SRC.indexOf(END);
	assert.notEqual(start, -1, 'the back-off must stay bracketed with BEGIN BACK-OFF PORT');
	assert.notEqual(end, -1, 'the back-off must stay bracketed with END BACK-OFF PORT');
	const src = RUNTIME_SRC.slice(start, end);
	for (const fn of ['function diagramBackoffMs()', 'function diagramIdleMs()']) {
		assert.ok(src.includes(fn), `the port must hold ${fn}`);
	}
	// eslint-disable-next-line no-new-func
	const make = new Function(`${src}\nreturn { diagramBackoffMs, diagramIdleMs, setCost(ms) { lastRenderCostMs = ms; }, RENDER_COST_FLOOR_MS, RENDER_COST_CAP_MS };`);
	return make();
}

describe('the diagram dispatch back-off', () => {
	test('a CHEAP render is never delayed — the live per-keystroke redraw is the feature', () => {
		// Measured: an 8-character burst on a ~30ms fence stretched 1086ms → 1130ms with a
		// render on every keystroke. 44ms across eight is not a beat anyone can feel, and the
		// diagram updating as you type is what "blazing fast" means on a small diagram.
		const p = liftPolicy();
		for (const cost of [0, 5, 22, 30, 36, p.RENDER_COST_FLOOR_MS]) {
			p.setCost(cost);
			assert.equal(p.diagramBackoffMs(), 0, `${cost}ms must not be throttled`);
			assert.equal(p.diagramIdleMs(), 0, `${cost}ms must not gate the leading edge either`);
		}
	});

	test('an EXPENSIVE render waits twice its cost, so re-rendering is a third of the time', () => {
		// Rendering for `c` out of every `c + 2c` is one third, whatever the diagram costs.
		// That is the point of doubling rather than picking a number.
		const p = liftPolicy();
		p.setCost(70); // 16 nodes
		assert.equal(p.diagramBackoffMs(), 140);
		p.setCost(86);
		assert.equal(p.diagramBackoffMs(), 172);
	});

	test('the wait is CAPPED, so a pathological diagram cannot add half a second to a keystroke', () => {
		const p = liftPolicy();
		p.setCost(248); // 64 nodes
		assert.equal(p.diagramBackoffMs(), p.RENDER_COST_CAP_MS);
		p.setCost(4000);
		assert.equal(p.diagramBackoffMs(), p.RENDER_COST_CAP_MS, 'the cap binds however costly the render');
	});

	test('IDLE IS NOT THE WAIT, and conflating them leaked the whole throttle', () => {
		// "Has this person paused?" and "how long may we make them wait?" are different
		// questions. Using the capped wait for both: at 64 nodes the cap holds the wait at
		// 200ms while a render costs ~248ms, so a 240ms gap measured from the end of a render
		// read as idle and fired a render — every ~240ms, 4 across an 8-character burst.
		const p = liftPolicy();
		p.setCost(248);
		assert.equal(p.diagramBackoffMs(), 200, 'the wait is capped');
		assert.equal(p.diagramIdleMs(), 496, 'idle is NOT');
		assert.ok(p.diagramIdleMs() > p.diagramBackoffMs(), 'a gap between two keystrokes must not read as a pause');
		// The concrete regression: a 240ms inter-keystroke gap on a 64-node fence.
		assert.ok(240 < p.diagramIdleMs(), 'a 240ms typing gap is still typing, not a pause');
	});

	test('idle and wait agree wherever the cap does not bind', () => {
		// Below the cap there is one number and no distinction to get wrong; the split exists
		// only because the cap creates a range where the two answers differ.
		const p = liftPolicy();
		for (const cost of [60, 70, 99]) {
			p.setCost(cost);
			assert.equal(p.diagramIdleMs(), p.diagramBackoffMs(), `${cost}ms: no cap, no split`);
		}
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
