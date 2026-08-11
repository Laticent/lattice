/**
 * Unit: the docs-portal artifacts survive the merge queue's three-way merge (#1594).
 *
 * WHY THIS EXISTS. `dist/docs/components.md`, `components.json` and `grammar.json`
 * are generated from EVERY component manifest, committed, and byte-gated by
 * `build:check`. That combination has a specific failure the merge queue turns
 * from an annoyance into a silent ejection:
 *
 *   two PRs each add a component → each regenerates the artifact → both write the
 *   SAME aggregate line (`"count": 62`) → git's three-way merge takes an identical
 *   change from both sides WITHOUT a conflict → the committed file lands one short
 *   → `build:check` rejects it inside the queue, on a `main` the PR never saw, and
 *   the ejection silently clears auto-merge.
 *
 * That is exactly what happened to the decision index in #1547, and these three
 * carried the same shape until #1594 removed their `count` / `N components` lines.
 *
 * This gate is the PROPERTY, not a list of banned field names. It builds the four
 * states the queue actually constructs, merges two of them, and asserts the result
 * equals a fresh regeneration. Any future aggregate — a total, a checksum, an index
 * size, whatever shape it takes — fails here without anyone having to predict it.
 * Reintroducing `count: components.length` fails all three arms.
 *
 * It runs entirely IN PROCESS, over a filtered copy of the real manifest array.
 * The first cut renamed two manifests on disk to simulate "before this PR", which
 * worked when run alone and broke five unrelated assertions under `npm test` —
 * `node --test` runs files concurrently, so a suite reading the catalog could
 * observe the tree mid-rename. A gate that corrupts the run it is part of is worse
 * than the defect it guards; the render functions are pure over their manifest
 * argument, so nothing has to move.
 */

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { loadAll } = require('../../../lib/components');
const {
  renderPortalMd, renderPortalJson, renderGrammarJson,
} = require('../../../tools/build-docs-portal.js');

// Two components in DIFFERENT buckets, so their entries insert at different
// positions and the merge comes out clean — the dangerous case. Two insertions at
// the SAME position conflict, which is loud and therefore already safe.
const X = 'big-number';
const Y = 'compare-code';

const RENDERERS = [
  ['dist/docs/components.md', renderPortalMd],
  ['dist/docs/components.json', renderPortalJson],
  ['dist/docs/grammar.json', renderGrammarJson],
];

describe('docs-portal artifacts survive a concurrent-PR three-way merge (#1594)', () => {
  let states, tmp;

  before(() => {
    const all = loadAll();
    const without = (...names) => all.filter((m) => !names.includes(m.name));
    // The four states the queue actually constructs. Components are REMOVED rather
    // than invented, so every byte compared comes from the real renderers over real
    // manifests.
    const sets = {
      base:  without(X, Y),   // main, before either PR
      a:     without(Y),      // main, after PR A merged
      b:     without(X),      // PR B's branch, generated before A landed
      fresh: all,             // what build:check regenerates in the queue
    };
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'latt-portal-race-'));
    states = RENDERERS.map(([label, render]) => {
      const out = Object.fromEntries(Object.entries(sets).map(([k, ms]) => [k, render(ms)]));
      const w = (n) => { const p = path.join(tmp, `${path.basename(label)}.${n}`); fs.writeFileSync(p, out[n]); return p; };
      // `git merge-file` exits non-zero with the conflict count; the merged text
      // (markers and all) still comes out on stdout, which is what we inspect.
      const merged = execFileSync('bash', ['-c',
        `git merge-file -p ${w('a')} ${w('base')} ${w('b')} 2>/dev/null || true`],
        { encoding: 'utf8', maxBuffer: 256 << 20 });
      return { label, merged, fresh: out.fresh, base: out.base };
    });
  });

  for (const [label] of RENDERERS) {
    test(`${label} — a clean merge of two component-adding PRs is byte-correct`, () => {
      const s = states.find((x) => x.label === label);
      if (/^(<{7}|={7}|>{7})/m.test(s.merged)) return;   // loud, and therefore not this failure
      const m = s.merged.split('\n');
      const f = s.fresh.split('\n');
      const at = m.findIndex((l, i) => l !== f[i]);
      assert.equal(at, -1,
        `${label} merges CLEAN and lands STALE — an aggregate over all manifests.\n` +
        `  line ${at + 1}\n    merged: ${String(m[at]).trim().slice(0, 120)}\n    fresh : ${String(f[at]).trim().slice(0, 120)}\n` +
        '  Remove the total; a reader computes it from the entries. See #1594 / #1547.');
      assert.equal(s.merged, s.fresh);
    });
  }

  test('the fixture is real — the four states actually differ', () => {
    // Without this the three tests above pass vacuously the moment `loadAll` stops
    // containing X and Y, or a renderer stops reading its argument.
    for (const s of states) {
      assert.notEqual(s.base, s.fresh, `${s.label}: removing two components changed nothing`);
      assert.ok(!s.merged.includes('<<<<<<<'), `${s.label}: the merge under test is the CLEAN one`);
    }
    const json = states.find((s) => s.label === 'dist/docs/components.json').fresh;
    assert.ok(json.includes(`"name": "${X}"`), `${X} is in the full catalog`);
    assert.ok(json.includes(`"name": "${Y}"`), `${Y} is in the full catalog`);
  });
});
