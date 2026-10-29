const { test } = require('node:test');
const assert = require('node:assert/strict');
const { tally, compare, format, exitCode } = require('../../../tools/lib/fit-harness/ratchet');

const row = (o) => ({ arm: 'structural', variant: 'orig', size: 'story', venue: 'hall', src: 'a.md', lost: 0, pages: [{ fits: true, cut: null }], ...o });

test('tally counts clipped and lost original slides of the structural arm only', () => {
  const t = tally([
    row({ pages: [{ fits: false, cut: 'content' }] }),
    row({ lost: 2 }),
    row({ pages: [{ fits: false, cut: 'footer' }] }), // a footer-only cut is not a clip
    row({ variant: 'add', pages: [{ fits: false, cut: 'content' }] }), // edits are not counted
    row({ arm: 'rescue-20-30', pages: [{ fits: false, cut: 'content' }] }), // simulated arms are not counted
  ]);
  assert.deepEqual(t, { 'a.md': { 'story@hall': { clip: 1, lost: 1 } } });
});

test('compare names a count that rose, and a count that fell as a win', () => {
  const base = { 'a.md': { 'story@hall': { clip: 2, lost: 1 } } };
  const r = compare(base, { 'a.md': { 'story@hall': { clip: 3, lost: 0 } } });
  assert.deepEqual(r.regressions, [{ src: 'a.md', cell: 'story@hall', metric: 'clip', was: 2, now: 3 }]);
  assert.deepEqual(r.wins, [{ src: 'a.md', cell: 'story@hall', metric: 'lost', was: 1, now: 0 }]);
});

test('a source or cell the baseline lacks starts at zero, so a new component that clips fails', () => {
  const r = compare({}, { 'new.md': { 'square@laptop': { clip: 1, lost: 0 } } });
  assert.equal(r.regressions.length, 1);
  assert.equal(compare({}, { 'new.md': { 'square@laptop': { clip: 0, lost: 0 } } }).regressions.length, 0);
});

test('format carries the marker the nightly workflow reads', () => {
  assert.match(format({ regressions: [{ src: 'a.md', cell: 'story@hall', metric: 'clip', was: 0, now: 1 }], wins: [] }), /ROSE above the baseline/);
  assert.match(format({ regressions: [], wins: [] }), /no count rose/);
});

test('an expected cell with no rows is NOT SCORED, never silently absent', () => {
  const t = tally([], [['a.md', 'story@hall']]);
  assert.deepEqual(t, { 'a.md': { 'story@hall': { unscored: true } } });
});

test('a run that scored nothing is not clean: every render failing must not read as green', () => {
  const base = { 'a.md': { 'story@hall': { clip: 1, lost: 0 } } };
  const r = compare(base, tally([], [['a.md', 'story@hall']]));
  assert.equal(r.nothingScored, true);
  assert.equal(exitCode(r), 3);
  assert.match(format(r), /NOTHING SCORED/);
  assert.doesNotMatch(format(r), /no count rose/);
  // and an empty run (no galleries matched) is not clean either
  assert.equal(compare(base, {}).nothingScored, true);
});

test('a cell the baseline scores but this run did not fails; a known-unscored cell does not', () => {
  const base = { 'a.md': { 'story@hall': { clip: 0, lost: 0 } }, 'd.md': { 'story@hall': { unscored: true } } };
  const now = tally([row({})], [['a.md', 'story@hall'], ['d.md', 'story@hall']]);
  const r = compare(base, now);
  assert.equal(exitCode(r), 0, 'diagram-like known gap stays visible but not red');
  const lost = compare({ ...base, 'b.md': { 'story@hall': { clip: 0, lost: 0 } } }, { ...now, 'b.md': { 'story@hall': { unscored: true } } });
  assert.equal(exitCode(lost), 3);
  assert.match(format(lost), /NOT SCORED/);
});

test('a known-unscored cell that scores again is reported for a bless, not as a regression', () => {
  const r = compare({ 'd.md': { 'story@hall': { unscored: true } } }, { 'd.md': { 'story@hall': { clip: 2, lost: 0 } } });
  assert.equal(r.regressions.length, 0);
  assert.equal(r.scored.length, 1);
});

test('exit codes: 0 clean, 1 a count rose', () => {
  assert.equal(exitCode(compare({ 'a.md': { 'x@y': { clip: 0, lost: 0 } } }, { 'a.md': { 'x@y': { clip: 0, lost: 0 } } })), 0);
  assert.equal(exitCode(compare({ 'a.md': { 'x@y': { clip: 0, lost: 0 } } }, { 'a.md': { 'x@y': { clip: 1, lost: 0 } } })), 1);
});
