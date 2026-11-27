/**
 * Unit: tools/lib/regress-control.mjs — `regress --control`'s verdict.
 *
 * The control compares two FRESH renders on one machine: HEAD and the commit a golden was
 * rendered from. A false "machine" verdict hides a real source change behind the cross-machine
 * band, the direction that cost three sessions a day when they read the band as a regression.
 * So the rows pin the edges: a page-count change (pixels -1), a page just over the floor, and a
 * page exactly at it. The fixtures use pixelDiff's real perPage shape ({ page, pixels, total }).
 */

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');

let m;
before(async () => {
  m = await import('../../../tools/lib/regress-control.mjs');
});

const TOTAL = 960 * 540;
const FLOOR = 0.0005; // FAIL_FRACTION, the deck floor
const page = (n, pixels) => ({ page: n, pixels, total: TOTAL });

describe('controlVerdict', () => {
  test('identical renders are the machine band', () => {
    const v = m.controlVerdict([page(1, 0), page(2, 0)], FLOOR);
    assert.deepEqual(v, { verdict: 'machine', moved: [], worst: 0 });
  });

  test('a page at the floor is still the band; one pixel over it is source drift', () => {
    // 20,000 px makes the floor exactly 10 px, so "at" is on the floor, not just under it.
    const small = (n, pixels) => ({ page: n, pixels, total: 20000 });
    assert.equal(m.controlVerdict([small(1, 10)], FLOOR).verdict, 'machine');
    const over = m.controlVerdict([small(1, 0), small(2, 11)], FLOOR);
    assert.equal(over.verdict, 'source');
    assert.deepEqual(over.moved, [2]);
  });

  test('a page-count change is source drift at worst 100%', () => {
    const v = m.controlVerdict([page(1, 0), { page: 0, pixels: -1, total: 0 }], FLOOR);
    assert.equal(v.verdict, 'source');
    assert.equal(v.worst, 1);
  });
});

describe('groupByBlessCommit', () => {
  test('one group per rendered-from commit, and an uncommitted golden in its own group', () => {
    const shas = { 'a.pdf': 'aaa', 'b.pdf': 'bbb', 'c.pdf': 'aaa', 'd.pdf': '' };
    const groups = m.groupByBlessCommit(['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf'].map((golden) => ({ golden })), (g) => shas[g]);
    assert.deepEqual([...groups.keys()], ['aaa', 'bbb', '']);
    assert.deepEqual(groups.get('aaa').map((i) => i.golden), ['a.pdf', 'c.pdf']);
  });
});

describe('controlLine', () => {
  test('each verdict says what to do with the drift', () => {
    assert.match(m.controlLine({ sha: '68f1cd042d9a', nightly: true, verdict: 'machine' }), /@68f1cd04: same render here → cross-machine band/);
    assert.match(m.controlLine({ sha: '68f1cd042d9a', nightly: true, verdict: 'source', worst: 0.0123 }), /worst 1\.23%\) → source drift/);
    assert.match(m.controlLine({ sha: '', verdict: 'unavailable', error: 'never committed' }), /unavailable \(never committed\); treat the drift as unexplained/);
  });

  test('a golden not written by a nightly bless says the rendered-from commit is assumed', () => {
    assert.match(m.controlLine({ sha: 'bcc7c55c00', nightly: false, verdict: 'machine' }), /not a nightly bless; assumed/);
    assert.doesNotMatch(m.controlLine({ sha: 'bcc7c55c00', nightly: true, verdict: 'machine' }), /assumed/);
  });
});

test('hostLine names the Chrome and the CPU, and says where the goldens were blessed', () => {
  const line = m.hostLine({ chrome: 'Google Chrome for Testing 158.0.8127.36', cpu: 'Intel(R) Xeon(R)', cores: 4 });
  assert.match(line, /Chrome for Testing 158\.0\.8127\.36 · Intel\(R\) Xeon\(R\) · 4 cores/);
  assert.match(line, /GitHub runner/);
  assert.match(m.hostLine({ chrome: '', cpu: '', cores: 1 }), /version unknown\) · CPU unknown/);
});
