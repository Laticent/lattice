/**
 * Unit: test/helpers/golden-pending.js — when a nightly integration test may excuse a
 * committed PDF as "waiting on the bless".
 *
 * The excuse is a skip, so a wrong "pending" hides a real defect. Two arms are pinned: the
 * bless subject the helper dates from, and the expiry that stops a stalled bless from
 * widening the skip window forever.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pendingBless, PENDING_DAYS, BLESS_SUBJECT_RE } = require('../../helpers/golden-pending');

test('the bless subject names the commit it rendered from, strictly', () => {
  const m = 'chore(goldens): nightly bless of 6592eaa5bac3 (#2598)'.match(BLESS_SUBJECT_RE);
  assert.equal(m?.[1], '6592eaa5bac3');
  for (const s of [
    'chore(goldens): nightly bless of 0 (#1)', // too short to be a commit
    'chore(goldens): nightly bless of 6592eaa5bac3', // not a merged PR
    'Revert "chore(goldens): nightly bless of 6592eaa5bac3 (#2598)"',
  ]) {
    assert.equal(BLESS_SUBJECT_RE.test(s), false, s);
  }
});

test(`the excuse expires: nothing is pending ${PENDING_DAYS}+ days after its sources changed`, () => {
  const later = () => Date.now() + (PENDING_DAYS + 1) * 86400 * 1000;
  // Whatever this checkout's history says, a source changed today reads as overdue then.
  assert.equal(pendingBless('nonexistent/x.pdf', ['README.md'], { now: later }), null);
});
