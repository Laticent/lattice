// The front-matter rules the deck-settings table drives (lib/core/deck-settings.js): an unknown
// key, an unknown value for a table-driven key, and the treatment rules (lib/base/treatments.js).
// Each probe from engineering/decisions/2026-10-15-conformance-harness.md §3.2 warns, and its
// near-twin with the typo fixed lints clean of the same rule.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { lintText, buildVocab } = require('../../../lib/authoring/lint');
const { DECK_SETTINGS, withPluginRegisters } = require('../../../lib/core/deck-settings');

const vocab = buildVocab();
const deck = (fm, cls = '') => `---\n${fm}\n---\n\n${cls ? `<!-- _class: ${cls} -->\n\n` : ''}## A\n\nText.\n`;
const rules = (src) => lintText(src, { vocab }).map((f) => `${f.rule} ${f.classToken}`);

describe('the six probes warn, and their twins do not', () => {
  const cases = [
    ['finsh: halo', 'finish: halo', 'unknown-key finsh'],
    ['themee: cuoio', 'theme: cuoio', 'unknown-key themee'],
    ['size: huge', 'size: square', 'unknown-size huge'],
    ['theme: nosuchtheme', 'theme: cuoio', 'unknown-theme nosuchtheme'],
  ];
  for (const [bad, good, want] of cases) {
    test(bad, () => {
      assert.ok(rules(deck(bad)).includes(want), `${bad} → ${want}`);
      assert.ok(!rules(deck(good)).some((r) => r.startsWith(want.split(' ')[0])), `${good} is clean`);
    });
  }
  test('tint-bogus', () => {
    assert.ok(rules(deck('theme: indaco', 'tint-bogus')).includes('unknown-treatment tint-bogus'));
    assert.ok(!rules(deck('theme: indaco', 'tint-sweep')).some((r) => r.startsWith('unknown-treatment')));
  });
  test('bare tint-corner', () => {
    assert.ok(rules(deck('theme: indaco', 'tint-corner')).includes('treatment-placement tint-corner'));
    for (const p of ['at-tl', 'top-left', 'tint-at-tl']) assert.ok(!rules(deck('theme: indaco', `tint-corner ${p}`)).some((r) => r.startsWith('treatment-placement')), p);
    assert.ok(rules(deck('theme: indaco', 'tint-corner at-top')).includes('treatment-placement tint-corner'), 'an edge placement on a corner tint paints nothing');
  });
});

describe('unknown-key reads only what is a key', () => {
  test('every row of the table, and every plugin register, is a key', () => {
    const fm = withPluginRegisters(vocab.pluginRegisters).map((r) => `${r.key}: x`).join('\n');
    assert.deepEqual(rules(deck(fm)).filter((r) => r.startsWith('unknown-key')), []);
  });
  test('a nested map entry and a block-scalar body are not keys', () => {
    const fm = 'lexicon:\n  finsh: finish\nstyle: |\n  themee: red;\n  color: blue;';
    assert.deepEqual(rules(deck(fm)).filter((r) => r.startsWith('unknown-key')), []);
  });
  test('a Marp deck\'s own keys are accepted', () => {
    assert.deepEqual(rules(deck('marp: true\nheadingDivider: 2\nauthor: Ada')).filter((r) => r.startsWith('unknown-key')), []);
  });
  test('the suggestion names the key and replaces only the key', () => {
    const f = lintText(deck('finsh: halo'), { vocab }).find((x) => x.rule === 'unknown-key');
    assert.equal(f.didYouMean, 'finish');
    assert.deepEqual(f.replace, { from: 'finsh', to: 'finish' });
  });
});

describe('table-driven values', () => {
  test('size: is case-sensitive, like its reader', () => {
    assert.ok(rules(deck('size: Square')).includes('unknown-size Square'));
    assert.ok(!rules(deck('size: 4K')).some((r) => r.startsWith('unknown-size')));
  });
  test('every generic row has a value list, and a wrong value warns with its own rule', () => {
    for (const row of DECK_SETTINGS.filter((r) => r.generic)) {
      assert.ok(rules(deck(`${row.key}: zzbogus`)).includes(`unknown-${row.key} zzbogus`), row.key);
    }
  });
});
