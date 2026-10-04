/**
 * Unit: `checkReadingRole` in tools/check-ownership.js — one reading size
 * (engineering/typography.md §7; engineering/decisions/2026-09-29-one-reading-size-per-venue.md).
 * Reading text reads at `--fs-body`; every use of `--fs-message` or `--fs-body-compact` in
 * engine CSS is counted per file against SANCTIONED_READING_ROLE, which names the exception
 * each one falls under.
 *
 * Pinned both ways, as #20 / #22 / #26 are: a use above its sanction fails (the way a second
 * reading size comes back), and a sanction above its uses fails as stale. And the real tree
 * passes with every sanction exactly consumed.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const own = require('../../../tools/check-ownership.js');

const LIST = 'lib/components/inventory/list/list.styles.css';
const sanctions = [{ file: LIST, role: 'body-compact', count: 1, why: 'E7 support line' }];

test('the real tree passes, every sanction consumed', () => {
  const errors = [];
  own.checkReadingRole(errors);
  assert.deepEqual(errors, []);
});

test('a list row set at --fs-message fails, naming the allowlist', () => {
  const [e, ...rest] = own.readingRoleFindings(
    [{ file: LIST, role: 'body-compact', n: 1 }, { file: LIST, role: 'message', n: 1 }], sanctions);
  assert.equal(rest.length, 0);
  assert.match(e, /list\.styles\.css sets text in `--fs-message` 1 time\(s\), none sanctioned/);
  assert.match(e, /SANCTIONED_READING_ROLE/);
});

test('one use past its sanction fails', () => {
  const [e] = own.readingRoleFindings([{ file: LIST, role: 'body-compact', n: 2 }], sanctions);
  assert.match(e, /2 time\(s\), 1 sanctioned/);
});

test('a sanction with fewer uses than it allows is stale', () => {
  const [e] = own.readingRoleFindings([], sanctions);
  assert.match(e, /stale reading-role sanction .* uses `--fs-body-compact` 0 time\(s\), 1 sanctioned/);
});

test('counts every alias of the role, and never a comment or a longer token name', () => {
  assert.deepEqual(own.readingRoleCountsIn(
    'a{font-size:var(--fs-message)} /* var(--fs-message) */ b{--x-fs:var( --fs-body-compact)} '
    + 'c{font:700 var(--fs-message)/1.2 serif} d{font-size:var(--fs-message-x)} e{font-size:var(--fs-body)}'),
  { message: 2, 'body-compact': 1 });
});

test('every sanction carries a reason', () => {
  for (const s of own.SANCTIONED_READING_ROLE) assert.ok(s.why && s.why.length > 8, `${s.file} ${s.role}`);
});
