// lib/base/base.manifest.json — the one declaration of the modifier groups and the registers.
// Each check runs both ways (D2 of engineering/decisions/2026-11-19-deterministic-authoring-audit.md):
// what the engine accepts is in the manifest, and what the manifest names exists in the engine.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const BASE = require('../../../lib/base/base.manifest.json');
const { modifierGroups } = require('../../../lib/base/base-manifest.js');
const { MODIFIER_GROUPS, UNIVERSAL_MODIFIER_TOKENS } = require('../../../lib/components');
const { DECK_SETTINGS } = require('../../../lib/core/deck-settings');
const { SWITCH_TOKENS } = require('../../../lib/core/switches');
const { MODE_TOKENS } = require('../../../lib/core/resolve-mode');
const { TINTS, MARKS, TINT_PLACEMENTS, PLACEMENT_REQUIRED } = require('../../../lib/base/treatments');

const accepted = new Set(UNIVERSAL_MODIFIER_TOKENS);
const groupNames = new Set(MODIFIER_GROUPS.map((g) => g.name));

describe('every word the engine accepts on any slide is in a group', () => {
  // The audit found 34 such words outside the registry: 3 modes, 7 switches, 16 treatments and
  // 8 `tint-at-*` placements. Each list is read from the module that owns it, so a new word there
  // with no group fails here.
  const owners = {
    'switches (lib/core/switches.mjs)': SWITCH_TOKENS,
    'modes (lib/core/resolve-mode.js)': MODE_TOKENS,
    'tints (lib/base/treatments.js)': TINTS,
    'marks (lib/base/treatments.js)': MARKS,
    'tint placements (lib/base/treatments.js)': TINT_PLACEMENTS,
    'bare placements (lib/base/treatments.js)': Object.values(PLACEMENT_REQUIRED).flat().map((p) => p[1]),
  };
  for (const [owner, words] of Object.entries(owners)) {
    test(owner, () => {
      const missing = words.filter((w) => !accepted.has(w));
      assert.deepEqual(missing, [], `${owner}: in no group of lib/base/base.manifest.json`);
    });
  }
});

describe('the groups', () => {
  test('a word is in one group only', () => {
    const seen = new Map();
    for (const g of MODIFIER_GROUPS) {
      for (const t of g.tokens) {
        assert.ok(!seen.has(t), `'${t}' is in both '${seen.get(t)}' and '${g.name}'`);
        seen.set(t, g.name);
      }
    }
  });
  test('an unknown source is refused, not read as empty', () => {
    const bad = { groups: [{ name: 'x', label: 'X', summary: 's', tokens: [{ source: 'nope' }] }] };
    assert.throws(() => modifierGroups(bad, { sources: {} }), /unknown source 'nope'/);
  });
});

describe('the registers', () => {
  const declared = BASE.registers.map((r) => r.key);
  const engine = DECK_SETTINGS.filter((r) => r.kind === 'register' || r.kind === 'axis').map((r) => r.key);
  test('every register and axis setting is declared, once', () => {
    assert.deepEqual([...declared].sort(), [...new Set(engine)].sort());
    assert.equal(new Set(declared).size, declared.length, 'a register is declared twice');
  });
  test('every group a register names exists', () => {
    for (const r of BASE.registers) for (const g of r.groups) assert.ok(groupNames.has(g), `register '${r.key}' names unknown group '${g}'`);
  });
});

describe('lint closes the open prefixes against the manifest', () => {
  const { lintText, buildVocab } = require('../../../lib/authoring/lint');
  const vocab = buildVocab();
  const unknown = (cls) => lintText(`---\ntheme: indaco\n---\n\n<!-- _class: content ${cls} -->\n\n## A\n\nText.\n`, { vocab })
    .filter((f) => f.rule === 'unknown-class').map((f) => f.classToken);
  // The audit's eight typo probes, each of which linted clean through an open prefix.
  for (const typo of ['no-heaer', 'with-anything', 'with-finsh', 'tone-blah', 'fill-xyz', 'checks-typo', 'treatment-foo', 'at-nowhere']) {
    test(`'${typo}' is an unknown class`, () => assert.deepEqual(unknown(typo), [typo]));
  }
  // …and the real words of the same families still lint clean.
  for (const word of ['no-header', 'with-finish', 'tone-pass', 'fill-optical', 'checks-tonal', 'at-tl', 'no-spine', 'tint-at-tl', 'top-left', 'sketch', 'finish-atrium']) {
    test(`'${word}' is known`, () => assert.deepEqual(unknown(word), []));
  }
});

describe('a variant is checked against its own component', () => {
  const { lintText, buildVocab } = require('../../../lib/authoring/lint');
  const vocab = buildVocab();
  const foreign = (cls) => lintText(`---\ntheme: indaco\n---\n\n<!-- _class: ${cls} -->\n\n## A\n\n1. 3\n   - x\n`, { vocab })
    .filter((f) => f.rule === 'foreign-variant').map((f) => f.classToken);
  // `gallery` is image's, scene's and video's; on kpi it rendered as plain kpi with no finding.
  test('another layout\'s variant warns', () => assert.deepEqual(foreign('kpi gallery'), ['gallery']));
  test('the component\'s own variant does not', () => assert.deepEqual(foreign('kpi spotlight'), []));
  test('a base word that a layout also lists does not', () => assert.deepEqual(foreign('content bleed'), []));
  test('a family modifier the layout opts into does not', () => assert.deepEqual(foreign('bar canvas'), []));
});
