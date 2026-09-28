/**
 * Unit: tools/lib/calibrate-core.js `parseProbeLog` — the pages a calibration render reports as
 * not fitting. Every per-venue budget in a manifest's `venueCapacity` is read through it.
 *
 * Since the automatic step-down was retired (2026-09-27), a deck at a scale renders every slide
 * at that scale and clips what does not fit, so the `⚠ OVERFLOW` line is the whole answer. The
 * anchor on the glyph is pinned: a bare /OVERFLOW/ also matches prose that names "the OVERFLOW
 * line", which is how the rig once read the wrong pages.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseProbeLog } = require('../../../tools/lib/calibrate-core.js');

test('reads the pages on the OVERFLOW line', () => {
  const log = '  ⚠ OVERFLOW — 2 slides exceed the frame and are CLIPPED in this export: pages 7, 8.';
  assert.deepEqual(parseProbeLog(log), { clipped: [7, 8] });
});

test('prose that names the OVERFLOW line is not read as it', () => {
  const log = '  note: the OVERFLOW line reports pages 2, 3 when they clip\n  ⚠ OVERFLOW — 1 slide exceeds the frame and is CLIPPED in this export: page 5.';
  assert.deepEqual(parseProbeLog(log), { clipped: [5] });
});

test('a deck that fits reports nothing', () => {
  assert.deepEqual(parseProbeLog('  ✓ rendered 8 pages'), { clipped: [] });
});

test('a --scale rung is measured at its VENUE, lift included, not at a bare scale-* class', () => {
  const { gradedDeck } = require('../../../tools/lib/calibrate-core.js');
  const deck = (scale) => gradedDeck({ comp: 'list', size: '16:9', scale, steps: [1], slideFor: () => ({ label: 'x', body: '- a' }) });
  assert.match(deck('l'), /^---\nsize: 16:9\nvenue: huddle\n---/);
  assert.match(deck('xl'), /\nvenue: conference\n/);
  assert.match(deck('2xl'), /\nvenue: hall\n/);
  assert.doesNotMatch(deck('2xl'), /scale-2xl/);
  assert.doesNotMatch(deck(null), /venue:/);
});
