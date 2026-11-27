/**
 * Unit: W3 of engineering/decisions/2026-11-19-deterministic-authoring-audit.md — bold is
 * emphasis, never structure (R4). Pins the codemod's three halves:
 *
 *   · the detectors (`findBoldLeads`, `findBoldTheoremLabels` in lib/core/list-shapes.js) and the
 *     exact rewrite each one carries;
 *   · the `bold-lead` lint rule, its autofix through `applyAllFixes` (the Studio's Fix all and
 *     `lint:deck --fix`), and the `only` filter behind `lint:deck --fix --rule bold-lead`;
 *   · the engine side: the lift labels the WHOLE lead, so a bold first word never becomes the label.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { findBoldLeads, findBoldTheoremLabels, findInlineTitleBodyLine } = require('../../../lib/core/list-shapes');
const { findLabel } = require('../../../lib/core/slot-label-lift');
const { lintText, buildVocab } = require('../../../lib/authoring/lint');
const lintCore = require('../../../lib/authoring/lint-core');
const engine = require('../../../lib/engine');

const FM = '---\ntheme: indaco\n---\n\n';
const rewrites = (md) => findBoldLeads(md).map((h) => h.replaceLine);

describe('findBoldLeads: each bold-lead shape and its rewrite', () => {
  test('a whole-lead bold over a nested body loses the bold and the title punctuation', () => {
    assert.deepEqual(rewrites('- **What we must do.**\n  - Audit the tags.'), ['- What we must do']);
  });
  test('a bold title with its body on the same line nests the body', () => {
    assert.deepEqual(rewrites('- **Lead.** Detail sentence.'), ['- Lead\n  - Detail sentence.']);
  });
  test('an ordered item keeps its marker and nests to its text column', () => {
    assert.deepEqual(rewrites('12. **$4.2M** ARR'), ['12. $4.2M\n    - ARR']);
  });
  test('a separator after the bold run is dropped, not kept as the body', () => {
    assert.deepEqual(rewrites('- **shape** — $n \\times p$'), ['- shape\n  - $n \\times p$']);
  });
  test('trailing slots (a pill, a code chip) stay on the title line', () => {
    assert.deepEqual(rewrites('- **Pilot** {Live}'), ['- Pilot {Live}']);
    assert.deepEqual(rewrites('- **Owner** `Head of Product`'), ['- Owner `Head of Product`']);
  });
  test('a bold run with more text over a nested body is emphasis: not reported', () => {
    assert.deepEqual(findBoldLeads('- **Build** in region\n  - why'), []);
  });
  test('a nested item, a mid-sentence bold, a fenced line and a non-item are left alone', () => {
    assert.deepEqual(findBoldLeads('- plain **x**\n  - **nested** y\n```\n- **fenced** z\n```\n**not an item**'), []);
  });
  test('the rewrite is a fixed point: the rewritten text reports nothing', () => {
    const src = '- **A.** one\n- **B.**\n  - two\n1. **C** three';
    let text = src;
    for (const h of findBoldLeads(src).reverse()) {
      const lines = text.split('\n');
      lines.splice(h.index, 1, ...h.replaceLine.split('\n'));
      text = lines.join('\n');
    }
    assert.deepEqual(findBoldLeads(text), []);
  });
});

describe('findBoldTheoremLabels: a theorem card is labeled by its heading', () => {
  test('`> **Theorem.** statement` becomes a heading, a blank quote line and the statement', () => {
    assert.deepEqual(findBoldTheoremLabels('> **Theorem.** Let f be continuous.').map((h) => h.replaceLine),
      ['> ### Theorem.\n>\n> Let f be continuous.']);
  });
  test('only a card\'s FIRST line, never a bold run deeper in the quote', () => {
    assert.deepEqual(findBoldTheoremLabels('> ### Proof.\n>\n> **Hence** done.'), []);
  });
});

describe('card-style-inline-title no longer misfires on a nested body (W3)', () => {
  test('`- **Build** in region` over a nested body is not an inline title+body', () => {
    assert.equal(findInlineTitleBodyLine('- **Build** in region\n  - why'), null);
    assert.equal(findInlineTitleBodyLine('- **Build.** in region'), '- **Build.** in region');
  });
});

describe('the bold-lead rule and its fix', () => {
  const vocab = buildVocab();
  const deck = `${FM}<!-- @meta{layout=inventory} -->\n\n## Parts\n\n- **Planning.** Sets targets.\n- **Routing.** Assigns jobs.\n`;

  test('fires once per bold lead on a structural layout, as an autofixable warning', () => {
    const hits = lintText(deck, { vocab }).filter((f) => f.rule === 'bold-lead');
    assert.equal(hits.length, 2);
    for (const f of hits) {
      assert.equal(f.severity, 'warning');
      assert.equal(f.autofixable, true);
    }
  });
  test('does not fire on a prose layout, where bold is ordinary emphasis', () => {
    const prose = `${FM}<!-- @meta{layout=content} -->\n\n## Notes\n\n- **Planning.** Sets targets.\n`;
    assert.equal(lintText(prose, { vocab }).filter((f) => f.rule === 'bold-lead').length, 0);
  });
  test('fires on a math theorem card and a math matrix legend, not on the plain math legend', () => {
    const th = `${FM}<!-- @meta{layout=math, class=theorem} -->\n\n## T\n\n> **Theorem.** It holds.\n`;
    const mx = `${FM}<!-- @meta{layout=math, class=matrix} -->\n\n## M\n\n$$ X $$\n\n- **shape** — $n$\n`;
    const plain = `${FM}<!-- @meta{layout=math} -->\n\n## P\n\n$$ X $$\n\n- **$X$** — design matrix\n`;
    const count = (md) => lintText(md, { vocab }).filter((f) => f.rule === 'bold-lead').length;
    assert.equal(count(th), 1);
    assert.equal(count(mx), 1);
    assert.equal(count(plain), 0);
  });
  test('Fix all rewrites every bold lead to the nested form, and the result lints clean of it', () => {
    const fixed = lintCore.applyAllFixes(deck, vocab);
    assert.match(fixed, /^- Planning\n {2}- Sets targets\.$/m);
    assert.match(fixed, /^- Routing\n {2}- Assigns jobs\.$/m);
    assert.equal(lintText(fixed, { vocab }).filter((f) => f.rule === 'bold-lead').length, 0);
  });
  test('`only` limits the pass to the named rules (lint:deck --fix --rule bold-lead)', () => {
    const mixed = `${deck}\n---\n\n<!-- @meta{layout=content, class=guards-strict} -->\n\n## X\n\nBody.\n`;
    const { text } = lintCore.fixAllDetailed(mixed, vocab, undefined, ['bold-lead']);
    assert.match(text, /^- Planning$/m, 'the named rule was applied');
    assert.match(text, /guards-strict/, 'every other rule\'s fix was left alone');
  });
});

describe('the engine labels the whole lead; bold inside it is emphasis', () => {
  const html = (md) => String(engine.render(md).html);
  test('a bold first word does not become a decision tag on its own', () => {
    const out = html('<!-- _class: decision -->\n\n## H\n\n- **Build** in region\n  - why\n- Buy\n  - why\n');
    assert.match(out, /<span class="lat-label"><strong>Build<\/strong> in region<\/span>/);
  });
  test('an inventory row is lifted: its lead is the label and its detail stays nested', () => {
    const out = html('<!-- _class: inventory -->\n\n## H\n\n- Planning\n  - Sets targets.\n');
    assert.match(out, /<li><span class="lat-label">Planning<\/span>\s*<ul>\s*<li>Sets targets\.<\/li>/);
  });
  test('findLabel reads a balanced label, inner spans included', () => {
    const li = '<li><span class="lat-label"><span class="x">a</span> b</span><ul><li>c</li></ul></li>';
    assert.equal(findLabel(li).inner, '<span class="x">a</span> b');
    assert.equal(findLabel('<li><strong>no label</strong></li>'), null);
  });
});
