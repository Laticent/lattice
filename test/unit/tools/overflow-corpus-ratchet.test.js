// The overflow-corpus ratchet's verdict, as a pure function (tools/lib/overflow-corpus-ratchet.js).
// #2060: a deck absent from the baseline used to read as CLEAN, so a deck born clipping
// (examples/position-marks.md) surfaced as a "regression against baseline: clean" on whatever
// night first measured it, and a clean new deck carried no floor at all. The baseline now names
// the decks it swept, and a deck outside that list has NO floor and fails by name.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { judge, blessed, costLine } = require('../../../tools/lib/overflow-corpus-ratchet');

const base = { decksSwept: 3, swept: ['a.md', 'b.md', 'c.md'], decks: { 'a.md': [2] } };

test('a deck the baseline never swept is unfloored, named, and fails — even when it is clean', () => {
  const v = judge([{ deck: 'a.md', pages: [2] }, { deck: 'new.md', pages: [] }], base);
  assert.deepEqual(v.unfloored, ['new.md']);
  assert.equal(v.ok, false);
});

test('a deck the baseline never swept that clips is unfloored, not a regression against "clean"', () => {
  const v = judge([{ deck: 'new.md', pages: [2, 7] }], base);
  assert.deepEqual(v.unfloored, ['new.md']);
  assert.deepEqual(v.regressions, []);
});

test('a swept deck absent from `decks` is genuinely clean, so a new clip on it is a regression', () => {
  const v = judge([{ deck: 'b.md', pages: [4] }], base);
  assert.deepEqual(v.regressions, [{ deck: 'b.md', added: [4], now: [4], was: [] }]);
  assert.deepEqual(v.unfloored, []);
  assert.equal(v.ok, false);
});

test('matching the baseline is ok; clipping fewer pages is an improvement', () => {
  assert.equal(judge([{ deck: 'a.md', pages: [2] }, { deck: 'c.md', pages: [] }], base).ok, true);
  assert.deepEqual(judge([{ deck: 'a.md', pages: [] }], base).improvements, [{ deck: 'a.md', gone: [2] }]);
});

test('a render error is never ok and never floors anything', () => {
  const v = judge([{ deck: 'a.md', error: 'boom' }], base);
  assert.equal(v.ok, false);
  assert.equal(v.errors.length, 1);
});

test('a legacy baseline with no `swept` list keeps the old reading, and says so', () => {
  const v = judge([{ deck: 'new.md', pages: [] }], { decksSwept: 1, decks: {} });
  assert.deepEqual(v.unfloored, []);
  assert.equal(v.legacy, true);
});

test('bless records every swept deck by name, sorted, and only clipping decks in `decks`', () => {
  const b = blessed([{ deck: 'z.md', pages: [] }, { deck: 'a.md', pages: [3, 1] }]);
  assert.deepEqual(b.swept, ['a.md', 'z.md']);
  assert.equal(b.decksSwept, 2);
  assert.deepEqual(b.decks, { 'a.md': [3, 1] });
  assert.equal(b.totalSlides, 2);
});

test('the cost line divides the sweep by its decks (work done, not a timing assertion)', () => {
  assert.equal(costLine({ decks: 500, seconds: 2000, jobs: 2 }), '⏱ sweep cost — 500 decks in 2000s at 2 workers: 4.00 s/deck');
});
