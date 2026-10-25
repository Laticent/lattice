'use strict';
// The status role bundle is written by hand in every component that draws a status disc
// (engineering/decisions/2026-10-24-status-is-one-system.md §3): each class mapping sets
// `--state-color`, `--state-ink`, `--state-signal` and `--state-glyph-mark` on one line. CSS has no shared
// selector vocabulary to own that mapping once (`.pass`, `.state-shipped`, `[data-s]` …), so this test owns
// it instead: every copy must be one of the four role sets below, word for word. A fifth set is a status
// that paints differently in one component, which is the drift the decision exists to end.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const FILES = [
  'lib/base/base.modifiers.css',
  'lib/components/inventory/checklist/checklist.styles.css',
  'lib/components/comparison/verdict-grid/verdict-grid.styles.css',
  'lib/components/legal/obligation-matrix/obligation-matrix.styles.css',
  'lib/components/chart/roadmap/roadmap.styles.css',
];

const ROLE_SETS = new Set([
  '--state-color:var(--state-pass-hue); --state-ink:var(--pass); --state-signal:transparent; --state-glyph-mark:var(--on-solid);',
  '--state-color:var(--state-warn-hue); --state-ink:var(--warn); --state-signal:var(--warn-solid-signal); --state-glyph-mark:var(--on-solid);',
  '--state-color:var(--state-fail-hue); --state-ink:var(--fail); --state-signal:var(--fail-solid-signal); --state-glyph-mark:var(--on-solid);',
  '--state-color:var(--muted-mark); --state-ink:var(--muted-mark); --state-signal:transparent; --state-glyph-mark:var(--bg);',
]);

// The four declarations, in order, as one run.
const BUNDLE = /--state-color\s*:[^;]*;\s*--state-ink\s*:[^;]*;\s*--state-signal\s*:[^;]*;\s*--state-glyph-mark\s*:[^;]*;/g;
const norm = (s) => s.replace(/\s*:\s*/g, ':').replace(/\s*;\s*/g, '; ').trim();

test('every status role bundle is one of the four role sets', () => {
  let seen = 0;
  const strays = [];
  for (const rel of FILES) {
    const css = fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(BUNDLE)) {
      seen++;
      const set = norm(m[0]);
      if (!ROLE_SETS.has(set)) strays.push(`${rel}: ${set}`);
    }
  }
  // 55 when this was written; a floor, so a refactor that stops matching cannot pass by finding none.
  assert.ok(seen >= 50, `expected the role bundles in ${FILES.length} files, found ${seen}`);
  assert.deepEqual(strays, [], 'a status role bundle outside the four role sets');
});

test('a role bundle declared without all four roles is caught as a partial copy', () => {
  // Each file that sets --state-color sets it only inside a full bundle.
  const partial = [];
  for (const rel of FILES) {
    const css = fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const all = (css.match(/--state-color\s*:/g) || []).length;
    const full = (css.match(BUNDLE) || []).length;
    if (all !== full) partial.push(`${rel}: ${all} --state-color, ${full} full bundles`);
  }
  assert.deepEqual(partial, []);
});
