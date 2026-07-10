/**
 * Unit: lib/core/drill-down.js — the outlier math behind the Fix-Me
 * overlay's item-level drill-down. Drives it with plain fake DOM-like
 * objects (the same pattern test/unit/core/overflow-probe.test.js uses —
 * the module only reads getBoundingClientRect()/children/classList).
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { contentSlack, findCulprits, componentNameFor } = require('../../../lib/core/drill-down');

// A fake item: box top/bottom + a list of fake children each with their own
// bottom-most content edge. `contentBottom` (relative to the item's own
// coordinate space) drives the child rect; slack = own bottom - contentBottom.
function fakeItem(top, height, contentBottom) {
  return {
    getBoundingClientRect: () => ({ top, bottom: top + height, height }),
    children: [{ getBoundingClientRect: () => ({ bottom: contentBottom }) }],
  };
}

describe('contentSlack', () => {
  test('near-zero when content reaches the box edge', () => {
    const it = fakeItem(0, 400, 398); // content 2px short of the box
    assert.equal(contentSlack(it), 2);
  });

  test('large when content stops well short (the stretched-bystander case)', () => {
    const it = fakeItem(0, 400, 109); // content ends at 109, box runs to 400
    assert.equal(contentSlack(it), 291);
  });

  test('zero (or negative) when content exactly fills or overflows the box', () => {
    const exact = fakeItem(0, 400, 400);
    assert.equal(contentSlack(exact), 0);
    const over = fakeItem(0, 400, 420);
    assert.equal(contentSlack(over), -20);
  });
});

describe('findCulprits', () => {
  test('fewer than 2 items → [] (nothing to disambiguate)', () => {
    assert.deepEqual(findCulprits([]), []);
    assert.deepEqual(findCulprits([fakeItem(0, 400, 100)]), []);
  });

  test('the real cards-grid repro: 2 short cards + a stretched pair (17px vs 291px slack) flags only the culprit', () => {
    const shortA = fakeItem(0, 108, 91); // row 1, own row — not stretched against anything
    const shortB = fakeItem(0, 108, 91);
    const culprit = fakeItem(200, 382, 565); // row 2 — content fills almost the whole box
    const bystander = fakeItem(200, 382, 291); // row 2, stretched to match the culprit
    const result = findCulprits([shortA, shortB, culprit, bystander]);
    assert.deepEqual(result, [culprit]);
  });

  test('a uniformly tight row (every item genuinely full) flags nothing — ambiguous, not guessed', () => {
    const a = fakeItem(0, 400, 395); // slack 5
    const b = fakeItem(0, 400, 392); // slack 8
    assert.deepEqual(findCulprits([a, b]), []);
  });

  test('a uniformly loose row (every item equally under-filled) flags nothing', () => {
    const a = fakeItem(0, 400, 200); // slack 200
    const b = fakeItem(0, 400, 210); // slack 190
    assert.deepEqual(findCulprits([a, b]), []);
  });

  test('items at different heights are never grouped together — no cross-row comparison', () => {
    const tall = fakeItem(0, 400, 398); // slack 2, height 400
    const short = fakeItem(0, 100, 10); // slack 90, height 100 — different group entirely
    assert.deepEqual(findCulprits([tall, short]), []);
  });

  // With 3 members the sorted-median (index floor(3/2)=1, the MIDDLE value)
  // always lands on one of the low-slack items itself, so two genuinely low
  // items can't both clear "< median*0.5" against each other — needs a 4th
  // (also-high) member to push the median up past both of them.
  test('two genuine culprits get flagged when enough high-slack siblings push the median up', () => {
    const culprit1 = fakeItem(0, 400, 396); // slack 4
    const culprit2 = fakeItem(0, 400, 394); // slack 6
    const bystanderA = fakeItem(0, 400, 100); // slack 300
    const bystanderB = fakeItem(0, 400, 95); // slack 305
    const result = findCulprits([culprit1, culprit2, bystanderA, bystanderB]);
    assert.deepEqual(result, [culprit1, culprit2]);
  });

  test('a small (<=20px) gap does not count as an outlier — layout noise floor', () => {
    const a = fakeItem(0, 400, 385); // slack 15
    const b = fakeItem(0, 400, 400 - 15 - 20); // slack 35, gap exactly 20 (not > 20)
    assert.deepEqual(findCulprits([a, b]), []);
  });

  // The verdict-grid regression (2026-07-10): a 2x2 wrapped grid where row 1
  // (height 322) genuinely overflowed on its own oversized card, and row 2
  // (height 161, two perfectly normal short cards) got carried past the
  // clip boundary purely by row 1's excess — NOT because row 2 itself is
  // oversized. A naive per-group search flagged "Path D" in row 2 anyway,
  // just because it had marginally less slack than its row-mate "Path C" —
  // the exact misattribution this whole feature exists to avoid, one level
  // up. The row-outlier gate must suppress the normal row entirely.
  test('a comfortably-sized row is never searched just because it sits below an overflowing row', () => {
    const rowB = fakeItem(0, 322, 305); // the true culprit's row, slack 17
    const rowBmate = fakeItem(0, 322, 117); // its stretched neighbour, slack 205
    const rowD = fakeItem(0, 161, 144); // row 2: perfectly normal, slack 17
    const rowDmate = fakeItem(0, 161, 117); // row 2's other card, slack 44 — MORE slack than rowD, but neither is a problem
    const result = findCulprits([rowB, rowBmate, rowD, rowDmate]);
    assert.deepEqual(result, [rowB]);
  });

  // Two SEPARATE rows can both be genuine culprits — the row-outlier gate
  // must not collapse to "only ever the single tallest row" when several
  // rows are legitimately, independently oversized against a shared normal
  // baseline (4 groups: 2 near-baseline, 2 both clearly taller than it).
  test('two independently oversized rows against a shared normal baseline both get searched', () => {
    const baselineA1 = fakeItem(0, 150, 145);
    const baselineA2 = fakeItem(0, 150, 140);
    const baselineB1 = fakeItem(0, 160, 155);
    const baselineB2 = fakeItem(0, 160, 150);
    const tall1Culprit = fakeItem(0, 400, 396); // slack 4
    const tall1Bystander = fakeItem(0, 400, 100); // slack 300
    const tall2Culprit = fakeItem(0, 420, 415); // slack 5
    const tall2Bystander = fakeItem(0, 420, 110); // slack 310
    const result = findCulprits([
      baselineA1, baselineA2, baselineB1, baselineB2,
      tall1Culprit, tall1Bystander, tall2Culprit, tall2Bystander,
    ]);
    assert.deepEqual(result, [tall1Culprit, tall2Culprit]);
  });

  // Maker-checker finding (2026-07-10): a MEDIAN-based baseline can itself
  // land ON an anomalous row once anomalies are a MAJORITY of 3+ groups
  // (e.g. heights 150/250/500 — the middle value, 250, is itself
  // moderately oversized, so comparing it against itself as "the median"
  // silently cleared it). The baseline must be the group MINIMUM instead:
  // an overflow-causing anomaly only makes a row taller, never shorter, so
  // the shortest row can never wrongly exclude itself OR mask a
  // moderately-tall sibling the way a self-referential median can.
  test('a moderately-oversized row is still caught even when anomalous rows outnumber the normal one (3 groups)', () => {
    const normal1 = fakeItem(0, 150, 145);
    const normal2 = fakeItem(0, 150, 140);
    const moderateCulprit = fakeItem(0, 250, 246); // slack 4
    const moderateBystander = fakeItem(0, 250, 60); // slack 190
    const extremeCulprit = fakeItem(0, 500, 495); // slack 5
    const extremeBystander = fakeItem(0, 500, 100); // slack 400
    const result = findCulprits([normal1, normal2, moderateCulprit, moderateBystander, extremeCulprit, extremeBystander]);
    assert.deepEqual(result, [moderateCulprit, extremeCulprit]);
  });

  test('a moderately-oversized row is still caught with 4 groups, 3 of them anomalous', () => {
    const normal1 = fakeItem(0, 150, 145);
    const normal2 = fakeItem(0, 150, 140);
    const mildCulprit = fakeItem(0, 250, 246);
    const mildBystander = fakeItem(0, 250, 60);
    const moderateCulprit = fakeItem(0, 300, 296);
    const moderateBystander = fakeItem(0, 300, 70);
    const extremeCulprit = fakeItem(0, 500, 495);
    const extremeBystander = fakeItem(0, 500, 100);
    const result = findCulprits([
      normal1, normal2, mildCulprit, mildBystander,
      moderateCulprit, moderateBystander, extremeCulprit, extremeBystander,
    ]);
    assert.deepEqual(result, [mildCulprit, moderateCulprit, extremeCulprit]);
  });
});

describe('componentNameFor', () => {
  const catalog = { 'cards-grid': { axis: 'item', domSelector: null }, 'split-compare': { axis: 'item', domSelector: '.options > .option' } };

  test('finds the class token that is a catalog key, regardless of position', () => {
    assert.equal(componentNameFor({ classList: ['dark', 'cards-grid', 'compact'] }, catalog), 'cards-grid');
    assert.equal(componentNameFor({ classList: ['split-compare'] }, catalog), 'split-compare');
  });

  test('returns null when no class matches the catalog', () => {
    assert.equal(componentNameFor({ classList: ['content', 'dark'] }, catalog), null);
  });

  test('returns null for a section with no classes', () => {
    assert.equal(componentNameFor({ classList: [] }, catalog), null);
  });
});
