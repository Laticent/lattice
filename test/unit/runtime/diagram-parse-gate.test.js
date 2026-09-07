/**
 * THE LOOP THAT EVERY SUITE MISSED.
 *
 * The parse gate holds the last good diagram while an author types a source that does not
 * parse yet, and surfaces the error once they stop. Its first version never surfaced
 * anything: `deferUntilQuiet` handed the fence back to `pending`, which is the state the
 * walk SELECTS, so the next pass took it, failed the gate, deferred again and RE-ARMED the
 * quiet timer — about every 16ms. The timer measures "has the author stopped typing", and
 * the deferral itself was what stopped it elapsing. Driven on the built Studio the fence
 * sat `pending` with stale ink four seconds after typing stopped, and `npm test` was green
 * the whole time.
 *
 * These arms lift the shipped gate between its sentinels — the same idiom
 * diagram-adoption.test.js uses — and pin the two facts that make it terminate:
 *   1. a deferral leaves the walk's selector, so a pass cannot re-take the same fence;
 *   2. the quiet timer puts it back and forces the render, so the error is not swallowed.
 * Arm 1 fails if `deferred` is changed back to `pending`, which is the exact regression.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { JSDOM } from 'jsdom';

const RUNTIME_SRC = readFileSync(new URL('../../../lib/runtime/index.js', import.meta.url), 'utf8');
const BEGIN = '  // ── BEGIN PARSE-GATE PORT';
const END = '  // ── END PARSE-GATE PORT';

/** The state the walk selects. Read out of the shipped selector so the test cannot drift. */
function shippedPendingState() {
	const m = RUNTIME_SRC.match(/'pre\[data-mermaid-state="(\w+)"\]/);
	assert.ok(m, 'lib/runtime/index.js must declare the pending-fence selector as a literal');
	return m[1];
}

/** Lift the real gate and bind it to one jsdom document plus a fake timer. */
function liftGate() {
	const start = RUNTIME_SRC.indexOf(BEGIN);
	const end = RUNTIME_SRC.indexOf(END);
	assert.notEqual(start, -1, 'the gate must be bracketed with BEGIN PARSE-GATE PORT');
	assert.notEqual(end, -1, 'the gate must be bracketed with END PARSE-GATE PORT');
	const src = RUNTIME_SRC.slice(start, end);
	assert.match(src, /function deferUntilQuiet\(preEl\)/, 'the port must hold deferUntilQuiet');
	assert.match(src, /function armErrorSurface\(\)/, 'the port must hold armErrorSurface');

	const timers = [];
	const scheduled = [];
	// eslint-disable-next-line no-new-func
	const make = new Function(
		'setTimeout',
		'clearTimeout',
		'scheduleRun',
		`${src}\nreturn { deferUntilQuiet, armErrorSurface, parseDeferred, forceRender, ERROR_QUIET_MS };`,
	);
	const api = make(
		(fn, ms) => {
			timers.push({ fn, ms });
			return timers.length;
		},
		(id) => {
			if (timers[id - 1]) timers[id - 1].cancelled = true;
		},
		() => scheduled.push(true),
	);
	/** Fire the newest live timer, the way a quiet window elapsing would. */
	const elapse = () => {
		const live = timers.filter((t) => !t.cancelled);
		assert.ok(live.length, 'a quiet timer must have been armed');
		live[live.length - 1].fn();
	};
	return { ...api, timers, scheduled, elapse };
}

const fenceIn = (state) => {
	const dom = new JSDOM(`<pre data-mermaid-state="${state}"><code>flowchart LR</code></pre>`);
	return dom.window.document.querySelector('pre');
};

describe('the parse gate terminates', () => {
	test('a deferral leaves the walk selector — this is the loop fix', () => {
		// The walk selects `pending`. If a deferral parks the fence there, the next pass
		// re-takes it, defers again and re-arms the timer, forever. Nothing else in the
		// suite notices, because every individual step is correct.
		const gate = liftGate();
		const preEl = fenceIn('rendering');
		gate.deferUntilQuiet(preEl);
		assert.notEqual(
			preEl.dataset.mermaidState,
			shippedPendingState(),
			'a deferred fence parked in the walk selector re-triggers itself every pass',
		);
		assert.equal(preEl.dataset.mermaidState, 'deferred');
	});

	test('a deferral keeps the fence tagged, so CSS still hides the source', () => {
		// Any tagged state except error/unavailable hides the <pre> and leaves the .mermaid
		// slot alone — which is what keeps the previous SVG on screen. Clearing the attribute
		// entirely would show the author raw Mermaid source instead.
		const gate = liftGate();
		const preEl = fenceIn('rendering');
		gate.deferUntilQuiet(preEl);
		assert.ok(preEl.dataset.mermaidState, 'the fence must stay tagged');
		assert.notEqual(preEl.dataset.mermaidState, 'error');
		assert.notEqual(preEl.dataset.mermaidState, 'unavailable');
	});

	test('the quiet timer hands the fence back and forces the render', () => {
		const gate = liftGate();
		const preEl = fenceIn('rendering');
		gate.deferUntilQuiet(preEl);
		assert.equal(gate.parseDeferred.size, 1);
		gate.elapse();
		assert.equal(preEl.dataset.mermaidState, shippedPendingState(), 'back into the walk selector');
		assert.ok(gate.forceRender.has(preEl), 'and released past the gate, so the error surfaces');
		assert.equal(gate.parseDeferred.size, 0);
		assert.equal(gate.scheduled.length, 1, 'a pass must be scheduled to do the rendering');
	});

	test('typing again re-arms rather than stacking timers', () => {
		// Each deferral cancels the previous window: the timer is measuring the gap since the
		// LAST keystroke, not since the first.
		const gate = liftGate();
		const preEl = fenceIn('rendering');
		gate.deferUntilQuiet(preEl);
		gate.deferUntilQuiet(preEl);
		gate.deferUntilQuiet(preEl);
		assert.equal(gate.timers.filter((t) => !t.cancelled).length, 1, 'exactly one live quiet window');
	});

	test('the quiet window is longer than a frame — it measures a person, not a burst', () => {
		const gate = liftGate();
		assert.ok(gate.ERROR_QUIET_MS >= 250, `a quiet window of ${gate.ERROR_QUIET_MS}ms would fire mid-word`);
	});

	test('an empty deferral set does not schedule a pass', () => {
		const gate = liftGate();
		gate.armErrorSurface();
		gate.elapse();
		assert.equal(gate.scheduled.length, 0, 'nothing deferred means nothing to surface');
	});
});
