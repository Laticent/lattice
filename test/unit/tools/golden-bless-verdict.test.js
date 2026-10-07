/**
 * Unit: tools/lib/golden-bless-verdict.mjs — may tonight's bless merge itself?
 *
 * The owner's hybrid (2026-10-07): auto-merge only when all four rules hold. A false
 * "yes" lands an unseen visual change on main with no human, so each rule is pinned to
 * fail on its own, and anything the bless could not do or the gate could not check must
 * force a "no". The fixtures use what regression-gate really emits: a resized page is
 * `pixels: -1` and leaves `worstFraction` at 0 (the adversarial trio on #2570 found the
 * first version passed it, because its test fed a made-up 0.5).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

let m;
const load = async () => {
  m = await import('../../../tools/lib/golden-bless-verdict.mjs');
};

const row = (golden, over = {}) => ({ golden, status: 'DRIFT', pages: 10, worstFraction: 0.002, pageShapeChanged: false, ...over });
const Q = 'lib/components/statement/quote/quote.gallery.light.pdf';
const P = 'examples/pricing.pdf';
const SEEN = new Set([Q, P]);

describe('verdict — the four rules', () => {
  test('a small, seen, written change auto-merges', async () => {
    await load();
    const v = m.verdict([row(Q), row('x.pdf', { status: 'ok' })], SEEN, [Q]);
    assert.equal(v.autoMerge, true);
    assert.deepEqual(v.changed, [Q]);
  });
  test('rule 1: a page added, removed or resized says no', async () => {
    await load();
    const v = m.verdict([row(Q, { pageShapeChanged: true })], SEEN, [Q]);
    assert.equal(v.autoMerge, false);
    assert.equal(v.rules[0].ok, false);
  });
  test('rule 2: a page past the threshold says no', async () => {
    await load();
    const v = m.verdict([row(Q, { worstFraction: m.MAX_PAGE_FRACTION + 0.0001 })], SEEN, [Q]);
    assert.equal(v.autoMerge, false);
    assert.equal(v.rules[1].ok, false);
  });
  test('rule 3: more than MAX_GOLDENS changed says no', async () => {
    await load();
    const names = Array.from({ length: m.MAX_GOLDENS + 1 }, (_, i) => `g${i}.pdf`);
    const rows = names.map((g) => row(g));
    const v = m.verdict(rows, new Set(names), names);
    assert.equal(v.autoMerge, false);
    assert.equal(v.rules[2].ok, false);
    assert.equal(m.verdict(rows.slice(1), new Set(names), names.slice(1)).autoMerge, true);
  });
  test('rule 4: an unseen golden says no', async () => {
    await load();
    const v = m.verdict([row(Q), row('examples/other.pdf')], SEEN, [Q, 'examples/other.pdf']);
    assert.equal(v.autoMerge, false);
    assert.match(v.rules[3].detail, /examples\/other\.pdf/);
  });
  test('rule 4: with no earlier bless, nothing counts as seen', async () => {
    await load();
    const v = m.verdict([row(Q)], null, [Q]);
    assert.equal(v.autoMerge, false);
    assert.match(v.rules[3].detail, /no earlier bless/);
  });
  test('a golden the gate could not check says no', async () => {
    await load();
    for (const status of ['RENDER_ERROR', 'NO_GOLDEN']) {
      const v = m.verdict([row(Q), row(P, { status })], SEEN, [Q]);
      assert.equal(v.autoMerge, false, status);
      assert.equal(v.problems.length, 1);
    }
  });
  test('the commit is the truth: a drifted golden the bless did not write says no', async () => {
    await load();
    const v = m.verdict([row(Q), row(P)], SEEN, [Q]);
    assert.equal(v.autoMerge, false);
    assert.deepEqual(v.changed, [Q], 'the unwritten golden is not claimed as re-blessed');
    assert.match(v.problems[0], /did not write/);
  });
  test('a written golden the check never reported says no', async () => {
    await load();
    const v = m.verdict([row(Q)], SEEN, [Q, P]);
    assert.equal(v.autoMerge, false);
    assert.match(v.problems.join(), /did not report/);
  });
  test('nothing written: nothing to merge, even when the check saw drift', async () => {
    await load();
    assert.equal(m.verdict([row(Q, { status: 'ok' })], SEEN, []).autoMerge, false);
    assert.equal(m.verdict([row(Q)], SEEN, []).autoMerge, false);
  });
});

describe('goldenRows — regression-gate report → one row per golden', () => {
  test('a resized page is a page-shape change even though worstFraction reads 0', async () => {
    await load();
    // Exactly what regression-gate emits: worst = max(-1/total, …) = 0.
    const [r] = m.goldenRows([{ deck: 'examples/pricing.md', scope: 'deck', themes: { golden: {
      status: 'DRIFT', pages: 1, worstFraction: 0,
      drifted: [{ page: 1, pixels: -1, total: 518400, note: 'page resized 960x540→1280x720' }],
    } } }]);
    assert.equal(r.pageShapeChanged, true);
    assert.equal(m.verdict([r], new Set([P]), [P]).autoMerge, false);
  });
  test('an added page is a page-shape change; an unreadable compare is scored as fully moved', async () => {
    await load();
    const rows = m.goldenRows([{
      deck: 'lib/components/statement/quote/quote.gallery.md',
      themes: {
        light: { status: 'DRIFT', pages: 3, worstFraction: 0, drifted: [{ page: 4, pixels: -1, note: 'page only in new' }], golden: Q },
        dark: { status: 'DRIFT', pages: 3, worstFraction: 0, drifted: [{ page: 1, pixels: -1, total: 100, note: 'compare produced no readable pixel count' }] },
      },
    }]);
    assert.deepEqual(rows.map((r) => [r.golden, r.pageShapeChanged, r.worstFraction]), [
      [Q, true, 0],
      ['lib/components/statement/quote/quote.gallery.dark.pdf', false, 1],
    ]);
  });
  test('an unchecked golden keeps its status', async () => {
    await load();
    const [r] = m.goldenRows([{ deck: 'lib/a/a.gallery.md', themes: { dark: { status: 'NO_GOLDEN' } } }]);
    assert.deepEqual([r.golden, r.status], ['lib/a/a.gallery.dark.pdf', 'NO_GOLDEN']);
  });
});

describe('rule 4 evidence — what a person was shown', () => {
  const pr = (over) => ({ number: 1, title: 'chart(bar): x', authorIsBot: false, shown: [Q], ...over });
  test('a person\'s PR whose comment listed the golden counts', async () => {
    await load();
    assert.deepEqual([...m.seenFromPrs([pr()])], [Q]);
  });
  for (const [why, over] of [
    ['a bot-authored PR (Dependabot)', { authorIsBot: true }],
    ['the release PR', { title: 'release: v1.2.3' }],
    ['the backlog mirror', { title: 'chore(backlog): sync backlog.d to open issues' }],
    ['a bless PR', { title: 'chore(goldens): nightly bless of 0123456789ab' }],
    ['a revert', { title: 'Revert "chore(goldens): nightly bless of 0123456789ab (#9)"' }],
    ['a PR with no golden-diff comment', { shown: null }],
  ]) {
    test(`${why} shows nobody anything`, async () => {
      await load();
      assert.equal(m.seenFromPrs([pr(over)]).size, 0);
    });
  }
  test('parseShownGoldens reads the marker golden-diff writes, and only that', async () => {
    await load();
    assert.deepEqual(m.parseShownGoldens(`### x\n\n<!-- golden-diff-changed: ${P},${Q} -->\n<!-- golden-diff -->`), [P, Q]);
    assert.deepEqual(m.parseShownGoldens('<!-- golden-diff-changed:  -->'), []);
    assert.equal(m.parseShownGoldens('<!-- golden-diff -->'), null);
  });
});

describe('the window — where rule 4 starts counting', () => {
  const log = (...subjects) => subjects.map((subject, i) => ({ sha: `s${i}`, subject }));
  test('starts at the commit the last MERGED bless rendered from', async () => {
    await load();
    const sha = '0123456789abcdef0123';
    assert.equal(m.lastBlessRenderedFrom(log('feat: a (#5)', `chore(goldens): nightly bless of ${sha} (#4)`, 'x (#3)')), sha);
  });
  test('ignores a look-alike subject, an unmerged-form subject, and a revert', async () => {
    await load();
    assert.equal(m.lastBlessRenderedFrom(log(
      'chore(goldens): nightly bless-bot threshold tweak (#7)',
      'chore(goldens): nightly bless of 0123456789ab',
      'Revert "chore(goldens): nightly bless of 0123456789ab (#4)" (#6)',
      'chore(goldens): nightly bless (#3)',
    )), null);
  });
  test('prNumber reads the squash suffix', async () => {
    await load();
    assert.equal(m.prNumber('hooks(catch-up): warn (#2561)'), 2561);
    assert.equal(m.prNumber('Merge branch main'), null);
  });
});

test('the markdown names the verdict, every rule, and carries the sticky marker', async () => {
  await load();
  const md = m.verdictMarkdown(m.verdict([row(Q)], null, [Q]), { renderedFrom: '0123456789abcdef' });
  assert.match(md, /would auto-merge\? \*\*no\*\*/);
  assert.match(md, /Dry run/);
  assert.match(md, /from `0123456789ab`/);
  for (const n of [1, 2, 3, 4]) assert.match(md, new RegExp(`\\| ${n}\\. `));
  assert.ok(md.endsWith(m.VERDICT_MARKER));
});
