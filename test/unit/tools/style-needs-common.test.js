/**
 * Unit: tools/style-needs-common.json — the modules the Playground loader fetches at start.
 *
 * The list is an optimization, never a correctness input (a stale id costs a round trip, not a style), so
 * the test holds its SHAPE: every id names a real module, none repeats, none is already unconditional, and
 * the index the docs site ships turns the ids into the right module indexes. dist is gitignored; skipped
 * when the style modules are not built (`npm run css:build`).
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildLatticeIndex } = require('../../../tools/style-needs-lattice');
const common = require('../../../tools/style-needs-common');

const built = fs.existsSync(path.join(__dirname, '../../../dist/styles/manifest.json')) && fs.existsSync(path.join(__dirname, '../../../dist/styles-min/manifest.json'));

describe('style-needs-common', { skip: !built && 'dist/styles is not built' }, () => {
  const list = common.read();

  test('every id is a module this build has, once', () => {
    assert.deepEqual(common.unknownIds(list), []);
    assert.equal(new Set(list.ids).size, list.ids.length);
  });

  test('the shipped index turns the ids into module indexes, and none is unconditional already', () => {
    const idx = buildLatticeIndex({ verified: false });
    assert.deepEqual(
      idx.floor.map((i) => idx.modules[i].id),
      idx.modules.map((m) => m.id).filter((id) => list.ids.includes(id)),
    );
    for (const i of idx.floor) assert.equal(idx.index[i].always, false, `${idx.modules[i].id} is unconditional, so it does not belong in the list`);
  });

  test('the list is small next to the sheet: a floor that grew to most of it would defeat the loader', () => {
    const idx = buildLatticeIndex({ verified: false });
    const total = idx.modules.reduce((a, m) => a + m.bytes, 0);
    const floorBytes = idx.modules.reduce((a, m, i) => a + (idx.index[i].always || idx.floor.includes(i) ? m.bytes : 0), 0);
    assert.ok(floorBytes / total < 0.4, `the floor is ${((100 * floorBytes) / total).toFixed(0)}% of the sheet`);
  });

  test('the runtime tokens are read from the code that writes them: `.overflow` is on the list', () => {
    // The runtime toggles `.overflow` on a slide that overflows; the rule that draws the author's red
    // outline keys on it and lives in an on-demand module. A hand-kept list missed it.
    const idx = buildLatticeIndex({ verified: false });
    assert.ok(idx.runtime.c.includes('overflow'), 'overflow');
    assert.ok(idx.runtime.c.includes('fit-marked') || idx.runtime.c.includes('clip-marked'));
  });
});
