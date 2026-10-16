// lib/base/treatments.js is the linter's copy of the treatment vocabulary; base.treatments.css
// is what paints. Held equal both ways, so a treatment added to the CSS without the table (the
// linter would call it unknown) or to the table without the CSS (the linter would bless a word
// that paints nothing) fails here.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { TINTS, MARKS, PLACEMENT_REQUIRED } = require('../../../lib/base/treatments');

const css = fs.readFileSync(path.join(__dirname, '../../../lib/base/base.treatments.css'), 'utf8');
const painted = (prefix) => [...new Set([...css.matchAll(new RegExp(`section\\.(${prefix}-[a-z]+)\\b(?![a-z-])`, 'g'))].map((m) => m[1]))].filter((t) => !/^tint-at-/.test(t)).sort();

test('every tint the CSS paints is in TINTS, and nothing else is', () => {
  assert.deepEqual([...TINTS].sort(), painted('tint'));
});

test('every mark the CSS paints is in MARKS, and nothing else is', () => {
  assert.deepEqual([...MARKS].sort(), painted('mark'));
});

test('every placement PLACEMENT_REQUIRED accepts has a rule in the CSS, in all three spellings', () => {
  const missing = [];
  for (const [tint, placements] of Object.entries(PLACEMENT_REQUIRED)) {
    for (const spellings of placements) for (const w of spellings) if (!css.includes(`section.${tint}.${w}`)) missing.push(`${tint}.${w}`);
  }
  assert.deepEqual(missing, []);
});
