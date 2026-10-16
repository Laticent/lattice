/**
 * `mixed-spelling` — one spelling per deck (Segno decision 7,
 * engineering/decisions/2026-09-28-segno-unified-inline-notation.md). Fixture:
 * test/fixtures/mixed-spelling.md (an icon written `database` and `db`; a waterfall closing on
 * `total` and `sum`).
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const lintCore = require('../../../lib/authoring/lint-core.js');
const { markerOf, markerSpelling } = require('../../../lib/core/waterfall-markers');

const deck = (body, fm = '') => `---\nmarp: true\n${fm}---\n\n${body}\n`;
const mixed = (src) => lintCore.findMixedSpellings(src);
const FIXTURE = fs.readFileSync(path.join(__dirname, '../../fixtures/mixed-spelling.md'), 'utf8');

describe('mixed-spelling', () => {
  test('the fixture: the minority icon alias and the minority waterfall marker', () => {
    const found = mixed(FIXTURE);
    assert.deepEqual(found.map((f) => [f.slide, f.span, f.didYouMean]), [[2, '`^{db, lg}`', 'database'], [3, '`sum`', 'total']]);
    assert.ok(found.every((f) => f.rule === 'mixed-spelling' && f.severity === 'warning' && f.autofixable));
    assert.match(found[0].message, /"database" is written "database" 2 time\(s\) elsewhere and "db" here/);
  });

  test('--fix rewrites the minority spans to the house form, and nothing else', () => {
    const { buildVocab } = require('../../../lib/authoring/lint.js');
    const { loadAll } = require('../../../lib/components');
    const fixed = lintCore.applyAllFixes(FIXTURE, buildVocab(loadAll(path.join(__dirname, '../../../lib/components'))));
    assert.equal(mixed(fixed).length, 0);
    assert.match(fixed, /`\^\{database, lg\}` for the archive/);
    assert.match(fixed, /- Q3 margin `12\.9` `total`/);
    assert.equal(fixed.split('\n').length, FIXTURE.split('\n').length);
    const changed = FIXTURE.split('\n').filter((l, i) => l !== fixed.split('\n')[i]);
    assert.equal(changed.length, 2);
  });

  test('a tie goes to the spelling written first', () => {
    const [f] = mixed(deck('- `^{db}` then `^{database}`'));
    assert.equal(f.span, '`^{database}`');
    assert.equal(f.didYouMean, 'db');
  });

  test('one spelling, any number of times, is fine; slots never compete', () => {
    assert.deepEqual(mixed(deck('- `^{db}` `^{db, c3}` `^{db, lg}`')), []);
    // `total` on a waterfall and an icon's `db` share no slot.
    assert.deepEqual(mixed(deck('<!-- _class: waterfall -->\n\n## W\n\n- A `1` `total`\n- B `+1`\n- C `2` `total`\n\n---\n\n- `^{db}`')), []);
  });

  test('a marker word is a marker only on a waterfall slide', () => {
    const src = deck('## Notes\n\n- `total` and `sum` are SQL here\n\n---\n\n<!-- _class: waterfall -->\n\n## W\n\n- A `1` `total`\n- B `+1`\n- C `2` `total`');
    assert.deepEqual(mixed(src), []);
  });

  test('a deck that turns the grammar off has no spellings to compare', () => {
    assert.deepEqual(mixed(deck('- `^{db}` `^{database}` `^{database}`', 'inline-code: literal\n')), []);
  });

  test('the waterfall kernel reads a marker as the chart does', () => {
    assert.equal(markerOf(' Sum '), 'total');
    assert.equal(markerOf('delta'), 'step');
    assert.equal(markerOf('+1.4'), '');
    assert.deepEqual(markerSpelling(' Sum'), { param: 'marker', canonical: 'total', written: 'sum', from: 1, to: 4, shortcut: false });
    assert.equal(markerSpelling('12.0'), null);
  });

  test('a pill\'s icon= alias competes with the inline icon\'s name', () => {
    const [f] = mixed(deck('- `^{database}` `^{database}` `{Orders, icon=db}`'));
    assert.equal(f.span, '`{Orders, icon=db}`');
    assert.equal(f.replace.to, '`{Orders, icon=database}`');
  });

  test('only a waterfall row\'s trailing pill is a marker, on any slide whose classes include waterfall', () => {
    const src = deck('<!-- _class: invert waterfall -->\n\n## W\n\nThe `delta` column is in `step` units.\n\n- A `1` `total`\n- B `+1` `step`\n- C `2` `total`\n- D `3` `sum`');
    const found = mixed(src);
    assert.deepEqual(found.map((f) => f.span), ['`sum`'], 'the prose `delta` is the author\'s word, not a marker');
  });

  // Each of these once made --fix edit the wrong text or stop (HARD RULE #25 checker).
  const vocab = () => {
    const { buildVocab } = require('../../../lib/authoring/lint.js');
    const { loadAll } = require('../../../lib/components');
    return buildVocab(loadAll(path.join(__dirname, '../../../lib/components')));
  };
  test('--fix leaves a fenced example of the same line alone', () => {
    const src = deck('- `^{database}` one\n- `^{database}` two\n\n---\n\n## B\n\n```md\n- `^{db}` store\n```\n\n- `^{db}` store');
    const fixed = lintCore.applyAllFixes(src, vocab());
    assert.match(fixed, /```md\n- `\^\{db\}` store\n```/, 'the quoted example keeps its text');
    assert.match(fixed, /```\n\n- `\^\{database\}` store/);
  });
  test('--fix reaches a span on a line with a hidden comment, and keeps going after it', () => {
    const src = deck('- `^{database}` a\n- `^{database}` b\n- `^{database}` c\n\n---\n\nUse <!-- note --> `^{db}` here.\n\n---\n\n- `^{db}` again');
    const fixed = lintCore.applyAllFixes(src, vocab());
    assert.match(fixed, /Use <!-- note --> `\^\{database\}` here\./);
    assert.match(fixed, /- `\^\{database\}` again/);
  });
});

