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
		'function shouldDispatchDiagrams()',
		'function armDiagramBackoff()',
		'function backoffExpired()',
		'function admitDiagramPass(',
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
			diagramBackoffMs, shouldDispatchDiagrams, armDiagramBackoff,
			clearDiagramBackoff, backoffExpired, medianRenderCostMs, admitDiagramPass,
			render(ms) { recordRenderCost(ms); },
			settle(ms) { for (let i = 0; i < 3; i++) recordRenderCost(ms); },
			get handle() { return diagramBackoffHandle; },
			CHEAP_RENDER_MS, DIAGRAM_DEBOUNCE_MS, DIAGRAM_MAX_WAIT_MS,
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
		for (const cost of [0, 22, 30, 36, p.CHEAP_RENDER_MS]) {
			p.settle(cost);
			assert.equal(p.diagramBackoffMs(), 0, `${cost}ms must not be throttled`);
			assert.equal(p.shouldDispatchDiagrams(), true, `${cost}ms must dispatch at once`);
		}
	});

	test('the policy has exactly TWO answers: draw now, or wait the old debounce', () => {
		// A curve was tried and was never operative. Twice-the-median-capped-at-150-floored-at-50
		// returns anything other than 0 or 150 only while a render costs 50-75ms — diagrams of
		// roughly 20 to 33 nodes against the measured size table. Everywhere else it was already
		// a step function with arithmetic dressing it up as adaptive.
		const p = liftPolicy();
		for (const cheap of [0, 22, 36, p.CHEAP_RENDER_MS]) {
			p.settle(cheap);
			assert.equal(p.diagramBackoffMs(), 0, `${cheap}ms is cheap: draw on every keystroke`);
		}
		for (const costly of [60, 75, 130, 248, 4000]) {
			p.settle(costly);
			assert.equal(p.diagramBackoffMs(), p.DIAGRAM_DEBOUNCE_MS, `${costly}ms waits the debounce`);
		}
	});

	test('the costly arm IS the old debounce, so a large diagram cannot regress', () => {
		// 150 is inherited, not tuned: it is what a costly diagram waited before any of this.
		// Four rewrites were spent discovering that every cleverer answer regressed the large
		// case in some cadence, on some host, or with some second fence on the slide.
		const p = liftPolicy();
		assert.equal(p.DIAGRAM_DEBOUNCE_MS, 150);
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
		assert.equal(p.live()[0].ms, p.DIAGRAM_DEBOUNCE_MS, 'a costly render waits the debounce');
		const q = liftPolicy(FENCE(true));
		q.settle(22);
		assert.equal(q.diagramBackoffMs(), 0, 'and a cheap one waits nothing at all');
	});

	test('a COLD first render is outvoted by the two after it', () => {
		// It pays Mermaid's one-time initialization as well as the diagram: a 4-node fence that
		// costs ~36ms every other time measured 210ms once. The median takes the LOWER of two,
		// so that figure stops deciding the policy as soon as a real sample arrives.
		const p = liftPolicy(FENCE(true));
		p.render(210);
		p.render(36);
		assert.equal(p.medianRenderCostMs(), 36, 'two samples: the lower, not the cold one');
		p.render(34);
		assert.equal(p.medianRenderCostMs(), 36);
		assert.equal(p.diagramBackoffMs(), 0, 'so a cheap diagram streams again quickly');
	});

	test('a genuinely expensive diagram is still throttled', () => {
		const p = liftPolicy(FENCE(true));
		p.render(900);
		p.render(350);
		p.render(340);
		assert.equal(p.diagramBackoffMs(), p.DIAGRAM_DEBOUNCE_MS);
	});

	test('arriving from a BIG diagram at a small one stops paying for the big one', () => {
		const p = liftPolicy(FENCE(true));
		p.settle(239); // a 128-node fence
		assert.equal(p.diagramBackoffMs(), 150);
		p.render(22);
		p.render(22);
		assert.equal(p.diagramBackoffMs(), 0, 'two renders of the small one is enough');
	});

	test('a HELD pass arms the timer and is not admitted', () => {
		// `admitDiagramPass` is the gate itself, and it lives inside the port because when the
		// two lines that USE the policy sat outside it, a checker found eight mutations that
		// survived all 9211 tests — including the two below.
		const p = liftPolicy(FENCE(true));
		p.settle(248);
		assert.equal(p.admitDiagramPass(false), false, 'an edit on an expensive diagram is held');
		assert.equal(p.live().length, 1, 'and a timer is armed to come back');
	});

	test('backoffElapsed ADMITS the pass — dropping it holds the render forever', () => {
		// The mutation: `admitDiagramPass(backoffElapsed)` ignoring its argument. The timer
		// then re-enters, is held again, arms another timer, and the diagram never draws.
		const p = liftPolicy(FENCE(true));
		p.settle(248);
		assert.equal(p.admitDiagramPass(true), true, 'the timer’s own re-entry must get through');
		assert.equal(p.live().length, 0, 'and must not leave a timer behind');
	});

	test('an ADMITTED pass clears the hold, so the ceiling measures one stretch', () => {
		// The mutation: deleting `clearDiagramBackoff()`. The ceiling then keeps measuring a
		// stretch that already ended, and expires early on the next one.
		const p = liftPolicy(FENCE(true));
		p.settle(248);
		p.admitDiagramPass(false);
		p.advance(1300);
		assert.equal(p.backoffExpired(), true, 'held long enough to expire');
		p.admitDiagramPass(true);
		assert.equal(p.backoffExpired(), false, 'admitting resets the budget');
		assert.equal(p.live().length, 0, 'and cancels the pending timer');
	});

	test('the floor sits between the two measurements that bracket it', () => {
		const p = liftPolicy();
		assert.ok(p.CHEAP_RENDER_MS > 36, 'a ~30ms render must stay un-throttled');
		assert.ok(p.CHEAP_RENDER_MS < 70, 'a ~70ms render must be throttled');
	});
});
