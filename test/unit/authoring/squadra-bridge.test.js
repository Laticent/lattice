// The Squadra bridge (lib/authoring/squadra/bridge.js, decision 2026-10-26-squadra-lint-library M1a):
// lint-core's fixable findings go through Squadra's one fix driver. These pin what changed for
// "Fix all" and `lint:deck --fix`, and what did not. The whole-deck comparison over three corpora
// is tools/squadra-fix-diff.js; its report is in the decision note's folder.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../../lib/authoring/lint-core');
const { buildVocab } = require('../../../lib/authoring/lint');
const { fixDeck, deckLanguage } = require('../../../lib/authoring/squadra/bridge');
const { trimEdit } = require('../../../lib/authoring/squadra/lattice-line');
const { splitTopLevel, separatorLines } = require('../../../lib/authoring/slide-split');
const { fencedLines } = require('../../../lib/core/shape-glyphs');

const vocab = buildVocab();
const FM = '---\ntheme: indaco\n---\n\n';
// The `@meta` spelling, so these passes count the fix under test and not the meta migration (record note §15).
const CARDS = '<!-- @meta{layout=cards-grid} -->\n\n## H\n\n';
const slides = (t) => splitTopLevel(t).length - core.fmChunks(t);
const deps = { vocab, lintTextWith: core.lintTextWith, applyFix: core.applyFix, fixLineIndex: core.fixLineIndex, fmChunks: core.fmChunks, separatorLines, splitTopLevel, fencedLines };

/** The loop applyAllFixes ran before the bridge (the reference tools/squadra-fix-diff.js keeps). */
function legacy(source) {
  let cur = source;
  for (let pass = 0; pass < 500; pass++) {
    const f = core.lintTextWith(cur, vocab).find((x) => x.autofixable);
    if (!f) break;
    const next = core.applyFix(cur, f);
    if (next == null || next === cur) break;
    cur = next;
  }
  return cur;
}

