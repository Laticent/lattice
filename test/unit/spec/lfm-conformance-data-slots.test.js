// The data-slots case (spec/conformance/lfm/data-slots.json, LFM 1.1 §3.6 rule 4) must fail when
// the ENGINE loses the rule, not only when its expectations are broken. A flowchart consumes its
// whole list into the chart, so "no pill on the slide" holds with or without ownership; this test
// strips the slot declarations from the engine and checks the case notices.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const HOOK = path.join(ROOT, 'test/fixtures/lfm/strip-data-slots.cjs');
const run = (strip) => spawnSync(process.execPath, ['-r', HOOK, 'tools/lfm-conformance.js', 'data-slots'], {
  cwd: ROOT, encoding: 'utf8', env: { ...process.env, STRIP: strip },
});

describe('LFM conformance: the data-slots case fails when the engine loses the rule', () => {
  test('with no data slots, the L1 and L2 rows that pin ownership fail', () => {
    const r = run('all');
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /\[a record the slot cannot read is the slot's finding, not a pill's\] L2/);
    assert.match(r.stdout, /\[the same row on a state chart\] L2/);
    assert.match(r.stdout, /\[a slot with no row depth owns every list: a span it does not consume stays code\] L1/);
  });
  test('with no row depth, the first-list row fails', () => {
    const r = run('rowDepth');
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /\[a slot with a row depth reads only the first list: a later list's span is a pill\] L1/);
  });
});
