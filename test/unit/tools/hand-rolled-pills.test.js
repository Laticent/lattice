/**
 * Unit: `checkHandRolledPills` in tools/check-ownership.js — no hand-rolled pill
 * (engineering/decisions/2026-10-17-pills-plugin.md §4.4). The pills plugin owns the pill's
 * rendering and styling, so a stylesheet outside `lib/plugins/pills/` that reads a `--pill-*`
 * or `--lat-pill-*` token is painting a pill of its own. Every read is counted per file against
 * SANCTIONED_PILL_READS, which only shrinks.
 *
 * Pinned both ways, as the reading-role gate is: a read above its sanction fails (a new
 * hand-rolled pill), and a sanction above its reads fails as stale. And the real tree passes
 * with every sanction exactly consumed.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const own = require('../../../tools/check-ownership.js');

const KPI = 'lib/components/evidence/kpi/kpi.styles.css';
const sanctions = [{ file: KPI, count: 2, why: 'trailing code painted by hand' }];

test('the real tree passes, every sanction consumed', () => {
  const errors = [];
  own.checkHandRolledPills(errors);
  assert.deepEqual(errors, []);
});

test('a stylesheet with no sanction that reads a pill token fails, naming the fix', () => {
  const [e, ...rest] = own.handRolledPillFindings([{ file: 'lib/components/x/x.styles.css', n: 1 }], sanctions.slice(1));
  assert.equal(rest.length, 0);
  assert.match(e, /x\.styles\.css reads a `--pill-\*` token 1 time\(s\), none sanctioned/);
  assert.match(e, /SANCTIONED_PILL_READS/);
  assert.match(e, /--lat-pill-edge/);
});

test('one read past its sanction fails', () => {
  const [e] = own.handRolledPillFindings([{ file: KPI, n: 3 }], sanctions);
  assert.match(e, /3 time\(s\), 2 sanctioned/);
});

test('a sanction with fewer reads than it allows is stale', () => {
  const [e] = own.handRolledPillFindings([{ file: KPI, n: 1 }], sanctions);
  assert.match(e, /stale pill-read sanction .* 1 time\(s\), 2 sanctioned/);
});

test('both token families count, comments do not', () => {
  const css = '/* var(--pill-bg) */ a{color:var(--pill-fg);border-color:var( --lat-pill-edge)} b{--pill-x:1}';
  assert.equal(own.pillReadsIn(css), 2);
});
