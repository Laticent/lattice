/**
 * `axisGrowth` — the SIZE half of the anchor measure (tools/lib/jank-drift.js).
 *
 * `axisDrift` answers "did the mark move?" and returns 0 for a mark pinned at one edge
 * that grows (#2168, the page numeral). `axisGrowth` answers the other question, "did the
 * mark change size?", for a mark whose contract is one size — `topic`'s lit tab. The two
 * must stay separate numbers: these relations pin that each one sees what the other is
 * built to ignore.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { axisDrift, axisGrowth } = require('../../../tools/lib/jank-drift.js');

test('a pure translation moves the mark and does not grow it', () => {
  const near = [10, 40, 90];
  const far = near.map((n) => n + 120);
  assert.equal(axisGrowth(near, far), 0);
  assert.equal(axisDrift(near, far), 80);
});

test('a mark pinned at its top that grows downward is growth, not drift — the topic tab without its foot', () => {
  const near = [536.8, 536.8, 536.8, 536.8];
  const far = [572, 604.1, 636.2, 828.5];
  assert.equal(axisDrift(near, far), 0, 'DRIFT must stay blind to this, or #2168 comes back');
  assert.ok(Math.abs(axisGrowth(near, far) - 256.5) < 1e-9);
});

test('growth pinned at either edge, or about the center, reads the same size change', () => {
  const sizes = [20, 35, 50];
  const top = 100;
  const bottomPinned = { near: sizes.map((s) => 300 - s), far: sizes.map(() => 300) };
  const topPinned = { near: sizes.map(() => top), far: sizes.map((s) => top + s) };
  const centered = { near: sizes.map((s) => 200 - s / 2), far: sizes.map((s) => 200 + s / 2) };
  for (const { near, far } of [bottomPinned, topPinned, centered]) {
    assert.equal(axisGrowth(near, far), 30);
    assert.equal(axisDrift(near, far), 0);
  }
});

test('growth is invariant under a common translation of the whole sweep', () => {
  const near = [5, 9, 2];
  const far = [50, 70, 30];
  const g = axisGrowth(near, far);
  assert.equal(axisGrowth(near.map((n) => n + 333), far.map((f) => f + 333)), g);
});

test('it refuses what did not measure, as axisDrift does', () => {
  assert.throws(() => axisGrowth([1, 2], [3]), TypeError);
  assert.throws(() => axisGrowth([1, Number.NaN], [3, 4]), TypeError);
  assert.equal(axisGrowth([1], [9]), 0, 'one step has no spread');
});
