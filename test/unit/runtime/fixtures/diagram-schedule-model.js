/**
 * A DETERMINISTIC DRIVER FOR THE SHIPPED SCHEDULING POLICY.
 *
 * WHAT IT IS AND IS NOT. Every DECISION here is made by the real functions, lifted verbatim
 * from `lib/runtime/index.js` between the BACK-OFF PORT sentinels: what the floor is, whether
 * a diagram counts as cheap, what a render costs the record, whether a scope has drawn. What
 * is re-implemented is only the EVENT LOOP around them — a virtual clock, one pending timer,
 * and a stream of keystrokes — which is the part a browser cannot make deterministic and the
 * part the nightly differential tier exists to keep honest.
 *
 * WHY A MODEL AT ALL, when there is a Playwright probe. The probe answers "what happened on
 * this host, this run" and its numbers do not transfer: the seventh review pass measured a
 * 64-node fence at 360-490ms where the ledger said 130ms, so every absolute figure had to be
 * re-derived. Counts do transfer, and a count is exactly what a burst of keystrokes against a
 * fixed policy produces. Running that here costs milliseconds and no browser, so it can gate
 * every push rather than a nightly.
 *
 * THE UNITS ARE INTEGERS ON PURPOSE. Nearly every defect this branch shipped and retracted
 * showed up as a count before it showed up as a duration — 8 renders where the old build did
 * 1, 3 where it did 1, 24 parses where it did 0. A relation over counts needs no tolerance
 * band, so it cannot be tuned into passing.
 */

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const RUNTIME_SRC = readFileSync(join(__dirname, '../../../../lib/runtime/index.js'), 'utf8');
const BEGIN = '  // ── BEGIN BACK-OFF PORT';
const END = '  // ── END BACK-OFF PORT';

/** The shipped constants the driver must not restate. */
const COALESCE_MS = 16;
const DEBOUNCE_MS = 150;

function liftPolicy() {
	const start = RUNTIME_SRC.indexOf(BEGIN);
	const end = RUNTIME_SRC.indexOf(END);
	assert.notEqual(start, -1, 'the policy must stay bracketed with BEGIN BACK-OFF PORT');
	assert.notEqual(end, -1, 'the policy must stay bracketed with END BACK-OFF PORT');
	const src = RUNTIME_SRC.slice(start, end);
	const make = new Function(
		'COALESCE_MS',
		'DEBOUNCE_MS',
		`${src}\nreturn { contentFloorMs, diagramIsCheap, recordRenderCost, noteScopeDrew, scopeHasDrawn, parseGateApplies, medianRenderCostMs };`,
	);
	return make(COALESCE_MS, DEBOUNCE_MS);
}

/**
 * Type `keystrokes` characters into one fence, `gapMs` apart, and report what the policy
 * spent.
 *
 * THE LOOP MIRRORS `scheduleRun`: every keystroke re-arms the single timer, so a burst that
 * keeps arriving keeps pushing the pass out; when the timer finally elapses the pass runs, and
 * that pass renders (and, on the live arm with something already drawn, parses first). The
 * fence's render costs `renderMs`, which is what `recordRenderCost` is fed — the same number
 * whether the render succeeded or failed, because a failed render costs the same main thread
 * and reading only successes is what made a never-drawn fence read cheap for ever.
 *
 * @param {object} o
 * @param {number} o.keystrokes   how many characters the author types
 * @param {number} o.gapMs        the inter-key gap
 * @param {number} o.renderMs     what one render of this fence costs
 * @param {number} [o.parseMs]    what one `mermaid.parse` of it costs (live arm only)
 * @param {boolean} [o.everDrawn] has anything in this scope already drawn?
 * @param {boolean} [o.parses]    does the source parse? a fence mid-word does not
 * @param {number} [o.priorSamples] renders already on the cost record before the burst
 */
