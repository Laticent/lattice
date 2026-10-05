/**
 * Unit: tools/lib/calibrate-core.js `parseProbeLog` — the pages a calibration render reports as
 * not fitting. Every per-venue budget in a manifest's `venueCapacity` is read through it.
 *
 * Since the automatic step-down was retired (2026-09-27), a deck at a scale renders every slide
 * at that scale and clips what does not fit: the `⚠ OVERFLOW` line, and `⚠ CONTENT CLIPPED` for a box
 * that clips inside the frame, are the whole answer. The
 * anchor on the glyph is pinned: a bare /OVERFLOW/ also matches prose that names "the OVERFLOW
 * line", which is how the rig once read the wrong pages.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseProbeLog, countClipped } = require('../../../tools/lib/calibrate-core.js');

test('reads the pages on the OVERFLOW line', () => {
  const log = '  ⚠ OVERFLOW — 2 slides exceed the frame and are CLIPPED in this export: pages 7, 8.';
  assert.deepEqual(parseProbeLog(log).clipped, [7, 8]);
});

test('prose that names the OVERFLOW line is not read as it', () => {
  const log = '  note: the OVERFLOW line reports pages 2, 3 when they clip\n  ⚠ OVERFLOW — 1 slide exceeds the frame and is CLIPPED in this export: page 5.';
  assert.deepEqual(parseProbeLog(log).clipped, [5]);
});

test('a box that clips its own content is read apart from the OVERFLOW pages', () => {
  const log = '  ⚠ OVERFLOW — 1 slide exceeds the frame and is CLIPPED in this export: page 5.\n'
    + '  ⚠ CONTENT CLIPPED — 2 slides lose content inside a box that clips, without exceeding the frame: pages 3, 5.';
  assert.deepEqual(parseProbeLog(log).clipped, [5]);
  assert.deepEqual(parseProbeLog(log).boxClipped, [3, 5]);
});

test('a count clips where its box starts losing content (kanban at hall)', () => {
  assert.deepEqual(countClipped([5], [3, 4]), [3, 4, 5]);
});

test('a box clip already on page 1 is an ellipsis, not the count, and is not read (premise)', () => {
  assert.deepEqual(countClipped([9], [1, 2, 3]), [9]);
});

test('a deck that fits reports nothing', () => {
  assert.deepEqual(parseProbeLog('  ✓ rendered 8 pages'), { clipped: [], boxClipped: [], underFloor: [], labelsDropped: [], overprint: [] });
});

// A viewBox chart never clips as it fills: it shrinks until its text is under the floor, or its
// kernel stops painting names. Those two lines are the chart ceiling's signal (2376-p2).
test('reads the pages on the TYPE FLOOR and CHART LABELS DROPPED lines', () => {
  const log = [
    '  ⚠ TYPE FLOOR — 2 scaled figures render text below the legibility floor (5.4pt = 1.00% of slide height, 7.2px here): page 3 at 3.8pt (5.1px, 0.71%), page 6 at 4.4pt (5.8px, 0.82%).',
    '    A container-responsive figure never overflows — it scales its own labels instead, so the',
    '  ⚠ CHART LABELS DROPPED — 3 names are not painted in full on 1 chart: page 9 (bar).',
    '  ⚠ OVERFLOW — 1 slide exceeds the frame and is CLIPPED in this export: page 11.',
  ].join('\n');
  assert.deepEqual(parseProbeLog(log), { clipped: [11], boxClipped: [], underFloor: [3, 6], labelsDropped: [9], overprint: [] });
});

// A label printed straight across another row's bar trips none of the three lines above: it is
// painted, legible and in the box. CHART LABELS OVERPRINT is the fourth (PR #2464).
test('reads the pages on the CHART LABELS OVERPRINT line, not its advice', () => {
  const log = [
    '  ⚠ CHART LABELS OVERPRINT — 101 labels print across a mark on 2 slides: page 2 (39), page 3 (62).',
    '    page 2: first "Revenue page 9".',
    '    A label crosses the edge of a bar, band or point it does not sit inside — usually a row',
    '    squeezed until its name prints over its neighbor. See page 7 of the gallery.',
  ].join('\n');
  assert.deepEqual(parseProbeLog(log).overprint, [2, 3]);
});

test('the explanatory lines under TYPE FLOOR are not read as pages', () => {
  const log = '  ⚠ TYPE FLOOR — 1 scaled figure renders text below the legibility floor (5.4pt, 7.2px here): page 4 at 3.8pt (5.1px, 0.71%).\n    Simplify the figure, e.g. the chart on page 12 of the gallery.';
  assert.deepEqual(parseProbeLog(log).underFloor, [4]);
});

test('every chart builder names distinct elements, so a keyed kernel cannot merge them', () => {
  const { BUILDERS } = require('../../../tools/lib/calibrate-core.js');
  for (const c of ['bar', 'bullet', 'funnel', 'piechart', 'scatter', 'waterfall', 'line', 'stacked-bar', 'slope', 'radar', 'heatmap', 'map',
    'gantt', 'journey', 'matrix-grid', 'progress', 'quadrant', 'state-chart', 'word-cloud']) {
    const heads = Array.from({ length: 16 }, (_, i) => BUILDERS[c](6, i).split('\n')[0].replace(/`[^`]*`/g, '').replace(/^\d+\.\s*/, '').trim());
    assert.equal(new Set(heads).size, 16, `${c}: ${heads.join(' / ')}`);
  }
});

test('quadrant: the body wrap deals points into four named groups, every point kept once', () => {
  const { BUILDERS, BODY_WRAP } = require('../../../tools/lib/calibrate-core.js');
  const pts = Array.from({ length: 6 }, (_, i) => BUILDERS.quadrant(3, i));
  const out = BODY_WRAP.quadrant(pts.join('\n')).split('\n');
  assert.deepEqual(out.filter((l) => l.startsWith('- ')), ['- Quick Wins', '- Strategic Bets', '- Defer', '- Time Sinks']);
  assert.deepEqual(out.filter((l) => l.startsWith('  - ')).map((l) => l.trim()).sort(), pts.slice().sort());
  // Fewer points than groups: an empty group is not written (a group with no point is a name alone).
  assert.equal(BODY_WRAP.quadrant(pts.slice(0, 2).join('\n')).split('\n').filter((l) => l.startsWith('- ')).length, 2);
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
