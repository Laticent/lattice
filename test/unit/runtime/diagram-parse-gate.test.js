/**
 * THE LOOP THAT EVERY SUITE MISSED, AND THE GATE THAT COULD BE DELETED WITHOUT ONE FAILING.
 *
 * The parse gate holds the last good diagram while an author types a source that does not
 * parse yet, and surfaces the error once they stop. Two defects shipped through a green
 * suite before these arms existed:
 *
 *   1. `deferUntilQuiet` handed the fence back to `pending` — the state the walk SELECTS —
 *      so every pass re-took it, failed the gate, deferred again and re-armed the quiet
 *      timer roughly every 16ms. The timer measures "has the author stopped typing", and
 *      the deferral itself was what stopped it elapsing. On the built Studio the fence sat
 *      showing stale ink four seconds after typing stopped, with 9,158 tests green.
 *   2. `parsesCleanly` answered synchronously while Mermaid v11's `parse` returns a
 *      PROMISE, so it saw a thenable, could not decide, and passed everything through. A
 *      checker later deleted the gate outright — made it `return true` — and all 9,179
 *      tests stayed green.
 *
 * So these arms pin TERMINATION and the VERDICT, not the individual steps: every step of
 * the loop was correct on its own, which is exactly why nothing caught it.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { JSDOM } from 'jsdom';

const RUNTIME_SRC = readFileSync(new URL('../../../lib/runtime/index.js', import.meta.url), 'utf8');
const BEGIN = '  // ── BEGIN PARSE-GATE PORT';
const END = '  // ── END PARSE-GATE PORT';

/** The state the walk selects, read out of the shipped selector so this cannot drift. */
function shippedPendingState() {
	const m = RUNTIME_SRC.match(/'pre\[data-mermaid-state="(\w+)"\]/);
	assert.ok(m, 'lib/runtime/index.js must declare the pending-fence selector as a literal');
	return m[1];
}

/** Lift the real gate, bound to one jsdom document and a controllable clock. */
function liftGate(html = '') {
	const start = RUNTIME_SRC.indexOf(BEGIN);
	const end = RUNTIME_SRC.indexOf(END);
	assert.notEqual(start, -1, 'the gate must be bracketed with BEGIN PARSE-GATE PORT');
	assert.notEqual(end, -1, 'the gate must be bracketed with END PARSE-GATE PORT');
	const src = RUNTIME_SRC.slice(start, end);
	for (const fn of ['function deferUntilQuiet(preEl)', 'function armErrorSurface()', 'function parsesCleanly(mermaid, source)', 'function renderDiagramJob(mermaid, scopeKey, job)']) {
		assert.ok(src.includes(fn), `the port must hold ${fn}`);
	}

	const dom = new JSDOM(`<body>${html}</body>`);
	const clock = { t: 1000 };
	const timers = [];
	const scheduled = [];
	const rendered = [];
	// eslint-disable-next-line no-new-func
	const make = new Function(
		'document',
		'setTimeout',
		'clearTimeout',
		'scheduleRun',
		'PARSE_CAP_MS',
		'renderDiagramNow',
		'nowMs',
		`${src}\nreturn { deferUntilQuiet, armErrorSurface, sweepDeferredFences, parsesCleanly, renderDiagramJob, forceRender, deferredSince, ERROR_QUIET_MS, DEFERRED_FENCE_SELECTOR };`,
	);
	const api = make(
		dom.window.document,
		(fn, ms) => {
			timers.push({ fn, ms });
			return timers.length;
		},
		(id) => {
			if (timers[id - 1]) timers[id - 1].cancelled = true;
		},
		() => scheduled.push(true),
		50,
		(_mermaid, _scopeKey, job) => {
			rendered.push(job.preEl);
			return Promise.resolve();
		},
		// A CONTROLLABLE CLOCK, because the per-fence quiet windows are the thing under test
		// and wall time cannot be asserted on. `advance` moves it; nothing moves it on its own.
		() => clock.t,
	);
	/** Fire the newest live timer, the way a quiet window elapsing would. */
	const elapse = () => {
		const live = timers.filter((t) => !t.cancelled);
		assert.ok(live.length, 'a quiet timer must have been armed');
		live[live.length - 1].fn();
	};
	/** Move the clock without firing anything, so a deadline can be reasoned about. */
	const advance = (ms) => {
		clock.t += ms;
	};
	return { ...api, doc: dom.window.document, timers, scheduled, rendered, elapse, advance, clock };
}

const FENCE = (state) => `<pre data-mermaid-state="${state}"><code>flowchart LR</code></pre>`;

describe('the parse gate terminates', () => {
	test('a deferral leaves the walk selector — this is the loop fix', () => {
		// The walk selects `pending`. If a deferral parks the fence there, the next pass
		// re-takes it, defers again and re-arms the timer, forever.
		const gate = liftGate(FENCE('rendering'));
		const preEl = gate.doc.querySelector('pre');
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
		// slot alone, which is what keeps the previous SVG on screen. Clearing the attribute
		// would show the author raw Mermaid source instead.
		const gate = liftGate(FENCE('rendering'));
		const preEl = gate.doc.querySelector('pre');
		gate.deferUntilQuiet(preEl);
		assert.ok(preEl.dataset.mermaidState, 'the fence must stay tagged');
		assert.notEqual(preEl.dataset.mermaidState, 'error');
		assert.notEqual(preEl.dataset.mermaidState, 'unavailable');
	});

	test('the quiet timer hands every waiting fence back and forces the render', () => {
		const gate = liftGate(`${FENCE('rendering')}${FENCE('rendered')}`);
		const [first, second] = gate.doc.querySelectorAll('pre');
		gate.deferUntilQuiet(first);
		// The fence's OWN window has to have passed — the timer firing is no longer enough.
		gate.advance(gate.ERROR_QUIET_MS);
		gate.elapse();
		assert.equal(first.dataset.mermaidState, shippedPendingState(), 'back into the walk selector');
		assert.ok(gate.forceRender.has(first), 'and released past the gate, so the error surfaces');
		assert.equal(second.dataset.mermaidState, 'rendered', 'a fence that never deferred is untouched');
		assert.equal(gate.scheduled.length, 1, 'a pass must be scheduled to do the rendering');
	});

	test('typing in ONE fence cannot starve another fence\'s error — the window is per source', () => {
		// The timer used to be a single document-global handle that EVERY deferral cleared and
		// re-armed, so a fence broken at first paint waited on the author stopping typing
		// anywhere in the deck: driven on the real Studio with a second fence edited every
		// 150ms, the broken one sat on an empty slot — no drawing, no error box, no source —
		// for 6.25s, and the wait is unbounded. Before the parse gate it errored immediately.
		//
		// Keying on the FENCE TEXT rather than the element is what fixes it, and the element
		// is the obvious wrong key: both preview hosts replace the <pre> on every keystroke,
		// so a per-node deadline would reset for every fence on every keystroke.
		const gate = liftGate(`${FENCE('rendering')}${FENCE('rendering')}`);
		const [broken, edited] = gate.doc.querySelectorAll('pre');
		broken.querySelector('code').textContent = 'flowchart LR\n  A --';
		gate.deferUntilQuiet(broken);
		// The other fence is retyped repeatedly, each keystroke a new source and a new
		// deferral, while the broken one's text never changes.
		for (let i = 0; i < 6; i++) {
			gate.advance(150);
			edited.querySelector('code').textContent = `flowchart LR\n  B${'x'.repeat(i)} --`;
			gate.deferUntilQuiet(edited);
		}
		// 900ms have passed, twice the broken fence's window.
		gate.elapse();
		assert.equal(broken.dataset.mermaidState, shippedPendingState(), 'the untouched fence is released on ITS deadline');
		assert.ok(gate.forceRender.has(broken), 'and forced past the gate, so its error surfaces');
		assert.equal(edited.dataset.mermaidState, 'deferred', 'the fence still being typed keeps waiting');
	});

	test('the deadline map holds one entry per DEFERRED FENCE, not one per keystroke', () => {
		// Keyed by source text, so a burst mints a key per character. The sweep prunes to what
		// is actually deferred right now; without that the map grows for the life of the page.
		const gate = liftGate(FENCE('rendering'));
		const [preEl] = gate.doc.querySelectorAll('pre');
		for (let i = 0; i < 20; i++) {
			preEl.querySelector('code').textContent = `flowchart LR\n  A${'x'.repeat(i)} --`;
			gate.deferUntilQuiet(preEl);
			gate.advance(10);
		}
		assert.equal(gate.deferredSince.size, 20, 'every keystroke minted a key');
		gate.advance(gate.ERROR_QUIET_MS);
		gate.elapse();
		assert.equal(preEl.dataset.mermaidState, shippedPendingState(), 'the fence is released');
		assert.equal(gate.deferredSince.size, 0, 'and the sweep prunes every key, including the released one');
	});

	test('the timer finds waiting fences from the DOM, holding no node references', () => {
		// The deferred set used to be a strong Set of <pre> elements, and both preview hosts
		// replace the <pre> on every keystroke — so a broken-diagram episode retained one
		// detached subtree per character, permanently. Which fences are waiting is already
		// written on the fences, so the timer asks the document.
		assert.doesNotMatch(RUNTIME_SRC, /parseDeferred/, 'no standing collection of deferred fences');
		const gate = liftGate(FENCE('deferred'));
		gate.armErrorSurface();
		gate.elapse();
		assert.equal(gate.doc.querySelector('pre').dataset.mermaidState, shippedPendingState());
	});

	test('typing again re-arms rather than stacking timers', () => {
		const gate = liftGate(FENCE('rendering'));
		const preEl = gate.doc.querySelector('pre');
		gate.deferUntilQuiet(preEl);
		gate.deferUntilQuiet(preEl);
		gate.deferUntilQuiet(preEl);
		assert.equal(gate.timers.filter((t) => !t.cancelled).length, 1, 'exactly one live quiet window');
	});

	test('the quiet window is longer than a frame — it measures a person, not a burst', () => {
		const gate = liftGate();
		assert.ok(gate.ERROR_QUIET_MS >= 250, `a quiet window of ${gate.ERROR_QUIET_MS}ms would fire mid-word`);
	});

	test('nothing waiting means no pass is scheduled', () => {
		const gate = liftGate(FENCE('rendered'));
		gate.armErrorSurface();
		gate.elapse();
		assert.equal(gate.scheduled.length, 0, 'nothing deferred means nothing to surface');
	});
});

describe('renderDiagramJob routes each fence', () => {
	const withParse = (parse) => ({ parse, render() {}, initialize() {} });
	const slotted = (state, ink) =>
		`<pre data-mermaid-state="${state}"><code>flowchart LR</code></pre><div class="mermaid">${ink ? '<svg></svg>' : ''}</div>`;
	const jobFor = (gate) => {
		const preEl = gate.doc.querySelector('pre');
		return { preEl, target: preEl.nextElementSibling, source: 'flowchart LR\n A --> ' };
	};

	test('a RELEASED fence renders even though it will fail — this is the error path', async () => {
		// Without the bypass a released fence goes straight back through the gate, fails it
		// again and re-defers: stuck at `deferred` forever, stale ink, no error box. The
		// checker deleted this line and 121 runtime tests stayed green.
		const gate = liftGate(slotted('pending', true));
		const job = jobFor(gate);
		gate.forceRender.add(job.preEl);
		await gate.renderDiagramJob(withParse(async () => false), 'k', job);
		assert.deepEqual(gate.rendered, [job.preEl], 'a released fence must reach the renderer');
		assert.notEqual(job.preEl.dataset.mermaidState, 'deferred');
	});

	test('a fence holding ink and failing to parse is deferred, not rendered', async () => {
		const gate = liftGate(slotted('pending', true));
		const job = jobFor(gate);
		await gate.renderDiagramJob(withParse(async () => false), 'k', job);
		assert.deepEqual(gate.rendered, [], 'a doomed render must not be bought');
		assert.equal(job.preEl.dataset.mermaidState, 'deferred');
	});

	test('an EMPTY slot is deferred too — the gate does not key on ink', async () => {
		// Gating only fences that hold ink was measured and rejected: after an error the slot
		// is empty, so every further keystroke skipped the gate and bought a doomed render —
		// 146 frames of raw source and 8 renders on `edit-broken`, against 97 and 1 before
		// this work. Unconditional costs a first-paint break its error for one quiet window;
		// keying on ink costs a strobe on the state authors spend the most time in.
		const gate = liftGate(slotted('pending', false));
		const job = jobFor(gate);
		await gate.renderDiagramJob(withParse(async () => false), 'k', job);
		assert.deepEqual(gate.rendered, [], 'a doomed render must not be bought for an empty slot either');
		assert.equal(job.preEl.dataset.mermaidState, 'deferred');
	});

	test('a fence that parses cleanly renders', async () => {
		const gate = liftGate(slotted('pending', true));
		const job = jobFor(gate);
		await gate.renderDiagramJob(withParse(async () => true), 'k', job);
		assert.deepEqual(gate.rendered, [job.preEl]);
	});
});

describe('the parse gate decides', () => {
	const withParse = (parse) => ({ parse, render() {}, initialize() {} });

	test('a rejecting parse is a NO — deleting this verdict is what made the gate inert once', async () => {
		const gate = liftGate();
		assert.equal(await gate.parsesCleanly(withParse(async () => false), 'flowchart LR\n A --> '), false);
	});

	test('a THROWING parse is a no too — older builds throw instead of returning false', async () => {
		const gate = liftGate();
		assert.equal(await gate.parsesCleanly(withParse(() => { throw new Error('nope'); }), 'x'), false);
	});

	test('an ASYNC parse is awaited, not mistaken for a truthy verdict', async () => {
		// v11 returns a promise. A synchronous reading saw a thenable, could not decide, and
		// passed everything through — the gate was inert and every suite stayed green.
		const gate = liftGate();
		assert.equal(await gate.parsesCleanly(withParse(async () => true), 'flowchart LR\n A --> B'), true);
		assert.equal(await gate.parsesCleanly(withParse(() => Promise.resolve(false)), 'broken'), false);
	});

	test('a mermaid with no parse stands aside rather than blocking', async () => {
		const gate = liftGate();
		assert.equal(await gate.parsesCleanly({ render() {}, initialize() {} }, 'anything'), true);
	});

	test('a HUNG parse is capped, so a third-party promise cannot wedge the queue', async () => {
		// The render owns failure and is itself capped; a gate in front of it that can hang
		// forever just moves the hazard one call earlier.
		const gate = liftGate();
		const verdict = gate.parsesCleanly(withParse(() => new Promise(() => {})), 'x');
		// The clock here is ours, so fire the cap the way PARSE_CAP_MS elapsing would.
		gate.elapse();
		assert.equal(await verdict, true, 'an unanswerable parse must let the capped render decide');
	});

	test('the cap is armed on EVERY parse, so the race cannot be optimized away', async () => {
		const gate = liftGate();
		const before = gate.timers.length;
		const verdict = gate.parsesCleanly(withParse(async () => true), 'flowchart LR\n A --> B');
		assert.equal(gate.timers.length, before + 1, 'a parse with no cap can hang the queue forever');
		assert.equal(await verdict, true);
	});
});
