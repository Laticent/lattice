/**
 * THE DISPATCH POLICY — whether the author's next keystroke costs a blocking render, how
 * long a redraw is held, and the ceiling that stops "held" becoming "frozen".
 *
 * WHY THESE ARMS DRIVE THE TIMER INSTEAD OF ONLY THE ARITHMETIC. Two designs have now
 * shipped from this file with the whole suite green and the mechanism not working. The first
 * coalesced on completion, which cannot fire because `mermaid.render` occupies the main
 * thread so a keystroke never arrives mid-run. The second guarded a ceiling INSIDE the timer
 * callback while every pass cancelled that callback before it ran — a 64-node diagram sat
 * frozen for 14166ms against a nominal 1200ms ceiling. An independent checker then mutated
 * the policy eight ways, including inverting the leading edge and dropping `backoffElapsed`
 * (which never redraws at all), and every mutation survived 9179 tests.
 *
 * The common cause: the arms tested pure arithmetic while the behavior lived in the
 * scheduling. So the decision, the arm, the ceiling and the re-entry now sit inside the
 * lifted block together, and these arms drive them with a controllable clock and timer.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { JSDOM } from 'jsdom';

const RUNTIME_SRC = readFileSync(new URL('../../../lib/runtime/index.js', import.meta.url), 'utf8');
const BEGIN = '  // ── BEGIN BACK-OFF PORT';
const END = '  // ── END BACK-OFF PORT';
const PENDING = 'pre[data-mermaid-state="pending"],marp-pre[data-mermaid-state="pending"]';

/** A pending fence whose slot is the real `.mermaid` sibling, holding a drawing or not. */
const FENCE = (hasInk) =>
	`<pre data-mermaid-state="pending"><code>flowchart LR</code></pre><div class="mermaid">${hasInk ? '<svg></svg>' : ''}</div>`;

function liftPolicy(html = '') {
	const start = RUNTIME_SRC.indexOf(BEGIN);
	const end = RUNTIME_SRC.indexOf(END);
	assert.notEqual(start, -1, 'the policy must stay bracketed with BEGIN BACK-OFF PORT');
	assert.notEqual(end, -1, 'the policy must stay bracketed with END BACK-OFF PORT');
	const src = RUNTIME_SRC.slice(start, end);
	for (const fn of [
		'function diagramBackoffMs()',
		'function anyFenceWithoutInk()',
		'function shouldDispatchDiagrams()',
		'function armDiagramBackoff()',
		'function backoffExpired()',
	]) {
		assert.ok(src.includes(fn), `the port must hold ${fn} — the scheduling is the behavior`);
	}

	const dom = new JSDOM(`<body>${html}</body>`);
	const clock = { t: 10_000 };
	const timers = [];
	const runs = [];
	// eslint-disable-next-line no-new-func
	const make = new Function(
		'document',
		'PENDING_FENCE_SELECTOR',
		'nowMs',
		'setTimeout',
		'clearTimeout',
		'initAndRun',
		`${src}
		return {
			diagramBackoffMs, anyFenceWithoutInk, shouldDispatchDiagrams, armDiagramBackoff,
			clearDiagramBackoff, backoffExpired, medianRenderCostMs,
			render(ms) { recordRenderCost(ms); },
			settle(ms) { for (let i = 0; i < 3; i++) recordRenderCost(ms); },
			get handle() { return diagramBackoffHandle; },
			RENDER_COST_FLOOR_MS, RENDER_COST_CAP_MS, DIAGRAM_MAX_WAIT_MS,
		};`,
	);
	const api = make(
		dom.window.document,
		PENDING,
		() => clock.t,
		(fn, ms) => {
			timers.push({ fn, ms, cancelled: false });
			return timers.length;
		},
		(id) => {
			if (timers[id - 1]) timers[id - 1].cancelled = true;
		},
		(opts) => runs.push(opts),
	);
	/** Advance the clock without firing anything. */
	const advance = (ms) => {
		clock.t += ms;
	};
	/** Fire the one live timer, as its delay elapsing would. */
	const fire = () => {
		const live = timers.filter((t) => !t.cancelled);
		assert.ok(live.length, 'a back-off timer must be armed');
		live[live.length - 1].cancelled = true;
		live[live.length - 1].fn();
	};
	const live = () => timers.filter((t) => !t.cancelled);
	return { ...api, doc: dom.window.document, timers, runs, advance, fire, live };
}

