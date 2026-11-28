/**
 * THE SWEPT CORPUS STAYS SWEPT (engineering/decisions/2026-10-17-meta-record.md §15, slice D): no deck the repo ships
 * holds an old directive comment (`<!-- _class: … -->`, `<!-- _footer: … -->`, `<!-- class: … -->`, `<!-- _pane: … -->`)
 * or a bare `<!-- {…} -->` record. `<!-- @meta{…} -->` is the one spelling (owner, 2026-11-22).
 *
 * THE ORACLE IS THE MIGRATION ITSELF. A deck is clean when `lattice migrate meta` (lib/cli/migrate-meta.mjs
 * `migrateDeckText`, the kernel the lint fix and the Studio's fix button run) would convert no comment, respell no bare
 * record and keep nothing as written (merging two adjacent records is tidying, not a spelling). So this test and the tool cannot disagree about what an old spelling is: a comment the converter would
 * rewrite is one, and nothing else is. A deck sample inside a fenced code block is documentation, not a deck, and the
 * converter (rightly) never touches it.
 *
 * WHAT IS A SHIPPED DECK: every tracked `.md` outside the folders below. The repo keeps few Markdown files that are not
 * decks, and those hold no directive comment outside a fence, so walking them all costs nothing and means a deck added
 * anywhere is covered without a list to keep.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { EXCLUDE_MIRRORS_SHELL } = require('../../helpers/generated-mirrors.js');

const ROOT = path.join(__dirname, '..', '..', '..');

/** Folders that are not shipped decks: the written record of past work, quoted as it was. */
const NOT_DECKS = Object.freeze([
  'engineering/', // decision notes and their evidence (bake-off transcripts, audit repro decks), frozen as recorded
  'changelog.d/',
  'changelog/',
  'followups.d/',
]);

/**
 * Decks that keep an old spelling ON PURPOSE, each with the reason. A stale entry (a file that no longer holds one, or
 * no longer exists) fails below, so the list only shrinks.
 */
const KEEP = Object.freeze({
  'kit/Sample-Deck.md': "Marp's own sample deck, shipped in the Marp kit; Marp reads only directive comments.",
  'tools/vscode-harness/decks/mermaid-click.md': 'Drives the VS Code preview, which is Marp: it reads only directive comments.',
  'tools/vscode-harness/decks/runtime-off-notice.md': 'Drives the VS Code preview, which is Marp: it reads only directive comments.',
});

/** Every tracked `.md` that is a shipped deck, with its text. */
function shippedDecks() {
  return execSync(`git ls-files "*.md" ${EXCLUDE_MIRRORS_SHELL}`, { cwd: ROOT, encoding: 'utf8' })
    .trim().split('\n')
    .filter((rel) => rel && !NOT_DECKS.some((d) => rel.startsWith(d)))
    .map((rel) => ({ rel, text: fs.readFileSync(path.join(ROOT, rel), 'utf8') }));
}

/** The decks of `decks` that still hold an old spelling, with what the migration would do to each. */
async function oldSpellings(decks) {
  const { migrateDeckText } = await import('../../../lib/cli/migrate-meta.mjs');
  const components = require('../../../lib/authoring/lint.js').buildVocab().names;
  const out = new Map();
  for (const { rel, text } of decks) {
    if (!text.includes('<!--')) continue;
    const r = migrateDeckText(text, components);
    // Two adjacent records the migration would MERGE are not an old spelling (the gallery generators write the class and
    // the footer as two records), so only a converted comment, a respelled bare record or a kept comment counts.
    if (r.converted || r.respelled || r.kept.length) out.set(rel, `${r.converted} comment(s), ${r.respelled} bare record(s), ${r.kept.length} kept`);
  }
  return out;
}

test('no shipped deck holds an old directive comment or a bare record, outside the kept list', async () => {
  const decks = shippedDecks();
  assert.ok(decks.length > 900, `the walk reaches the corpus (${decks.length} files)`);
  const found = await oldSpellings(decks);
  const stray = [...found].filter(([rel]) => !Object.hasOwn(KEEP, rel)).map(([rel, what]) => `${rel}: ${what}`);
  assert.deepEqual(stray, [], 'run `lattice migrate meta <file>` (or `lint:deck --fix`) on each; a deck that must keep the old form goes in KEEP with its reason');
  const stale = Object.keys(KEEP).filter((rel) => !found.has(rel));
  assert.deepEqual(stale, [], 'these KEEP entries no longer hold an old spelling (or are gone): remove them');
});

test('the oracle sees every old spelling the sweep converted: a comment, a running global, a pane marker, a bare record', async () => {
  // THE FAILING ARM, kept as a test: each shape the sweep rewrote is found again when it is put back.
  const deck = (body) => [{ rel: 'probe.md', text: `---\ntheme: indaco\n---\n\n${body}\n\n# A\n` }];
  for (const body of ['<!-- _class: kpi -->', '<!-- class: dark -->', '<!-- _footer: "Q3" -->', '<!-- _pane: list -->', '<!-- {layout=kpi} -->', '<!-- _paginate: false -->']) {
    assert.ok((await oldSpellings(deck(body))).has('probe.md'), `${body} is an old spelling`);
  }
  for (const body of ['<!-- @meta{layout=kpi} -->', '<!-- @note{a note} -->', '<!-- a plain comment -->', '```md\n<!-- _class: kpi -->\n```']) {
    assert.equal((await oldSpellings(deck(body))).has('probe.md'), false, `${body} is not an old spelling`);
  }
});