describe('Fix all through the Squadra driver', () => {
  test('fixes what the old loop fixed, in fewer passes', () => {
    const src = `${FM}${CARDS}- **A.** one\n- **B.** two\n\n---\n\n${CARDS}- **C.** three\n`;
    const res = core.fixAllDetailed(src, vocab);
    assert.equal(res.text, legacy(src));
    assert.equal(core.lintTextWith(res.text, vocab).some((f) => f.autofixable), false);
    // Two slides fix in the same pass; the second item on a slide waits on the first (lint-core flags
    // one per slide per lint), so three fixes take two passes where the old loop took three re-lints.
    assert.equal(res.applied.length, 3);
    assert.ok(res.passes <= 2, `passes: ${res.passes}`);
    assert.deepEqual([...new Set(res.applied.map((a) => a.slide))].sort(), [1, 2]);
  });

  test('fixAllDetailed with a pause runs the same passes to the same result, one task per pass', async () => {
    // The Studio's Fix all awaits this so a click does not freeze the page (editor-lint.spec.ts, the
    // 501-card deck). The deck needs one pass per card: the card rule reports one card per slide per lint.
    const deck = ['---', 'theme: indaco', '---', '', '# Title', '', '---', '', '<!-- @meta{layout=cards-grid} -->', '', '## Bets', '', ...Array.from({ length: 12 }, (_, i) => `- **Bet ${i}.** body ${i}`), ''].join('\n');
    const sync = core.fixAllDetailed(deck, vocab);
    let pauses = 0;
    const res = await core.fixAllDetailed(deck, vocab, async () => { pauses++; });
    assert.deepEqual(res, sync);
    assert.equal(sync.applied.length, 12);
    // One pause before each pass the driver ran, the one that found nothing to fix included.
    assert.equal(pauses, sync.passes + 1);
  });

  test('the meta migration runs after every line fix, so a fix meant for an old comment lands first', () => {
    // A retired `paginate` comment is deleted by its own line fix; migrated first, it would become a record field
    // that no fix removes. And a typo'd class is fixed before the migration types it as `layout`.
    const src = `${FM}<!-- _class: kpu -->\n<!-- _paginate: true -->\n\n# 42%\n\n---\n\n<!-- _class: cards-grid -->\n\n## H\n\n- **A.** one\n`;
    const res = core.fixAllDetailed(src, vocab);
    assert.equal(res.applied.at(-1).rule, 'legacy-directive-comment', 'the migration is the last fix applied');
    assert.equal(res.applied.filter((a) => a.rule === 'legacy-directive-comment').length, 1, 'one migration converts the deck');
    assert.match(res.text, /<!-- @meta\{layout=kpi\} -->/);
    assert.doesNotMatch(res.text, /paginate/);
    assert.match(res.text, /<!-- @meta\{layout=cards-grid\} -->\n\n## H\n\n- A\n {2}- one/);
  });

  // The checker on the meta slice: one span from the first changed comment to the last crossed the fence between them,
  // and the driver refused it (69 of 384 shipped decks kept their old comments); and a refused line fix held the
  // migration forever.
  test('the meta migration reaches across a code fence, and a refused fix cannot hold it back', async () => {
    const { migrateDeckText } = await import('../../../lib/cli/migrate-meta.mjs');
    const fenced = `${FM}<!-- _class: title -->\n\n# A\n\n---\n\n## B\n\n\`\`\`js\nconst x = 1;\n\`\`\`\n\n---\n\n<!-- _class: content -->\n\n## C\n`;
    const res = core.fixAllDetailed(fenced, vocab);
    assert.equal(res.text, migrateDeckText(fenced, vocab.names).text);
    assert.deepEqual(res.skipped, []);
    // A deck whose notes migration the driver refuses (its rewrite spans the fence): the meta migration still runs.
    const held = `${FM}<!-- _class: title -->\n<!-- a note -->\n\n# A\n\n---\n\n## B\n\n\`\`\`js\nx\n\`\`\`\n\n<!-- another -->\n`;
    const out = core.fixAllDetailed(held, vocab);
    assert.match(out.text, /<!-- @meta\{layout=title\} -->/);
    assert.ok(out.applied.some((a) => a.rule === 'legacy-directive-comment'));
    assert.equal((await core.fixAllDetailed(held, vocab, true)).text, out.text, 'the paused run reaches the same text');
  });

  test('a line fix the driver keeps refusing holds the migration only for one run: a second run offers it', async () => {
    // A fake rule whose machine fix never applies (applyFix answers null: the driver skips it as stale every pass).
    const src = `${FM}<!-- _class: title -->\n\n# Stuck\n`;
    const stuck = { slide: 1, rule: 'fake-stuck', severity: 'warning', line: '# Stuck', message: 'stuck', autofixable: true };
    const d = {
      ...deps,
      lintTextWith: (t, v) => [...core.lintTextWith(t, v), ...(t.includes('# Stuck') ? [stuck] : [])],
      applyFix: (t, f) => (f.rule === 'fake-stuck' ? null : core.applyFix(t, f)),
    };
    for (const pause of [undefined, true]) {
      const res = await fixDeck(src, d, pause);
      assert.match(res.text, /<!-- @meta\{layout=title\} -->/, `the migration ran (pause: ${pause})`);
      assert.ok(res.skipped.some((x) => x.rule === 'fake-stuck'), 'the stuck fix is still named');
    }
  });

  test('applyAllFixes is fixAllDetailed().text', () => {
    const src = `${FM}${CARDS}- **A.** one\n`;
    assert.equal(core.applyAllFixes(src, vocab), core.fixAllDetailed(src, vocab).text);
  });

  test('never rewrites a fenced example: the card rule does not read fences any more', () => {
    // A fenced `- **Title.** body` is an example of the WRONG form. lint-core used to flag it, so the
    // old loop rewrote the example; the rule now reads the slide with fences blanked.
    const src = `${FM}${CARDS}- **Live.** body\n\n\`\`\`md\n- **Live.** body\n\`\`\`\n`;
    const res = core.fixAllDetailed(src, vocab);
    assert.match(res.text, /```md\n- \*\*Live\.\*\* body\n```/, 'the fenced example is untouched');
    assert.match(res.text, /^- Live\n {2}- body$/m, 'the live line is fixed');
    assert.deepEqual(res.skipped, []);
    assert.equal(core.lintTextWith(res.text, vocab).some((f) => f.rule === 'card-style-inline-title'), false);
  });

  test('gives no fix to a finding only a code fence matches (the driver would refuse one anyway)', () => {
    // Whatever a lint-core rule reads, `fixLineIndex` never locates a fenced line, so there is no
    // edit for the driver to refuse; the driver's own inert refusal is pinned in the library's tests.
    const fake = (text) => (/^EDIT ME$/m.test(text) ? [{ slide: 1, rule: 'fake-fenced', severity: 'warning', line: 'EDIT ME', message: 'edit', autofixable: true, replaceLine: 'EDITED' }] : []);
    const src = `${FM}## A\n\n\`\`\`\nEDIT ME\n\`\`\`\n`;
    const res = fixDeck(src, { ...deps, lintTextWith: fake });
    assert.equal(res.text, src);
    assert.deepEqual([res.applied, res.skipped], [[], []]);
    assert.equal(core.applyFix(src, fake(src)[0]), null);
  });

  test('keeps the title slide when a fix empties the front matter (PR #2947), as a declared change', () => {
    const src = '---\nlogo-on: all\n---\n\n# Title\n\n---\n\n## Two\n';
    const res = core.fixAllDetailed(src, vocab);
    assert.equal(slides(res.text), slides(src));
    assert.match(res.text, /^# Title/m);
    assert.doesNotMatch(res.text, /logo-on/);
  });

  test('refuses a legacy fix that would change the slide count, and names it', () => {
    // A fake lint-core finding whose fix turns a line into a slide break. No shipped rule does this
    // today; the shape check is what makes sure none can.
    const fake = (text) => (text.includes('SPLIT ME') ? [{ slide: 1, rule: 'fake-split', severity: 'warning', line: 'SPLIT ME', message: 'split', autofixable: true, replaceLine: '---' }] : []);
    const src = `${FM}## A\n\nSPLIT ME\n`;
    const res = fixDeck(src, { ...deps, lintTextWith: fake });
    assert.equal(res.text, src);
    assert.deepEqual(res.skipped.map((s) => [s.rule, s.slide, s.reason]), [['fake-split', 1, 'broke-structure']]);
  });

  test('does nothing to a deck with nothing to fix', () => {
    const src = `${FM}## Clean\n\n- One\n  - body\n`;
    const res = core.fixAllDetailed(src, vocab);
    assert.equal(res.text, src);
    assert.deepEqual([res.applied, res.skipped, res.passes], [[], [], 0]);
  });
});

describe('after the bridge checker (2026-10-29)', () => {
  test('fixes the live line when an identical fenced copy sits ABOVE it, for the card and split rules', () => {
    for (const cls of ['cards-grid', 'split-panel']) {
      const src = `${FM}<!-- _class: ${cls} -->\n\n## H\n\n\`\`\`md\n- **Live.** body\n\`\`\`\n\n- **Live.** body\n`;
      const res = core.fixAllDetailed(src, vocab);
      assert.match(res.text, /```md\n- \*\*Live\.\*\* body\n```/, `${cls}: the fenced copy is untouched`);
      assert.match(res.text, /^- Live\n {2}- body$/m, `${cls}: the live line is fixed`);
      assert.deepEqual(res.skipped, [], cls);
    }
  });

  test('the one-click fix and Fix all both edit the live line, never its fenced copy above (any rule)', () => {
    const src = `${FM}## H\n\n\`\`\`md\n<!-- @meta{layout=kpu} -->\n\`\`\`\n\n<!-- @meta{layout=kpu} -->\n\nText.\n`;
    const f = core.lintTextWith(src, vocab).find((x) => x.rule === 'unknown-class' && x.autofixable);
    assert.ok(f, 'the typo is fixable');
    const want = src.replace(/\n\n<!-- @meta\{layout=kpu\} -->\n\nText/, '\n\n<!-- @meta{layout=kpi} -->\n\nText');
    assert.equal(core.applyFix(src, f), want);
    assert.equal(core.applyAllFixes(src, vocab), want);
    // A finding whose only match is fenced has no fix.
    const fencedOnly = `${FM}## H\n\n\`\`\`md\n- **Ex.** body\n\`\`\`\n`;
    assert.equal(core.applyFix(fencedOnly, { slide: 1, rule: 'card-style-inline-title', line: '- **Ex.** body', autofixable: true }), null);
  });

  test('a fenced copy of a fixable line is neither reported nor fixed; the live line still claims its fix', () => {
    // The gantt rule used to read past fences (followups.d/2966-p1), and its finding on the fenced
    // copy had to lose `autofixable` or the Studio's Fix all stayed enabled and did nothing. The rule
    // now reads the slide with fences blanked (test/unit/authoring/lint-fenced-lines.test.js).
    const src = `${FM}<!-- @meta{layout=gantt} -->\n\n## Plan\n\n\`\`\`md\n- Phase\n  - BX \`Q1->Q2\`\n\`\`\`\n\n- Phase\n  - BX \`Q1..Q2\`\n`;
    assert.deepEqual(core.lintTextWith(src, vocab).filter((x) => x.rule === 'gantt-retired-delimiter'), []);
    assert.equal(core.fixAllDetailed(src, vocab).text, src);
    const live = src.replace('```md\n- Phase\n  - BX `Q1->Q2`\n```\n\n', '').replace('`Q1..Q2`', '`Q1->Q2`');
    assert.deepEqual(core.lintTextWith(live, vocab).filter((x) => x.rule === 'gantt-retired-delimiter').map((x) => x.autofixable), [true]);
  });

  test('a finding only a fenced line matches never claims a fix (the guard behind every rule)', () => {
    // `withoutFencedFixes` stays as the backstop for a rule that regresses into reading a fence:
    // its finding keeps its report and loses `autofixable`, so Fix all is not offered for nothing.
    const fenced = `${FM}## H\n\n\`\`\`md\n- **Ex.** body\n\`\`\`\n`;
    const f = { slide: 1, rule: 'any', severity: 'warning', line: '- **Ex.** body', message: 'm', autofixable: true };
    assert.deepEqual(core.withoutFencedFixes(fenced, [f]).map((x) => x.autofixable), [false]);
    const live = `${FM}## H\n\n- **Ex.** body\n`;
    assert.deepEqual(core.withoutFencedFixes(live, [f]).map((x) => x.autofixable), [true]);
  });

  test('fixes sixty items on one slide, which needs a pass each (the old loop allowed 500)', () => {
    const items = Array.from({ length: 60 }, (_, i) => `- **T${i}.** body ${i}`).join('\n');
    const src = `${FM}${CARDS}${items}\n`;
    const res = core.fixAllDetailed(src, vocab);
    assert.equal(res.text, legacy(src));
    assert.equal(res.applied.length, 60);
    assert.deepEqual(res.skipped, []);
  });

  test('anchors the minimal edit at the line the fix names, so it cannot slide onto the next line', () => {
    // Deleting the first of two identical lines: an unanchored common head would put the edit on
    // the SECOND line.
    assert.deepEqual(trimEdit('A\nx\nx\nB', 'A\nx\nB', 2), { from: 2, to: 4, text: '' });
    assert.deepEqual(trimEdit('A\nx\nx\nB', 'A\nx\nB'), { from: 4, to: 6, text: '' });
  });

  test('names each fix by the slide lint-core numbered, read on the text of its own pass', () => {
    const src = `${FM}${CARDS}- **A.** one\n- **B.** two\n\n---\n\n${CARDS}- **C.** three\n`;
    const res = core.fixAllDetailed(src, vocab);
    assert.deepEqual(res.applied.map((a) => [a.slide, a.pass]).sort(), [[1, 1], [1, 2], [2, 1]]);
  });
});

describe('the bridge deck language', () => {
  test('counts slides as lint-core numbers them, and marks every fence inert', () => {
    const src = `${FM}## A\n\n\`\`\`yaml\nkey: 1\n---\n\`\`\`\n\n---\n\n## B\n`;
    const lang = deckLanguage(deps);
    const { tree } = lang.parse({ path: 'd.md', text: src, language: lang.id });
    const shape = lang.shape(tree, { text: src });
    assert.equal(shape.units, 2, 'the --- inside the fence is not a slide break');
    assert.deepEqual(shape.header, { from: 0, to: FM.length - 1 });
    assert.deepEqual(shape.inert, ['```yaml\nkey: 1\n---\n```']);
  });

  test('lattice-line lowers a whole-text rewrite to its one smallest edit', () => {
    assert.deepEqual(trimEdit('abcdef', 'abXYef'), { from: 2, to: 4, text: 'XY' });
    assert.deepEqual(trimEdit('aaa', 'aaaa'), { from: 3, to: 3, text: 'a' });
    assert.deepEqual(trimEdit('line\n', ''), { from: 0, to: 5, text: '' });
  });
});
