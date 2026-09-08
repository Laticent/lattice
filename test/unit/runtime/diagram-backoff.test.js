/**
 * Unit: the diagram dispatch policy — ONE timer, sized to what a render costs.
 *
 * Lifted verbatim from `lib/runtime/index.js` between the BACK-OFF PORT sentinels and
 * evaluated with its dependencies injected, so these cells test the SHIPPED policy rather
 * than a paraphrase of it. What the policy decides is a single number: how long
 * `scheduleRun` waits before the pass that draws. A cheap render gets the frame-level floor
 * and redraws live; a costly one gets the 150ms this work set out to delete, which is the
 * shape of the build being replaced.
 *
 * The history matters because two designs were measured and rejected here, and both looked
 * right on paper:
 *
 *   · a redraw CEILING (1200ms) so steady typing could not starve the diagram. It fires
 *     mid-burst, and mid-burst means a ~376ms blocking `mermaid.render` between keystrokes:
 *     30% main thread against 10%, and the harness's own typing stretched 3331 -> 4188ms.
 *   · a SECOND timer for the dispatch, on top of the content floor. Two serial timers cannot
 *     be made to sum: charged in full a 4-node fence read 152-171ms against the old build's
 *     102-139ms, and netting the floor out dropped the effective wait to 150ms from the last
 *     keystroke against a ~120ms typing cadence, which a costly render's own jitter closes.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

const RUNTIME_SRC = readFileSync(new URL('../../../lib/runtime/index.js', import.meta.url), 'utf8');
const BEGIN = '  // ── BEGIN BACK-OFF PORT';
const END = '  // ── END BACK-OFF PORT';

function liftPolicy() {
	const start = RUNTIME_SRC.indexOf(BEGIN);
	const end = RUNTIME_SRC.indexOf(END);
	assert.notEqual(start, -1, 'the policy must stay bracketed with BEGIN BACK-OFF PORT');
	assert.notEqual(end, -1, 'the policy must stay bracketed with END BACK-OFF PORT');
	const src = RUNTIME_SRC.slice(start, end);
	for (const fn of ['function medianRenderCostMs()', 'function recordRenderCost(', 'function diagramIsCheap()', 'function contentFloorMs(', 'function scopeHasDrawn(']) {
		assert.ok(src.includes(fn), `the port must hold ${fn} — the scheduling is the behavior`);
	}
	// NO TIMER LIVES HERE ANY MORE, and that is an assertion rather than an observation: the
	// two rejected designs above both took the shape of a second clock inside this port.
	assert.doesNotMatch(src, /setTimeout|clearTimeout/, 'the policy decides a NUMBER; scheduleRun owns the only timer');

	// eslint-disable-next-line no-new-func
	const make = new Function(
		'COALESCE_MS',
		'DEBOUNCE_MS',
		`${src}
		return {
			medianRenderCostMs, diagramIsCheap, contentFloorMs, CHEAP_RENDER_MS, RENDER_COST_SAMPLES,
			scopeHasDrawn, noteScopeDrew,
			render(ms) { recordRenderCost(ms); },
			settle(ms) { for (let i = 0; i < 3; i++) recordRenderCost(ms); },
			get costs() { return [...renderCosts]; },
		};`,
	);
	return make(16, 150);
}

describe('the diagram dispatch policy', () => {
	test('a CHEAP render gets the frame floor — the live per-keystroke redraw is the feature', () => {
		// Measured on the built Studio, second burst onward on a 4-node fence: 47ms and 62ms
		// to the redraw against the old build's 102-139ms, at 24 renders of ~39ms each.
		const p = liftPolicy();
		for (const cost of [0, 22, 30, 36, p.CHEAP_RENDER_MS]) {
			p.settle(cost);
			assert.equal(p.diagramIsCheap(), true, `${cost}ms must count as cheap`);
			assert.equal(p.contentFloorMs(), 16, `${cost}ms must wait only the frame floor`);
		}
	});

	test('a COSTLY render gets the old debounce, and that is the whole of it', () => {
		// 150 is inherited, not tuned: it is what a costly diagram waited before any of this,
		// and with the dispatch's own timer gone it is ALL a costly diagram waits — one timer,
		// same shape as the build being replaced. Re-measured on a 64-node fence: 1 render,
		// 11-12% main thread, typing 3364-3397ms against that build's 1, 10-11%, 3331-3341ms.
		const p = liftPolicy();
		for (const cost of [51, 72, 130, 239, 400]) {
			p.settle(cost);
			assert.equal(p.diagramIsCheap(), false, `${cost}ms must count as costly`);
			assert.equal(p.contentFloorMs(), 150, `${cost}ms must wait the old debounce`);
		}
	});

	test('NOTHING DRAWN YET means nothing to keep live, so the floor is the old debounce', () => {
		// A live redraw keeps an EXISTING picture up to date. A fence that has never once
		// rendered has no picture, so the frame-level floor and the parse gate buy it nothing
		// while charging a parse per keystroke. Measured on a 64-node fence with a half-written
		// tail, 24 chars at 120ms: 25-27% of the main thread against the old build's 1%, for
		// 115-122 frames of raw source against its 117-122 — identical output, ~800ms more work
		// per burst. This is the author building a large diagram from scratch, which the
		// decision doc calls the main case and the ledger only ever measured at 4-5 nodes.
		const p = liftPolicy();
		p.settle(22);
		assert.equal(p.diagramIsCheap(), true, 'cheap by cost');
		assert.equal(p.contentFloorMs(false), 150, 'but with nothing to keep live, it waits');
		assert.equal(p.contentFloorMs(true), 16, 'and with something to keep live, it does not');
	});

	test('a scope becomes live-worthy once something in it has DRAWN', () => {
		const p = liftPolicy();
		assert.equal(p.scopeHasDrawn('slide-2'), false, 'nothing has drawn yet');
		p.noteScopeDrew('slide-2');
		assert.equal(p.scopeHasDrawn('slide-2'), true);
		assert.equal(p.scopeHasDrawn('slide-3'), false, 'and it does not leak across scopes');
	});

	test('an empty scope key never marks anything drawn', () => {
		// The same empty-key hazard the text-keyed collections carry: a scope we cannot read
		// must not make every unreadable scope look live-worthy.
		const p = liftPolicy();
		p.noteScopeDrew('');
		assert.equal(p.scopeHasDrawn(''), false);
	});

	test('a COSTLY diagram waits the debounce whether or not anything has drawn', () => {
		// The precondition may only ever take the live floor AWAY, never grant it.
		const p = liftPolicy();
		p.settle(248);
		assert.equal(p.contentFloorMs(true), 150);
		assert.equal(p.contentFloorMs(false), 150);
	});

	test('the floor sits between the two measurements that bracket it', () => {
		const p = liftPolicy();
		assert.ok(p.CHEAP_RENDER_MS > 36, 'a ~30ms render must stay un-throttled');
		assert.ok(p.CHEAP_RENDER_MS < 70, 'a ~70ms render must be throttled');
	});

	test('a COLD first render is outvoted by the two after it', () => {
		// The first `mermaid.render` of a session also pays Mermaid's per-diagram-type lazy
		// init — a 4-node fence that costs ~36ms every other time measured 210ms once. Reading
		// only the latest number let that one figure decide the policy for the whole burst
		// that followed.
		const p = liftPolicy();
		p.render(210);
		p.render(36);
		p.render(38);
		assert.equal(p.diagramIsCheap(), true, 'two real samples must outvote the cold one');
	});

	test('ONE sample is the cold one, so it decides costly — and that is parity, not a loss', () => {
		// The known limit, stated rather than hidden. On the first burst after a load the cost
		// record holds only the cold render, so a small diagram takes the costly arm and waits
		// the old debounce. That is the old build's behavior exactly (measured: 110-140ms
		// against 102-139ms), so the cost is a delayed win rather than a regression — the live
		// redraw arrives from the second burst on.
		const p = liftPolicy();
		p.render(210);
		assert.equal(p.diagramIsCheap(), false);
		assert.equal(p.contentFloorMs(), 150, 'one cold sample must not buy the live arm');
	});

	test('an empty record is CHEAP, so arriving somewhere new costs nothing to draw', () => {
		// A wait is only ever right when the author is CHANGING something. On a first paint
		// there is no cost on record and nothing to coalesce.
		const p = liftPolicy();
		assert.deepEqual(p.costs, []);
		assert.equal(p.diagramIsCheap(), true);
	});

	test('the median takes the LOWER of two, and keeps only the last few samples', () => {
		// Mutations that survived an earlier suite: taking the upper of two, and letting the
		// record grow without bound so a diagram that got cheaper never noticed.
		const p = liftPolicy();
		p.render(20);
		p.render(400);
		assert.equal(p.medianRenderCostMs(), 20, 'the lower of two, not the upper');
		const q = liftPolicy();
		for (const ms of [400, 400, 400, 20, 20, 20]) q.render(ms);
		assert.equal(q.costs.length, q.RENDER_COST_SAMPLES, 'the record is bounded');
		assert.equal(q.diagramIsCheap(), true, 'and a diagram that got cheaper is noticed');
	});
});
