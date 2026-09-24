/**
 * The four FLOW chart narrators — progress, timeline-list, kanban, gantt.
 *
 * Before these existed, all four narrated their heading and nothing else in the real export
 * (`--captions`) and in live Present: three render only `<div>`s, which the caption walker does
 * not read, and gantt renders an SVG it skips on purpose. The contract test
 * (test/unit/components/chart-a11y-contract.test.js) holds every gallery slide's narration to
 * the marks the transform draws; this file pins what each narrator SAYS about the tokens its
 * transform reads, one behavior per test.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const {
	narrateChart, narrateProgress, narrateTimelineList, narrateKanban, narrateGantt,
} = require('../../../lib/core/chart-narration.js');
const { spokenStatus, chartStatus } = require('../../../lib/core/chart-status.js');
const { chartStatus: kernelStatus, CHART_STATUS } = require('../../../lib/components/chart/_chart-family/transform-utils.js');

const slide = (cls, body) => `<!-- _class: ${cls} -->\n\n${body}`;

test('chart-status: the kernels and the narrators share one vocabulary', () => {
	assert.equal(kernelStatus, chartStatus, 'transform-utils re-exports the lib/core fold, not a copy');
	for (const w of CHART_STATUS) assert.ok(spokenStatus(w), `${w} has a spoken form`);
	assert.equal(spokenStatus('AT-RISK'), 'at risk', 'case folds before it is said');
	assert.equal(spokenStatus('warn'), 'warning');
	assert.equal(spokenStatus('shipping'), 'shipping', "a word outside the ten is the author's, said as typed");
});

test('progress: label, percent by value, and the status in words', () => {
	const out = narrateProgress(slide('progress', '## Readiness.\n\n- Signal Intake `92%` `on-track`\n- Adoption `12%` `AT-RISK`'));
	assert.ok(out.includes('Signal Intake, ninety-two percent, on track.'), out);
	assert.ok(out.includes('Adoption, twelve percent, at risk.'), out);
});

test('progress: the subtitle keeps its place, before the bars', () => {
	const out = narrateProgress(slide('progress', '## Readiness.\n\nSnapshot at noon.\n\n- A `50%`\n- B `60%`'));
	assert.ok(out.indexOf('Snapshot at noon.') < out.indexOf('A, fifty percent'), out);
});

test('progress: a row note is said right after its row', () => {
	const out = narrateProgress(slide('progress', '## R.\n\n- A `50%` `blocked`\n  - Waiting on legal\n- B `60%`'));
	assert.ok(/A, fifty percent, blocked\. Waiting on legal\. B, sixty percent/.test(out), out);
});

test('timeline-list: the date leads, the status is said, the body follows', () => {
	const out = narrateTimelineList(slide('timeline-list', '## Launch.\n\n1. `2025 Q1` Framework approved `decision`\n   - The board signed off.\n2. `2025 Q3` Pilot live `live`'));
	assert.ok(out.includes('2025 Q1: Framework approved, a decision point. The board signed off.'), out);
	assert.ok(out.includes('2025 Q3: Pilot live, live.'), out);
});

test('kanban: a count per column, a size in words, the lane and its status', () => {
	const out = narrateKanban(slide('kanban', '## Board.\n\n- Backlog\n  - First card `S`\n    - team-a\n  - Second card `XL`\n    - team-b `at-risk`\n- Review\n- Done\n  - Shipped `M`'));
	assert.ok(out.includes('Backlog, two cards.'), out);
	assert.ok(out.includes('First card, size small, team-a.'), out);
	assert.ok(out.includes('Second card, size extra large, team-b, at risk.'), out);
	assert.ok(out.includes('Review, no cards.'), out);
	assert.ok(out.includes('Done, one card. Shipped, size medium.'), out);
});

test('kanban: a code that is not a size stays in the title, as it does on the card', () => {
	const out = narrateKanban(slide('kanban', '## Board.\n\n- Doing\n  - Migrate `v2`\n- Done\n  - Ship `S`'));
	assert.ok(out.includes('Migrate v2.'), out);
});

test('gantt: the window and today, then lanes and tasks, spans said "to"', () => {
	const out = narrateGantt(slide('gantt', '`2026 Q1 .. 2026 Q4` `today Q3`\n\n## Plan.\n\n- Framework\n  - Taxonomy `Q1..Q2` `done`\n  - Scoring `Q2..Q3` `live` `after: Taxonomy`'));
	assert.ok(out.startsWith('The plan runs from 2026 Q1 to 2026 Q4, and today is Q3.'), out);
	assert.ok(out.includes('Framework, two tasks. Taxonomy, Q1 to Q2, done. Scoring, Q2 to Q3, live, after Taxonomy.'), out);
});

test('gantt: every single point is a milestone, as the transform draws a diamond for it', () => {
	const out = narrateGantt(slide('gantt', '## Plan.\n\n- Ship\n  - GA `Q4` `done`\n  - Beta `Q2..Q3` `milestone`'));
	assert.ok(out.includes('GA, a milestone at Q4, done.'), out);
	assert.ok(out.includes('Beta, a milestone over Q2 to Q3.'), out);
});

test('gantt: the bracketed axis reads like the pill eyebrow', () => {
	const out = narrateGantt(slide('gantt', '`[{Timeline, 2026 Q1..2026 Q4, Q3}]`\n\n## Plan.\n\n- A\n  - T `Q1..Q2`'));
	assert.ok(out.startsWith('The plan runs from 2026 Q1 to 2026 Q4, and today is Q3.'), out);
});

test('gantt: a task with no span says so rather than inventing a date', () => {
	const out = narrateGantt(slide('gantt', '## Plan.\n\n- A\n  - Unscheduled `done`\n  - T `Q1..Q2`'));
	assert.ok(out.includes('Unscheduled, not yet scheduled, done.'), out);
});

test('gantt: a detail bullet is said after its task', () => {
	const out = narrateGantt(slide('gantt', '## Plan.\n\n- A\n  - T `Q1..Q2`\n    - Owner: Ada.\n  - U `Q3`'));
	assert.ok(/T, Q1 to Q2\. Owner: Ada\. U, a milestone at Q3\./.test(out), out);
});

test('each flow narrator is reached through narrateChart, and claims only its own class', () => {
	for (const [cls, body] of [
		['progress', '- A `50%`'], ['timeline-list', '1. `Q1` A'], ['kanban', '- Doing\n  - A `S`'], ['gantt', '- L\n  - A `Q1..Q2`'],
	]) {
		assert.ok(narrateChart(slide(cls, `## H.\n\n${body}`)), `${cls} is narrated`);
		assert.equal(narrateChart(slide(`list ${cls}`, `## H.\n\n${body}`)), null, `\`list ${cls}\` is a list, not a ${cls}`);
	}
});

// ── Found by the independent checker, each a case the chart and the voice disagreed on ──

test('gantt: points parse through the transform`s own parser (2026Q2 yes; 2026-03 and Sept no)', () => {
	const out = narrateGantt(slide('gantt', '## P.\n\n- Lane\n  - Alpha `2026Q2`\n  - Beta `2026-03`\n  - Gamma `Sept`\n  - Delta `Q1..Qx`'));
	assert.ok(out.includes('Alpha, a milestone at 2026Q2.'), out);
	for (const t of ['Beta', 'Gamma', 'Delta']) assert.ok(out.includes(`${t}, not yet scheduled.`), `${t}: ${out}`);
});

test('progress: every nested bullet is said, as the transform now paints every one', () => {
	const out = narrateProgress(slide('progress', '## P.\n\n- Alpha `50%`\n  - note one\n  - note two\n- Beta `20%`'));
	assert.ok(/Alpha, fifty percent\. note one\. note two\. Beta/.test(out), out);
});

test('a second list — a new marker — is not read as more bars', () => {
	const out = narrateProgress(slide('progress', '## P.\n\n- Alpha `50%`\n\n* Star list `30%`'));
	assert.ok(!out.includes('Star list, thirty percent'), out);
});

test('a list ABOVE the heading is not the chart`s', () => {
	assert.equal(narrateProgress(slide('progress', '- Above `10%`\n\n## P.\n\nNo list here.')), null);
});

test('radar quadrant: a later series is said on the FIRST series` axes, as parseRadar plots it', () => {
	const out = narrateChart(slide('radar quadrant', '## R.\n\n- Us\n  - People\n    - Hiring `4`\n    - Retention `3`\n- Them\n  - Staff\n    - retention `5`\n    - Hiring `2`'));
	assert.ok(out.includes('Them. People: Hiring, two; Retention, five.'), out);
});
