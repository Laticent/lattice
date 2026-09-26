/**
 * Unit: tools/lib/calibrate-core.js `parseProbeLog` — the pages a calibration render reports as
 * not fitting. Every per-venue budget in a manifest's `venueCapacity` is read through it.
 *
 * Pinned because it broke silently: #2390 turned the `↓ SCALE` report into two lines (LEVEL,
 * lib/core/scale-fit.js rule 7), with the pages to trim on the second. The rig kept reading the
 * first line only, so it saw no stepped page past the first rung and every ceiling at scale-xl
 * and scale-2xl came back equal to the scale-l one (agenda at 10 words: 5 at xl, truly 3). The
 * log here is built by `scaleLevelReport` itself, so a change to the report's wording fails this
 * test rather than the measurements.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseProbeLog } = require('../../../tools/lib/calibrate-core.js');
const { scaleLevelReport } = require('../../../lib/core/scale-fit.js');

const overflowLine = '  ⚠ OVERFLOW — 2 slides exceed the frame and are CLIPPED in this export: pages 7, 8.';

test('reads every page the SCALE report says to trim, on every rung', () => {
  // Pages 4 and 5 fit at 1x only, page 6 at 1.15x; pages 7 and 8 fit nowhere.
  const report = scaleLevelReport([{
    from: 1.3, to: 1, size: 8,
    binding: [{ index: 3, fit: 1 }, { index: 4, fit: 1 }, { index: 5, fit: 1.15 }],
    unfit: [6, 7],
  }]);
  const log = [...report, overflowLine].join('\n');
  const { clipped, stepped } = parseProbeLog(log);
  assert.deepEqual(clipped, [7, 8], 'the OVERFLOW line, not the SCALE block that mentions it first');
  assert.deepEqual([...new Set(stepped)].sort((a, b) => a - b), [4, 5, 6]);
});

test('two asks print two blocks, and both are read', () => {
  const report = scaleLevelReport([
    { from: 1.3, to: 1.15, size: 3, binding: [{ index: 1, fit: 1.15 }], unfit: [] },
    { from: 1.5, to: 1, size: 2, binding: [{ index: 8, fit: 1 }], unfit: [] },
  ]);
  assert.deepEqual([...new Set(parseProbeLog(report.join('\n')).stepped)].sort((a, b) => a - b), [2, 9]);
});

test('a deck that fits at its scale reports nothing', () => {
  assert.deepEqual(parseProbeLog('  ✓ rendered 8 pages'), { clipped: [], stepped: [] });
});

test('a lone clipped page with no SCALE block', () => {
  const log = '  ⚠ OVERFLOW — 1 slide exceeds the frame and is CLIPPED in this export: page 3.';
  assert.deepEqual(parseProbeLog(log), { clipped: [3], stepped: [] });
});
