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

  test('the ids are real modules, once each; a few stale ones are tolerated, a stale list is not', () => {
    // Chunk ids are numbered by position, so a change to main's CSS can renumber one: that costs a round trip, and
    // failing every PR for it would tax them all. Past STALE_TOLERANCE the list is out of date: run --write.
    const stale = common.unknownIds(list);
    assert.ok(!common.tooStale(list), `${stale.length} of ${list.ids.length} ids are not modules this build has: ${stale.join(', ')}`);
    assert.equal(new Set(list.ids).size, list.ids.length);
  });

  test('the shipped index turns the ids into module indexes, and none is unconditional already', () => {
    const idx = buildLatticeIndex({ verified: false });
    // Ids this build lacks, or has with different CSS, are skipped: the floor is the list's intersection with the modules.
    const stale = new Set(common.unknownIds(list));
    assert.deepEqual(
      idx.floor.map((i) => idx.modules[i].id),
      idx.modules.map((m) => m.id).filter((id) => list.ids.includes(id) && !stale.has(id)),
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

  test('classes the runtime builds from HTML strings are on the list: the progress rail', () => {
    // The structural split can rebuild a slide without the rail the engine put in it and the runtime puts it
    // back (`<div class="tile-progress">` in progress.transform.js), so a scan of the HTML never sees it.
    // Found on dark-canvas-ownership.md in WebKit: the rail lost its rules under the loader.
    const idx = buildLatticeIndex({ verified: false });
    for (const name of ['tile-progress', 'tile-meta', 'tile-watermark', 'function-plot']) assert.ok(idx.runtime.c.includes(name), name);
  });

  test('every id is recorded with the hash of the module that was measured', () => {
    // A positional id can be renumbered onto a different module; the hash is what notices (unknownIds).
    for (const id of list.ids) assert.match(list.sha?.[id] || '', /^[0-9a-f]{64}$/, id);
  });

  test('the floor drops an id whose recorded hash is not the module\'s CSS (a renumbered chunk)', () => {
    const idx0 = buildLatticeIndex({ verified: false, commonList: { ids: [list.ids[0]], sha: { [list.ids[0]]: list.sha[list.ids[0]] } } });
    assert.equal(idx0.floor.length, 1, 'a matching hash keeps the id');
    const idx1 = buildLatticeIndex({ verified: false, commonList: { ids: [list.ids[0]], sha: { [list.ids[0]]: '0'.repeat(64) } } });
    assert.equal(idx1.floor.length, 0, 'a wrong hash leaves the id out');
  });

  test('no comment words reach the runtime tokens: the image module is not on every deck\'s floor', () => {
    const idx = buildLatticeIndex({ verified: false });
    assert.ok(!idx.runtime.c.includes('image'), 'image');
    assert.ok(!list.ids.includes('component:image'), 'component:image is needed by 3% of decks');
  });
});
