/**
 * Unit: tools/lib/golden-bisect.mjs — the search that traces a drifted golden to one commit.
 *
 * The 2026-11-09 trace of #2987's drift (engineering/decisions/2026-10-06-goldens-bot-blessed.md
 * §5) rests on this narrowing. Each arm pins one way it could name the wrong commit.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

let m;
const load = async () => {
  m = await import('../../../tools/lib/golden-bisect.mjs');
};

describe('golden-bisect', () => {
  test('a reading inside machine noise does not count as moved', async () => {
    await load();
    assert.equal(m.moved(0.002, 0.2), false);
    assert.equal(m.moved(0.15, 0.2), true);
  });

  test('a changed page count always counts as moved', async () => {
    await load();
    assert.equal(m.moved(-1, 0.3), true);
  });

  test('of two moves, the search lands on the bigger one', async () => {
    await load();
    // Commit 3 moves the golden 0.04, commit 7 moves it to 0.24: the search must name 7.
    const drift = (i) => (i >= 7 ? 0.24 : i >= 3 ? 0.04 : 0);
    let t = [{ golden: 'g', lo: -1, hi: 9, target: drift(9) }];
    while (!m.done(t)) {
      for (const [i] of m.nextProbes(t)) t = t.map((x) => m.narrow(x, i, drift(i)));
    }
    assert.equal(t[0].hi, 7);
  });

  test('tracks with the same window share one render', async () => {
    await load();
    const plan = m.nextProbes([
      { golden: 'a', lo: -1, hi: 18, target: 0.1 },
      { golden: 'b', lo: -1, hi: 18, target: 0.2 },
      { golden: 'c', lo: 18, hi: 37, target: 0.1 },
      { golden: 'd', lo: 4, hi: 5, target: 0.1 },
    ]);
    assert.deepEqual([...plan.entries()], [
      [8, ['a', 'b']],
      [27, ['c']],
    ]);
  });

  test('every track ends one commit wide, on the first commit that moved it', async () => {
    await load();
    for (const culprit of [0, 1, 50, 154, 155]) {
      const drift = (i) => (i >= culprit ? 0.1 : 0.001);
      let t = [{ golden: 'g', lo: -1, hi: 155, target: 0.1 }];
      while (!m.done(t)) {
        for (const [i] of m.nextProbes(t)) t = t.map((x) => m.narrow(x, i, drift(i)));
      }
      assert.deepEqual([t[0].lo, t[0].hi], [culprit - 1, culprit]);
    }
  });
});
