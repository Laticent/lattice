const test = require('node:test');
const assert = require('node:assert/strict');
const CN = require('../../../lib/core/chart-narration.js');
const { slideToSpeech } = require('../../../lib/core/slide-speech.js');

// NO NARRATOR SPEAKS A SPEAKER NOTE — every one of them, by enumeration.
//
// The narration LADDER has no note rung. That is not the same claim as "no note is ever
// spoken", and the difference is what shipped a leak: `speakLeftover` hands a chart
// narrator's un-consumed lines to the flattener at projection precedence, straight from
// the raw source, and the flattener recognized a comment by testing whether a LINE BEGAN
// with `<!--`. A speaker note is a multi-line comment — the Studio's own editor writes
// them that way — so every continuation line was ordinary prose to it.
//
// Fixed in `blankHtmlComments`, which is upstream of all of them. This file is the proof
// that "upstream of all of them" is true rather than assumed: the adversarial review that
// found the bug confirmed five narrators by hand and said plainly it had not checked
// narrateSequence, narratePie, narrateClass, narrateState or narrateEr. Hand-checking a
// subset is exactly how the first pass missed this.
//
// So this ENUMERATES `module.exports` rather than listing narrators. A narrator added
// later is covered the day it lands: if it has no fixture here the roster cell fails and
// asks for one, and if it leaks its own cell fails. That is the difference between a test
// that pins today's answer and one that keeps asking the question.
// (2026-08-24-stage-console-split.md §10.)

const TOKEN = 'PRIVATELEAKTOKEN';
const NOTE = `<!-- note:\n${TOKEN} churn is forty percent and legal has not cleared it\n-->`;
const F = String.fromCharCode(96, 96, 96); // backticks, kept out of the literal (the fence trap)

/** A slide body per narrator, minimal but real enough that the narrator engages — paired
 *  with the slide CLASS it needs, because several narrators key on it and a wrong class
 *  makes the cell vacuous rather than failing (which the roster guard below catches). */
const FIXTURES = {
	narrateFunnel: ['funnel', '- Visitors `1000`\n- Signups `500`\n- Paid `100`'],
	// These five come from the shapes `chart-narration.test.js` already proves engage each
	// narrator, rather than from guesswork — a guessed body that fails to engage makes the
	// cell vacuous, which is the exact defect this file exists to prevent.
	narrateJourneyWeighted: ['journey weighted', '- Discover\n  - Search `@prospect` `:4` `+45`\n  - Referral `@prospect` `:5` `+18`\n- Convert\n  - Pricing page `@prospect` `:3` `+12`'],
	narrateRadar: ['radar', '- Lattice\n  - Performance `9`\n  - Pricing `7`\n- Rival North\n  - Performance `7`\n  - Pricing `8`'],
	narrateQuadrant: ['quadrant', '`Effort 0–10`\n\n- Group\n  - Item `5, 85`'],
	// No `end` marker on the last state ON PURPOSE: with both start AND end explicit the
	// inference narrator correctly returns null, and the cell would certify nothing.
	narrateStateChartInference: ['state-chart', '1. Draft `start`\n   - `submit => 2`\n2. Submitted `on-track`\n   - `review => 3`\n3. In Review\n   - `approve => 4`\n4. Approved `done`'],
	narrateStateChart: ['state-chart', '1. Draft `start`\n   - `submit => 2`\n2. Submitted `on-track`\n   - `review => 3`\n3. In Review\n   - `approve => 4`\n4. Approved `done`'],
	narrateSequence: ['diagram', `${F}mermaid\nsequenceDiagram\n  Alice->>Bob: Hello\n  Bob-->>Alice: Hi\n${F}`],
	narratePie: ['diagram', `${F}mermaid\npie title Share\n  "A" : 60\n  "B" : 40\n${F}`],
	narrateClass: ['diagram', `${F}mermaid\nclassDiagram\n  class Order\n  Order : +id\n  Order --> Item\n${F}`],
	narrateState: ['diagram', `${F}mermaid\nstateDiagram-v2\n  [*] --> Idle\n  Idle --> Busy\n${F}`],
	narrateEr: ['diagram', `${F}mermaid\nerDiagram\n  CUSTOMER ||--o{ ORDER : places\n${F}`],
	narrateC4: ['diagram', `${F}mermaid\nC4Context\n  Person(u, "User")\n${F}`],
	narrateRadarBeta: ['diagram', `${F}mermaid\nradar-beta\n  axis a, b\n  curve x{1,2}\n${F}`],
	narrateXychart: ['diagram', `${F}mermaid\nxychart-beta\n  title "Rev"\n  x-axis [a, b]\n  bar [3, 5]\n${F}`],
	narrateDiagram: ['diagram', `${F}mermaid\nflowchart LR\n  A["One"] --> B["Two"]\n${F}`],
};

const NARRATORS = Object.keys(CN).filter((k) => k.startsWith('narrate') && k !== 'narrateChart');

const slideFor = ([cls, body]) => `<!-- _class: ${cls} -->\n\n# Title\n\n${NOTE}\n\n${body}\n\nTail copy here.`;

test('every exported narrator has a fixture here — a new one cannot join unchecked', () => {
	const missing = NARRATORS.filter((n) => !FIXTURES[n]);
	assert.deepEqual(missing, [], `add a fixture for: ${missing.join(', ')} — so its note-leak behavior is pinned like the rest`);
});

for (const name of NARRATORS) {
	test(`${name} does not speak a multi-line speaker note`, () => {
		const slide = slideFor(FIXTURES[name]);
		// Directly, and through the real dispatcher — a narrator can be reachable one way
		// and not the other, and both are shipped paths.
		const direct = CN[name](slide);
		const viaChart = CN.narrateChart(slide);
		// The fixture must actually ENGAGE something, or this cell proves nothing: a narrator
		// that returns null for an input it does not recognize trivially "does not leak".
		assert.ok(direct || viaChart, `${name}: the fixture did not engage any narrator — the cell would be vacuous`);
		for (const [where, out] of [['direct', direct], ['narrateChart', viaChart]]) {
			if (out) assert.equal(String(out).includes(TOKEN), false, `${name} (${where}) spoke the note`);
		}
	});
}

test('and the base flattener does not either, on the same slides', () => {
	for (const name of NARRATORS) {
		const out = slideToSpeech(slideFor(FIXTURES[name]));
		assert.equal(out.includes(TOKEN), false, `slideToSpeech leaked on the ${name} fixture`);
		assert.ok(out.includes('Tail copy here'), 'and it still reads the slide it was given');
	}
});