describe('the diagram dispatch policy', () => {
	test('a CHEAP render is never delayed — the live per-keystroke redraw is the feature', () => {
		// An 8-character burst on a ~30ms fence stretched 1086ms -> 1130ms redrawing on every
		// keystroke: 44ms across eight, which nobody can feel.
		const p = liftPolicy(FENCE(true));
		for (const cost of [0, 22, 30, 36, p.RENDER_COST_FLOOR_MS]) {
			p.settle(cost);
			assert.equal(p.diagramBackoffMs(), 0, `${cost}ms must not be throttled`);
			assert.equal(p.shouldDispatchDiagrams(), true, `${cost}ms must dispatch at once`);
		}
	});

	test('an EXPENSIVE render waits twice its cost, so re-rendering is a third of the time', () => {
		const p = liftPolicy(FENCE(true));
		p.settle(60);
		assert.equal(p.diagramBackoffMs(), 120);
		p.settle(70);
		assert.equal(p.diagramBackoffMs(), 140);
	});

	test('THE WAIT NEVER EXCEEDS 150ms — the debounce this work removed', () => {
		// A fence already holding a drawing always waits, so this IS what the author feels
		// after their last keystroke. A revision that applied a second term with `Math.max`
		// outside this cap put the post-keystroke redraw behind the old build in every cell
		// measured: 610ms against 281, 696 against 522, 899 against 525, 1111 against 903.
		const p = liftPolicy(FENCE(true));
		assert.equal(p.RENDER_COST_CAP_MS, 150, 'the cap IS the old debounce, deliberately');
		for (const cost of [248, 500, 4000]) {
			p.settle(cost);
			assert.equal(p.diagramBackoffMs(), 150, `${cost}ms render must still wait only 150ms`);
		}
	});

	test('an EMPTY slot dispatches at once — that is arrival, not editing', () => {
		const p = liftPolicy(FENCE(false));
		p.settle(248);
		assert.ok(p.diagramBackoffMs() > 0, 'expensive enough to be throttled');
		assert.equal(p.shouldDispatchDiagrams(), true, 'and yet dispatched, because nothing is on screen');
	});

	test('a slot ALREADY SHOWING a drawing waits', () => {
		const p = liftPolicy(FENCE(true));
		p.settle(248);
		assert.equal(p.shouldDispatchDiagrams(), false);
	});

	test('the leading edge is not inverted — the mutation that survived 9179 tests', () => {
		// Inverting it delays every arrival and dispatches every edit immediately, which is
		// exactly the regression this policy exists to remove. Both halves asserted together,
		// because either alone is satisfied by a constant.
		const editing = liftPolicy(FENCE(true));
		const arriving = liftPolicy(FENCE(false));
		editing.settle(248);
		arriving.settle(248);
		assert.equal(editing.shouldDispatchDiagrams(), false, 'an edit waits');
		assert.equal(arriving.shouldDispatchDiagrams(), true, 'an arrival does not');
	});

	test('a sibling that is not the SLOT counts as no ink', () => {
		// `adoptWithinNode` guards this question with a `.mermaid` class check; this one used
		// to guard only on finding an `<svg>` anywhere in the sibling. Two derivations of one
		// question must not disagree — a false "has ink" delays an arrival forever.
		const p = liftPolicy('<pre data-mermaid-state="pending"><code>x</code></pre><figure><svg></svg></figure>');
		p.settle(248);
		assert.equal(p.anyFenceWithoutInk(), true, 'an <svg> in a non-slot sibling is not this fence’s ink');
	});

	test('ONE empty slot among several is enough to go now', () => {
		const p = liftPolicy(`${FENCE(true)}${FENCE(false)}${FENCE(true)}`);
		p.settle(248);
		assert.equal(p.anyFenceWithoutInk(), true);
	});

	test('THE CEILING HOLDS AGAINST CONTINUOUS RE-ARMING — the 14-second freeze', () => {
		// The bug this kills: the ceiling was tested only inside the timer callback, and every
		// pass that re-arms cancels that callback first. The runtime's own transform writes
		// echo back through the observer about four times per keystroke, so the timer was reset
		// faster than it could ever fire and the ceiling was never reached. Measured on the
		// built Studio: a 64-node diagram frozen for 14166ms against a 1200ms ceiling, scaling
		// with how long the author kept typing.
		const p = liftPolicy(FENCE(true));
		p.settle(248);
		assert.equal(p.shouldDispatchDiagrams(), false, 'it starts by waiting');
		p.armDiagramBackoff();
		// Somebody types steadily; every pass re-arms, and none of them ever lets the timer run.
		for (let i = 0; i < 40; i++) {
			p.advance(100);
			if (p.shouldDispatchDiagrams()) break;
			p.armDiagramBackoff();
		}
		assert.ok(
			p.shouldDispatchDiagrams(),
			'the ceiling must be reachable by a pass, not only by the timer it keeps cancelling',
		);
	});

	test('the ceiling is reached in about DIAGRAM_MAX_WAIT_MS, not later', () => {
		const p = liftPolicy(FENCE(true));
		p.settle(248);
		p.armDiagramBackoff();
		let held = 0;
		while (!p.shouldDispatchDiagrams() && held < 20_000) {
			p.advance(100);
			held += 100;
			if (!p.shouldDispatchDiagrams()) p.armDiagramBackoff();
		}
		assert.ok(held <= p.DIAGRAM_MAX_WAIT_MS + 100, `held ${held}ms, ceiling ${p.DIAGRAM_MAX_WAIT_MS}ms`);
	});

	test('the ceiling clock spans the whole held stretch, not the last re-arm', () => {
		const p = liftPolicy(FENCE(true));
		p.settle(248);
		p.armDiagramBackoff();
		p.advance(700);
		p.armDiagramBackoff(); // a re-arm must NOT restart the budget
		p.advance(600);
		assert.equal(p.backoffExpired(), true, '1300ms held in total must count as held');
	});

	test('a pass that gets through RESETS the budget, so the next stretch gets its own', () => {
		const p = liftPolicy(FENCE(true));
		p.settle(248);
		p.armDiagramBackoff();
		p.advance(1300);
		assert.equal(p.backoffExpired(), true);
		p.clearDiagramBackoff();
		assert.equal(p.backoffExpired(), false, 'a fresh stretch is not born expired');
	});

	test('THE TIMER RE-ENTERS WITH backoffElapsed — dropping it never redraws at all', () => {
		// The mutation that wedges the pipeline outright and survived the whole suite: without
		// the flag the re-entered pass takes the wait branch again and arms another timer,
		// forever. Nothing but driving the callback can see this.
		const p = liftPolicy(FENCE(true));
		p.settle(248);
		p.armDiagramBackoff();
		p.fire();
		assert.equal(p.runs.length, 1, 'the timer must re-enter the pass');
		assert.deepEqual(p.runs[0], { backoffElapsed: true }, 'and it must say the wait is over');
	});

	test('re-arming cancels the pending timer, so a burst leaves exactly one live', () => {
		const p = liftPolicy(FENCE(true));
		p.settle(248);
		for (let i = 0; i < 5; i++) {
			p.advance(50);
			p.armDiagramBackoff();
		}
		assert.equal(p.live().length, 1, 'a trailing debounce keeps one timer, not five');
	});

	test('the timer is armed for the WAIT, not for some other number', () => {
		const p = liftPolicy(FENCE(true));
		p.settle(60);
		p.armDiagramBackoff();
		assert.equal(p.live()[0].ms, 120, 'twice a 60ms render');
		const q = liftPolicy(FENCE(true));
		q.settle(248);
		q.armDiagramBackoff();
		assert.equal(q.live()[0].ms, 150, 'capped for an expensive one');
	});

	test('a COLD first render does not throttle the burst that follows it', () => {
		// The first `mermaid.render` of a session also pays Mermaid's initialization: a 4-node
		// fence that costs ~36ms measured 210ms once. The median must take the LOWER of two,
		// or that cold sample answers for the diagram across two more renders.
		const p = liftPolicy(FENCE(true));
		p.render(210);
		p.render(36);
		assert.equal(p.medianRenderCostMs(), 36, 'two samples: the lower one, not the cold one');
		p.render(34);
		assert.equal(p.medianRenderCostMs(), 36);
		assert.equal(p.diagramBackoffMs(), 0, 'so a cheap diagram still streams');
	});

	test('arriving from a BIG diagram at a small one stops paying for the big one', () => {
		const p = liftPolicy(FENCE(true));
		p.settle(239); // a 128-node fence
		assert.equal(p.diagramBackoffMs(), 150);
		p.render(22);
		p.render(22);
		assert.equal(p.diagramBackoffMs(), 0, 'two renders of the small one is enough');
	});

	test('the floor sits between the two measurements that bracket it', () => {
		const p = liftPolicy();
		assert.ok(p.RENDER_COST_FLOOR_MS > 36, 'a ~30ms render must stay un-throttled');
		assert.ok(p.RENDER_COST_FLOOR_MS < 70, 'a ~70ms render must be throttled');
	});
});
