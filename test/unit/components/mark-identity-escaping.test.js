/**
 * A mark identity is an ATTRIBUTE, so an author's quote must not end it.
 *
 * The chart-accessibility pass stamped `data-label` on line series and dots, journey stages and
 * steps, and roadmap `horizons` heads and bets. Its first cut escaped those with `escHtml`, which
 * leaves `"` alone — a label like `A "x"` closed the attribute early and the rest of the name
 * became markup (CodeQL js/incomplete-html-attribute-sanitization on PR #2356). Journey's parsed
 * labels also still carry their entities, so a naive escape doubled them (`&amp;amp;`).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const engine = require('../../../lib/engine');

// A bare `>` is text in markdown; `<y>` would be an inline HTML tag the slide never shows.
const HOSTILE = 'Q "x" & y > z';
const render = (body) => new JSDOM(engine.render(`---\nmarp: true\n---\n\n${body}`, 'indaco', { preview: true }).html).window.document;

test('line: a series name with a quote is one attribute, read back verbatim', () => {
	const d = render(`<!-- _class: line -->\n\n## L.\n\n- Q1\n  - A "x" & y \`4\`\n- Q2\n  - A "x" & y \`5\``);
	const labels = [...d.querySelectorAll('.line-path[data-label]')].map((e) => e.getAttribute('data-label'));
	assert.deepEqual(labels, ['A "x" & y']);
	// Had the quote closed the attribute, `x"` would have leaked in as an attribute of its own.
	assert.equal(d.querySelectorAll('.line-path').length, [...d.querySelectorAll('.line-path')].filter((e) => !e.hasAttribute('x"')).length);
	for (const dot of d.querySelectorAll('.line-dot')) assert.match(dot.getAttribute('data-value'), /^[45]$/);
});

test('journey: stage and step labels decode once and escape once', () => {
	const d = render(`<!-- _class: journey -->\n\n## J.\n\n- S & "q"\n  - T & "q" \`@a\` \`:3\``);
	assert.equal(d.querySelector('.journey-stage').getAttribute('data-label'), 'S & "q"');
	assert.equal(d.querySelector('.journey-task').getAttribute('data-label'), 'T & "q"');
});

test('roadmap horizons: a bet with a quote, an ampersand and a bracket stays text', () => {
	const d = render(`<!-- _class: roadmap horizons -->\n\n## R.\n\n| W | H1 \`Now\` |\n| --- | --- |\n| A | [x] ${HOSTILE} |`);
	const li = d.querySelector('.horizon-rows li[data-label]');
	assert.equal(li.getAttribute('data-label'), HOSTILE);
});
