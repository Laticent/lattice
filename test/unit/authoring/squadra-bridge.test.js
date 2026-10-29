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
const CARDS = '<!-- _class: cards-grid -->\n\n## H\n\n';
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
    const src = `${FM}## H\n\n\`\`\`md\n<!-- _class: kpu -->\n\`\`\`\n\n<!-- _class: kpu -->\n\nText.\n`;
    const f = core.lintTextWith(src, vocab).find((x) => x.rule === 'unknown-class' && x.autofixable);
    assert.ok(f, 'the typo is fixable');
    const want = src.replace(/\n\n<!-- _class: kpu -->\n\nText/, '\n\n<!-- _class: kpi -->\n\nText');
    assert.equal(core.applyFix(src, f), want);
    assert.equal(core.applyAllFixes(src, vocab), want);
    // A finding whose only match is fenced has no fix.
    const fencedOnly = `${FM}## H\n\n\`\`\`md\n- **Ex.** body\n\`\`\`\n`;
    assert.equal(core.applyFix(fencedOnly, { slide: 1, rule: 'card-style-inline-title', line: '- **Ex.** body', autofixable: true }), null);
  });

  test('a finding only a fenced line matches does not claim a fix, so Fix all is not offered for it', () => {
    // The gantt rule still reads past fences (followups.d/2966-p1). Its finding on the fenced copy
    // has no line `applyFix` may edit, so it must not say `autofixable`, or the Studio's Fix all
    // stays enabled and does nothing.
    const src = `${FM}<!-- _class: gantt -->\n\n## Plan\n\n\`\`\`md\n- Phase\n  - BX \`Q1->Q2\`\n\`\`\`\n\n- Phase\n  - BX \`Q1..Q2\`\n`;
    const f = core.lintTextWith(src, vocab).filter((x) => x.rule === 'gantt-retired-delimiter');
    assert.deepEqual(f.map((x) => x.autofixable), [false]);
    assert.equal(core.fixAllDetailed(src, vocab).text, src);
    // The same line, live, still claims its fix.
    const live = src.replace('```md\n- Phase\n  - BX `Q1->Q2`\n```\n\n', '').replace('`Q1..Q2`', '`Q1->Q2`');
    assert.deepEqual(core.lintTextWith(live, vocab).filter((x) => x.rule === 'gantt-retired-delimiter').map((x) => x.autofixable), [true]);
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
