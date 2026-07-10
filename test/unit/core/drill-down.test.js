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

  test('multiple independent same-height groups are each evaluated on their own', () => {
    const groupACulprit = fakeItem(0, 300, 298); // slack 2
    const groupABystander = fakeItem(0, 300, 60); // slack 240
    const groupBCulprit = fakeItem(0, 500, 497); // slack 3
    const groupBBystander = fakeItem(0, 500, 100); // slack 400
    const result = findCulprits([groupACulprit, groupABystander, groupBCulprit, groupBBystander]);
    assert.deepEqual(result, [groupACulprit, groupBCulprit]);
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
