/**
 * Unit: tools/check-no-pdf-in-pr.mjs — a pull request may not add or change a committed PDF.
 *
 * The nightly bless bot is the one writer of golden PDFs (2026-10-06-goldens-bot-blessed.md
 * §2.3). A false pass puts PDFs back on the conflict path; a false fail blocks the bless PR,
 * which is the only PR that must carry them. Both directions are pinned.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

let m;
const load = async () => {
  m = await import('../../../tools/check-no-pdf-in-pr.mjs');
};

test('an added or modified PDF fails', async () => {
  await load();
  for (const status of ['A', 'M']) {
    const r = m.judge([{ status, path: 'examples/x.pdf' }]);
    assert.equal(r.ok, false, status);
    assert.deepEqual(r.offending, ['examples/x.pdf']);
  }
});

test('a renamed or copied PDF fails on its new path', async () => {
  await load();
  const rows = m.parseNameStatus('R100\texamples/old.pdf\texamples/new.pdf\nC090\ta.pdf\tb.pdf\n');
  const r = m.judge(rows);
  assert.equal(r.ok, false);
  assert.deepEqual(r.offending, ['examples/new.pdf', 'b.pdf']);
});

test('deleting a PDF is allowed (a PR that removes a deck removes its PDF)', async () => {
  await load();
  assert.equal(m.judge(m.parseNameStatus('D\texamples/gone.pdf\n')).ok, true);
});

test('no PDF in the diff passes', async () => {
  await load();
  assert.equal(m.judge([]).ok, true);
});

test('the bless PR is exempt, by its branch in this repository', async () => {
  await load();
  const rows = [{ status: 'M', path: 'lib/components/a/a.gallery.light.pdf' }];
  assert.equal(m.judge(rows, { headRef: 'chore/golden-bless', sameRepo: true }).ok, true);
});

test('look-alikes and forks are not exempt', async () => {
  await load();
  const rows = [{ status: 'M', path: 'x.pdf' }];
  for (const ctx of [
    { headRef: 'chore/golden-bless', sameRepo: false },
    { headRef: 'chore/golden-bless' },
    { headRef: 'chore/golden-bless-fix', sameRepo: true },
    { headRef: 'claude/chore/golden-bless', sameRepo: true },
  ]) {
    assert.equal(m.judge(rows, ctx).ok, false, JSON.stringify(ctx));
  }
});

test('the families the bless never writes are still committed by pull requests', async () => {
  await load();
  for (const f of [
    'engineering/decisions/2026-10-08-some-note.pdf',
    'kit/Sample-Deck.pdf',
    'examples/chart-theme-gallery/indaco.pdf',
  ]) {
    assert.equal(m.judge([{ status: 'A', path: f }]).ok, true, f);
  }
  // A bot-owned golden beside them is still refused.
  assert.equal(m.judge([{ status: 'A', path: 'examples/chart-theme.pdf' }]).ok, false);
});
