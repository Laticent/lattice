/**
 * Unit: tools/lib/golden-bless-verdict.mjs — may tonight's bless merge itself?
 *
 * The owner's hybrid (2026-10-07): auto-merge only when all four rules hold. A false
 * "yes" lands an unseen visual change on main with no human, so each rule is pinned to
 * fail on its own, and anything the gate could not check must force a "no".
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

let m;
const load = async () => {
  m = await import('../../../tools/lib/golden-bless-verdict.mjs');
};

const row = (golden, over = {}) => ({ golden, status: 'DRIFT', pages: 10, worstFraction: 0.002, pageCountChanged: false, ...over });
const Q = 'lib/components/statement/quote/quote.gallery.light.pdf';
const SEEN_ALL = new Set([Q, 'examples/pricing.pdf']);

describe('verdict — the four rules', () => {
  test('a small, seen change auto-merges', async () => {
    await load();
    const v = m.verdict([row(Q), row('x.pdf', { status: 'ok' })], SEEN_ALL);
    assert.equal(v.autoMerge, true);
    assert.deepEqual(v.changed, [Q]);
  });
  test('rule 1: a page count change says no', async () => {
    await load();
    const v = m.verdict([row(Q, { pageCountChanged: true })], SEEN_ALL);
    assert.equal(v.autoMerge, false);
    assert.equal(v.rules[0].ok, false);
  });
  test('rule 2: a page past the threshold says no', async () => {
    await load();
    const v = m.verdict([row(Q, { worstFraction: m.MAX_PAGE_FRACTION + 0.0001 })], SEEN_ALL);
    assert.equal(v.autoMerge, false);
    assert.equal(v.rules[1].ok, false);
  });
  test('rule 3: more than MAX_GOLDENS changed says no', async () => {
    await load();
    const rows = Array.from({ length: m.MAX_GOLDENS + 1 }, (_, i) => row(`g${i}.pdf`));
    const v = m.verdict(rows, new Set(rows.map((r) => r.golden)));
    assert.equal(v.autoMerge, false);
    assert.equal(v.rules[2].ok, false);
    assert.equal(m.verdict(rows.slice(1), new Set(rows.map((r) => r.golden))).autoMerge, true);
  });
  test('rule 4: an unseen golden says no', async () => {
    await load();
    const v = m.verdict([row(Q), row('examples/other.pdf')], SEEN_ALL);
    assert.equal(v.autoMerge, false);
    assert.match(v.rules[3].detail, /examples\/other\.pdf/);
  });
  test('rule 4: with no earlier bless, nothing counts as seen', async () => {
    await load();
    const v = m.verdict([row(Q)], null);
    assert.equal(v.autoMerge, false);
    assert.match(v.rules[3].detail, /no earlier bless/);
  });
  test('a golden the gate could not check says no, even when nothing drifted', async () => {
    await load();
    for (const status of ['RENDER_ERROR', 'NO_GOLDEN']) {
      const v = m.verdict([row(Q), row('examples/pricing.pdf', { status })], SEEN_ALL);
      assert.equal(v.autoMerge, false, status);
      assert.equal(v.problems.length, 1);
    }
  });
  test('nothing changed: nothing to merge', async () => {
    await load();
    assert.equal(m.verdict([row(Q, { status: 'ok' })], SEEN_ALL).autoMerge, false);
  });
});

describe('seenGoldens — what the merged PRs rendered', () => {
  const corpus = {
    galleries: ['lib/components/statement/quote/quote.gallery.md', 'lib/components/statement/statement.gallery.md'],
    deckGoldens: ['examples/pricing.pdf'],
  };
  test('a component change saw both moods of its gallery and its bucket gallery', async () => {
    await load();
    const s = m.seenGoldens([['lib/components/statement/quote/quote.styles.css']], corpus);
    assert.deepEqual([...s].sort(), [
      'lib/components/statement/quote/quote.gallery.dark.pdf',
      'lib/components/statement/quote/quote.gallery.light.pdf',
      'lib/components/statement/statement.gallery.dark.pdf',
      'lib/components/statement/statement.gallery.light.pdf',
    ]);
  });
  test('a deck edit saw that deck; a committed PDF counts as seen', async () => {
    await load();
    const s = m.seenGoldens([['examples/pricing.md'], ['themes/x/y.pdf']], corpus);
    assert.ok(s.has('examples/pricing.pdf'));
    assert.ok(s.has('themes/x/y.pdf'));
  });
  test('galleries the PR cap left out were NOT seen', async () => {
    await load();
    const s = m.seenGoldens([['lib/core/fit.js']], { ...corpus, cap: 2 }); // room for one gallery
    assert.equal(s.size, 2);
    assert.ok(s.has('lib/components/statement/statement.gallery.light.pdf'), 'bucket gallery first');
  });
  test('docs-only merges saw nothing', async () => {
    await load();
    assert.equal(m.seenGoldens([['engineering/workflow.md']], corpus).size, 0);
  });
});

describe('goldenRows — regression-gate report → one row per golden', () => {
  test('galleries, decks, page-count drift and unchecked goldens', async () => {
    await load();
    const rows = m.goldenRows([
      {
        deck: 'lib/components/statement/quote/quote.gallery.md',
        themes: {
          light: { status: 'DRIFT', pages: 3, worstFraction: 0.01, drifted: [{ page: 4, pixels: -1, note: 'page only in new' }], golden: Q },
          dark: { status: 'NO_GOLDEN' },
        },
      },
      { deck: 'examples/pricing.md', scope: 'deck', themes: { golden: { status: 'DRIFT', pages: 8, worstFraction: 0.5, drifted: [{ page: 1, pixels: -1, note: 'page resized 960x540→960x600' }] } } },
    ]);
    assert.deepEqual(rows.map((r) => [r.golden, r.status, r.pageCountChanged]), [
      [Q, 'DRIFT', true],
      ['lib/components/statement/quote/quote.gallery.dark.pdf', 'NO_GOLDEN', false],
      ['examples/pricing.pdf', 'DRIFT', false],
    ]);
  });
});

test('the markdown names the verdict and every rule', async () => {
  await load();
  const md = m.verdictMarkdown(m.verdict([row(Q)], null));
  assert.match(md, /would auto-merge\? \*\*no\*\*/);
  assert.match(md, /Dry run/);
  for (const n of [1, 2, 3, 4]) assert.match(md, new RegExp(`\\| ${n}\\. `));
});
