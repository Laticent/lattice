/**
 * `pill-literal` on a span with two problems, or a reserved-marker label
 * (followups.d/2533-p3-pill-literal-two-problems.md, closed by this file): `{A|B, icon=nope}` got
 * no warning because the slot refused the label before reading the icon, and `{x, icon=code}` got
 * none because `x` is a reserved state marker that no rule explained.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const lintCore = require('../../../lib/authoring/lint-core.js');
const pills = require('../../../lib/core/inline-pills.js');

const deck = (body, fm = '') => `---\nmarp: true\n${fm}---\n\n${body}\n`;

describe('`pill-literal` on a span with two problems, or a reserved-marker label (followups.d/2533-p3)', () => {
  const findings = (src) => lintCore.findLiteralPills(src);
  const review = require('../../../lib/authoring/review-core.js');
  const checkbox = (src) => review.reviewText(src).filter((f) => f.rule === 'pill-not-a-checkbox');

  test('a reserved label AND an unknown icon: one warning naming both fixes', () => {
    const f = findings(deck('A `{A|B, icon=nope}` here.'));
    assert.equal(f.length, 1);
    assert.match(f[0].message, /Quote the label \(`\{"A\|B", icon=nope\}`\) and name an icon the set has: "nope" is not an icon/);
    assert.match(f[0].fix, /Quote the label and use one of the icon names/);
  });

  test('a state marker as the label of a pill with options warns, once, with the way out', () => {
    const icon = findings(deck('A `{x, icon=code}` here.'));
    assert.equal(icon.length, 1);
    assert.match(icon[0].message, /`x` is reserved for a state mark/);
    assert.match(icon[0].fix, /icon-only pill \(`\{icon=code\}`\)/);
    const color = findings(deck('A `{-, c2}` here.'));
    assert.equal(color.length, 1);
    assert.match(color[0].fix, /pick a label that is not a state marker\. For a mark, write `\[-\]`/);
    const both = findings(deck('A `{x, icon=nope}` here.'));
    assert.equal(both.length, 1);
    assert.match(both[0].fix, /an icon the set has \("nope" is not an icon/);
  });

  test('the bare `{x}` stays review-core\'s suggestion, and the option forms leave it', () => {
    assert.deepEqual(findings(deck('A `{x}` here.')), []);
    assert.equal(checkbox(deck('A `{x}` here.')).length, 1);
    assert.equal(checkbox(deck('A `{x, icon=code}` and `{x, c2}` here.')).length, 0);
  });

  test('the escape the advice offers silences it, and the suggested pill renders', () => {
    assert.deepEqual(findings(deck('A `\\{x, icon=code}` here.')), []);
    assert.ok(pills.resolve('{icon=code}'), 'the icon-only pill the fix names draws');
    assert.equal(pills.reservedLabel('{X, icon=code}'), null, 'a label that is not a marker is not flagged');
    assert.equal(pills.reservedLabel('{x}'), null, 'no options: the checkbox suggestion owns it');
  });
});

describe('`pill-literal` reserved-label advice — the checker\'s cases', () => {
  const findings = (src) => lintCore.findLiteralPills(src);
  test('options first: an unknown icon is never offered as the icon-only pill', () => {
    const f = findings(deck('A `{icon=nope, x}` here.'));
    assert.equal(f.length, 1);
    assert.doesNotMatch(f[0].fix, /icon-only pill/);
    assert.match(f[0].fix, /an icon the set has \("nope" is not an icon/);
  });

  test('the icon-only advice keeps the span\'s other words, and renders', () => {
    const f = findings(deck('A `{x, icon=code, c2}` here.'));
    assert.match(f[0].fix, /`\{icon=code, c2\}`/);
    assert.ok(pills.resolve('{icon=code, c2}'));
  });

  test('a quoted marker with no options renders as code, and now says so', () => {
    const f = findings(deck('A `{"x"}` here.'));
    assert.equal(f.length, 1);
    assert.match(f[0].message, /`x` is reserved for a state mark/);
  });
});
