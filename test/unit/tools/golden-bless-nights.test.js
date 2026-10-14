/**
 * Unit: tools/lib/golden-bless-nights.mjs — one calibration row per bless night.
 *
 * Goldens rollout step 4 sets thresholds from these rows. The load-bearing part is the
 * CARRY: an unmerged bless PR re-blesses every earlier night's goldens, so without the
 * delta one unseen golden makes every later night read "no" and the week tells you
 * nothing. Each arm pins one way the delta could lie.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

let m;
const load = async () => {
  m = await import('../../../tools/lib/golden-bless-nights.mjs');
};

const A = 'examples/a.pdf';
const B = 'examples/b.pdf';
const N = 'examples/new.pdf';
const deck = (pdf, t) => ({ deck: pdf.replace(/\.pdf$/, '.md'), scope: 'deck', themes: { golden: { status: 'DRIFT', pages: 5, worstFraction: 0.002, drifted: [], ...t } } });
const night = (date, changed, check, { seen = new Set(changed), created = [], windowFrom = 'w1', problems, ...rest } = {}) => ({
  date,
  runUrl: `https://example.test/${date}`,
  verdict: { changed, created, windowFrom, renderedFrom: `${date}-sha`, ...(problems ? { problems } : {}) },
  check,
  seen,
  ...rest,
});

describe('nightRows — the carry', () => {
  test('a golden carried from the previous night of the same window is not in the delta', async () => {
    await load();
    const rows = m.nightRows([
      night('d1', [A], [deck(A)], { seen: new Set() }),
      night('d2', [A, B], [deck(A), deck(B)], { seen: new Set([B]) }),
    ]);
    assert.deepEqual(rows[1].delta, [B]);
    // The full night fails rule 4 on the carried A; the night alone would merge.
    assert.equal(rows[1].autoMerge, false);
    assert.deepEqual(rows[1].unseen, [A]);
    assert.equal(rows[1].deltaAutoMerge, 'yes');
    assert.deepEqual(rows[1].deltaUnseen, []);
  });
  test('a new window (the previous bless merged) carries nothing', async () => {
    await load();
    const rows = m.nightRows([
      night('d1', [A], [deck(A)]),
      night('d2', [A], [deck(A)], { windowFrom: 'w2' }),
    ]);
    assert.deepEqual(rows[1].delta, [A]);
  });
  test('a carried golden whose drift grew is scored again', async () => {
    await load();
    const rows = m.nightRows([
      night('d1', [A], [deck(A)]),
      night('d2', [A], [deck(A, { worstFraction: 0.2 })]),
    ]);
    assert.deepEqual(rows[1].delta, [A]);
    assert.equal(rows[1].deltaRules[1], false);
  });
  test('a night that adds nothing is never a "yes"', async () => {
    await load();
    const rows = m.nightRows([night('d1', [A], [deck(A)]), night('d2', [A], [deck(A)])]);
    assert.deepEqual(rows[1].delta, []);
    assert.equal(rows[1].deltaAutoMerge, 'nothing new');
    assert.match(m.nightsMarkdown(rows), /nothing new/);
  });
  test('a first-time golden counts toward the delta, and unseen it says no', async () => {
    await load();
    const [r] = m.nightRows([night('d1', [N], [], { created: [N], seen: new Set() })]);
    assert.equal(r.created, 1);
    assert.deepEqual(r.deltaUnseen, [N]);
    assert.equal(r.deltaAutoMerge, 'no');
  });
  test('a problem on the full night (a golden the gate could not check) blocks the delta too', async () => {
    await load();
    const check = [deck(A), { deck: 'examples/x.md', scope: 'deck', themes: { golden: { status: 'ERROR' } } }];
    const [r] = m.nightRows([night('d1', [A], check)]);
    assert.equal(r.problems, 1);
    assert.equal(r.deltaAutoMerge, 'no');
  });
  test("the bot's own problems (a failed bless, an unreadable PR) block both scores", async () => {
    await load();
    // verdict.json is the only place these live: the check cannot show them.
    const [r] = m.nightRows([night('d1', [A], [deck(A)], { problems: ['could not read PR #9'] })]);
    assert.equal(r.problems, 1);
    assert.equal(r.autoMerge, false);
    assert.equal(r.deltaAutoMerge, 'no');
  });
  test('a carried first-time golden whose inputs changed is uncertain, never a pass', async () => {
    await load();
    const rows = m.nightRows([
      night('d1', [N], [], { created: [N] }),
      night('d2', [N, B], [deck(B)], { created: [N], mayHaveMoved: (g) => g === N }),
    ]);
    assert.deepEqual(rows[1].uncertain, [N]);
    assert.deepEqual(rows[1].delta, [B]);
    assert.equal(rows[1].deltaAutoMerge, 'unknown');
  });
  test('a carried first-time golden whose inputs did not change is carried', async () => {
    await load();
    const rows = m.nightRows([
      night('d1', [N], [], { created: [N] }),
      night('d2', [N], [], { created: [N], mayHaveMoved: () => false }),
    ]);
    assert.deepEqual(rows[1].carried, [N]);
    assert.equal(rows[1].deltaAutoMerge, 'nothing new');
  });
  test('a second page that moved, with the worst page unchanged, is scored again', async () => {
    await load();
    const one = { worstFraction: 0.002, drifted: [{ page: 1, pixels: 900 }] };
    const two = { worstFraction: 0.002, drifted: [{ page: 1, pixels: 900 }, { page: 3, pixels: 40 }] };
    const rows = m.nightRows([night('d1', [A], [deck(A, one)]), night('d2', [A], [deck(A, two)])]);
    assert.deepEqual(rows[1].delta, [A]);
  });
  test("the delta's rule 4 counts only PRs since the previous night's render", async () => {
    await load();
    const rows = m.nightRows([
      night('d1', [A], [deck(A)]),
      // B was shown on a PR merged before d1's render, so it is in the window's seen set
      // but not in the delta's.
      night('d2', [A, B], [deck(A), deck(B)], { seen: new Set([A, B]), deltaSeen: new Set() }),
    ]);
    assert.deepEqual(rows[1].deltaUnseen, [B]);
    assert.equal(rows[1].deltaAutoMerge, 'no');
  });
  test('the oldest night fetched, mid-window, prints its delta as n/a', async () => {
    await load();
    const rows = m.nightRows([night('d1', [A], [deck(A)])]);
    assert.equal(rows[0].deltaKnown, false);
    assert.match(m.nightsMarkdown(rows), /\| n\/a \|/);
    // With no earlier bless the window has just opened, so the delta is the whole night.
    assert.equal(m.nightRows([night('d1', [A], [deck(A)], { windowFrom: null, seen: null })])[0].deltaKnown, true);
  });
  test('the check may arrive wrapped as { report }, as a saved --json stdout is', async () => {
    await load();
    const [r] = m.nightRows([night('d1', [A], { report: [deck(A, { worstFraction: 0.03 })] })]);
    assert.equal(r.worst, 0.03);
  });
});

describe('nightsMarkdown', () => {
  test('one row per night, an empty label column, and the delta unseen list capped', async () => {
    await load();
    const many = Array.from({ length: 15 }, (_, i) => `examples/d${i}.pdf`);
    const md = m.nightsMarkdown(m.nightRows([night('d1', many, many.map((g) => deck(g)), { seen: new Set(), windowFrom: null })]));
    assert.match(md, /\| \[d1\]\(https:\/\/example\.test\/d1\) .* \| \|$/m);
    assert.match(md, /and 3 more/);
  });
});