function runBurst({
	keystrokes,
	gapMs,
	renderMs,
	parseMs = Math.max(1, Math.round(renderMs / 10)),
	everDrawn = true,
	parses = true,
	priorSamples = 1,
}) {
	const p = liftPolicy();
	const SCOPE = 'slide-1';
	// The arrival render, which is what the record holds when the author starts typing. A
	// fence that has never drawn has nothing on the record and nothing in `drawnScopes`.
	if (everDrawn) {
		for (let i = 0; i < priorSamples; i++) p.recordRenderCost(renderMs);
		p.noteScopeDrew(SCOPE);
	}

	let now = 0;
	let timerAt = null;
	const out = { renders: 0, parses: 0, busyMs: 0, floors: [], redrawMs: null, parseMs };

	const runPass = () => {
		// THE SHIPPED CONDITION, not a restatement of it. It was written out inline here at
		// first, and that made the relations blind to the one thing they most needed to see:
		// putting the parse back on the costly arm — one of the three regressions this branch
		// shipped and retracted — left all fourteen of them green.
		if (p.parseGateApplies(SCOPE)) {
			out.parses++;
			out.busyMs += parseMs;
			now += parseMs;
			// A source that does not parse is HELD: no render, no cost sample.
			if (!parses) return;
		}
		out.renders++;
		out.busyMs += renderMs;
		now += renderMs;
		p.recordRenderCost(renderMs);
		if (parses) p.noteScopeDrew(SCOPE);
	};

	for (let k = 0; k < keystrokes; k++) {
		const floor = p.contentFloorMs(p.scopeHasDrawn(SCOPE));
		out.floors.push(floor);
		// Does the pending timer elapse before the next keystroke arrives? The keystroke
		// re-arms it either way, which is what a trailing edge means.
		if (timerAt !== null && timerAt <= now + gapMs) {
			now = timerAt;
			timerAt = null;
			runPass();
		}
		now = Math.max(now, k * gapMs);
		timerAt = now + floor;
	}
	// The author stops. The last armed timer is what draws, and the wait for it is the number
	// they actually feel.
	if (timerAt !== null) {
		const lastKeyAt = now;
		now = timerAt;
		runPass();
		out.redrawMs = now - lastKeyAt;
	}
	return out;
}

/**
 * THE BUILD THIS ONE REPLACES, modelled the same way: one 150ms trailing debounce in front of
 * the whole content pass, no parse gate, no cost record, no classification.
 *
 * It exists because the interesting relations are DIFFERENTIAL. "The costly arm renders once
 * per burst" is not a property of the policy at all — it is a property of typing FASTER than
 * the debounce, and at a 200ms cadence both builds render on every keystroke. An early ledger
 * measured only a 120ms cadence, where the debounce hides that, and concluded from that one
 * cell that nothing had regressed. Comparing against this arm asks the question that actually
 * matters — is the new build ever worse than the old one — instead of a constant that happens
 * to hold in the cell someone chose.
 */
function runBurstMain({ keystrokes, gapMs, renderMs, parses = true }) {
	let now = 0;
	let timerAt = null;
	const out = { renders: 0, parses: 0, busyMs: 0, redrawMs: null };
	const runPass = () => {
		out.renders++;
		out.busyMs += renderMs;
		now += renderMs;
	};
	for (let k = 0; k < keystrokes; k++) {
		if (timerAt !== null && timerAt <= now + gapMs) {
			now = timerAt;
			timerAt = null;
			runPass();
		}
		now = Math.max(now, k * gapMs);
		timerAt = now + DEBOUNCE_MS;
	}
	if (timerAt !== null) {
		const lastKeyAt = now;
		now = timerAt;
		runPass();
		out.redrawMs = now - lastKeyAt;
	}
	// `parses` is accepted and deliberately ignored: the old build has no gate, so it draws
	// whatever it is given and lets it fail, painting raw source where the new build holds the
	// picture. Taking the parameter keeps the two arms callable with one options object, and
	// naming the asymmetry here is the point — it is the trade the gate exists to make.
	void parses;
	return out;
}

/** The measured size table from engineering/mermaid.md, as (label, renderMs) pairs. */
const SIZES = [
	['4 nodes', 22],
	['8 nodes', 26],
	['16 nodes', 43],
	['32 nodes', 72],
	['64 nodes', 130],
	['128 nodes', 239],
];

/** Cadences that bracket the floor: faster than it, near it, slower than it. */
const CADENCES = [80, 120, 200, 350];

module.exports = { liftPolicy, runBurst, runBurstMain, SIZES, CADENCES, COALESCE_MS, DEBOUNCE_MS };
