// tools/lib/modifier-probe.js: the probe tops a sample up so each content surface is exercised.
// A chart's axis line is a lone code line above the heading too, but it is not an eyebrow.
const test = require('node:test');
const assert = require('node:assert/strict');
const { isEyebrowLine, exercised, splitSample } = require('../../../tools/lib/modifier-probe');

test('a chart axis line is not an eyebrow; prose in a code span is', () => {
  assert.equal(isEyebrowLine('`[{Timeline, 2026 Q1 .. 2026 Q4, today=Q3}]`'), false);
  assert.equal(isEyebrowLine('`[Wider reach, Deeper cognition]`'), false);
  assert.equal(isEyebrowLine('`Revenue · FY26`'), true);
  // The renderer keeps this as an eyebrow (it does not parse as a bracketed list), so the probe must too.
  assert.equal(isEyebrowLine('`[Draft] Q3 plan`'), true);
  assert.equal(isEyebrowLine('Plain text'), false);
});

test('a sample whose only line above the heading is an axis gets a real probe eyebrow', () => {
  const s = splitSample('<!-- _class: gantt -->\n\n`[{Timeline, Q1 .. Q4}]`\n\n## Heading.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n', 'gantt');
  const out = exercised(s);
  assert.ok(out, 'the sample is topped up');
  assert.match(out.body, /`\[\{Timeline, Q1 \.\. Q4\}\]`\n\n`PROBE · EYEBROW`\n\n## Heading\./);
});

test('a sample with an eyebrow, a heading and a table is left alone', () => {
  const s = splitSample('<!-- _class: content -->\n\n`Revenue · FY26`\n\n## Heading.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n', 'content');
  assert.equal(exercised(s), null);
});
