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
    assert.deepEqual(rewrites('12. **Plan.** Ship it'), ['12. Plan\n    - Ship it']);
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
  test('a nested item, a mid-sentence bold and a non-item are left alone', () => {
    assert.deepEqual(findBoldLeads('- plain **x**\n  - **nested** y\n**not an item**'), []);
  });
  test('a bold word that opens a phrase is emphasis: not split (red team / checker, W3 round 2)', () => {
    assert.deepEqual(findBoldLeads('- **Faster** onboarding for every rep'), []);
    assert.deepEqual(findBoldLeads('- **A** and **B** together carry it.'), []);
  });
  test('a question or exclamation keeps its mark in the title', () => {
    assert.deepEqual(rewrites('- **Why now?** The window closes.'), ['- Why now?\n  - The window closes.']);
  });
  test('`***bold italic***` is left alone, never half-rewritten into stray asterisks', () => {
    assert.deepEqual(findBoldLeads('- ***Bold italic*** lead text'), []);
    assert.deepEqual(findBoldTheoremLabels('> ***Theorem.*** It holds.'), []);
  });
  test('a line its masked body changed (a note, fenced code) is skipped; the others are read raw', () => {
    // The body is the slide with comments and fences blanked, line for line (lint-core `renderedBody`).
    const slide = '<!--\n- **Say.** this loudly.\n-->\n```\n- **Code.** z\n```\n<!-- note -->\n- **Lead.** detail';
    const body = slide.replace(/<!--[\s\S]*?-->|```[\s\S]*?```/g, (m) => m.replace(/[^\n]/g, ' '));
    assert.deepEqual(findBoldLeads(slide, { body }).map((h) => h.replaceLine), ['- Lead\n  - detail']);
    assert.deepEqual(findBoldTheoremLabels('<!-- > **Theorem.** x -->', '                         '), []);
  });
  test('on a value layout the bold run was the value: `1. **$4.2M** ARR` splits, with or without a body', () => {
    const r = (md) => findBoldLeads(md, { tagLayout: true }).map((h) => h.replaceLine);
    assert.deepEqual(r('1. **$4.2M** ARR'), ['1. $4.2M\n   - ARR']);
    assert.deepEqual(r('1. **$4.2M** ARR\n   - up nine percent'), ['1. $4.2M\n   - ARR']);
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

  test('a title with its body on the same line is an ERROR: the row now renders as one title', () => {
    const hits = lintText(deck, { vocab }).filter((f) => f.rule === 'bold-lead');
    assert.equal(hits.length, 2);
    for (const f of hits) {
      assert.equal(f.severity, 'error');
      assert.equal(f.autofixable, true);
    }
  });
  test('a speaker note and fenced code on the slide are never reported or rewritten', () => {
    const md = `${FM}<!-- @meta{layout=inventory} -->\n\n## Parts\n\n<!--\n- **Say.** this loudly.\n-->\n\n\`\`\`md\n- **Code.** sample\n\`\`\`\n\n- **Lead.** detail\n`;
    const hits = lintText(md, { vocab }).filter((f) => f.rule === 'bold-lead');
    assert.deepEqual(hits.map((f) => f.line), ['- **Lead.** detail']);
    const fixed = lintCore.applyAllFixes(md, vocab);
    assert.match(fixed, /- \*\*Say\.\*\* this loudly\./);
    assert.match(fixed, /- \*\*Code\.\*\* sample/);
    assert.match(fixed, /^- Lead\n {2}- detail$/m);
  });
  test('a wholly bold lead over a nested body is a WARNING: it renders the same', () => {
    const md = `${FM}<!-- @meta{layout=inventory} -->\n\n## Parts\n\n- **Planning.**\n  - Sets targets.\n`;
    const hits = lintText(md, { vocab }).filter((f) => f.rule === 'bold-lead');
    assert.deepEqual(hits.map((f) => f.severity), ['warning']);
  });
  test('a corner-tag layout reports `- **A** rest` over a body: the tag would read the whole sentence', () => {
    const md = `${FM}<!-- @meta{layout=decision} -->\n\n## D\n\n- **Build** — own the roadmap\n  - Slower start.\n- Buy\n  - Faster.\n`;
    const hits = lintText(md, { vocab }).filter((f) => f.rule === 'bold-lead');
    assert.equal(hits.length, 1);
    assert.equal(hits[0].severity, 'error');
    const fixed = lintCore.applyAllFixes(md, vocab);
    assert.match(fixed, /^- Build\n {2}- own the roadmap\n {2}- Slower start\.$/m, 'the rest becomes the first body line');
  });
  test('the same shape on a card layout is emphasis inside the title: not reported', () => {
    const md = `${FM}<!-- @meta{layout=cards-grid} -->\n\n## C\n\n- **Routing** is live\n  - Vans take the shortest route.\n- Parts\n  - Daily.\n`;
    assert.equal(lintText(md, { vocab }).filter((f) => f.rule === 'bold-lead').length, 0);
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
  test('a kpi `1. **$4.2M** ARR` over a body is an error, and the fix keeps ARR as the caption', () => {
    const md = `${FM}<!-- @meta{layout=kpi} -->\n\n## K\n\n1. **$4.2M** ARR\n   - up nine percent\n2. 42%\n   - Gross margin\n`;
    const hits = lintText(md, { vocab }).filter((f) => f.rule === 'bold-lead');
    assert.deepEqual(hits.map((f) => f.severity), ['error']);
    assert.match(lintCore.applyAllFixes(md, vocab), /^1\. \$4\.2M\n {3}- ARR\n {3}- up nine percent$/m);
  });
  test('the card rule\'s fix keeps a pill on the title line and drops a dash separator', () => {
    const pill = `${FM}<!-- @meta{layout=cards-grid} -->\n\n## C\n\n- **Pilot.** {Live} body\n- **Ends** — dash body\n`;
    const fixed = lintCore.applyAllFixes(pill, vocab);
    assert.match(fixed, /^- Ends\n {2}- dash body$/m);
    assert.doesNotMatch(fixed, /- — /);
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
  test('an un-migrated inventory row degrades to body text with a bold word, not one long title', () => {
    // The W3 newcomers (inventory, citation-card, math matrix) label only an item with a nested body.
    const out = html('<!-- _class: inventory -->\n\n## H\n\n- **Lead.** detail here\n- Plain\n  - body\n');
    assert.match(out, /<li><strong>Lead\.<\/strong> detail here<\/li>/);
    assert.match(out, /<li><span class="lat-label">Plain<\/span>/);
  });
  test('an existing slot layout still labels a lead with no nested body (a kpi value may stand alone)', () => {
    assert.match(html('<!-- _class: kpi -->\n\n## K\n\n1. $2.4B\n'), /<span class="lat-label">\$2\.4B<\/span>/);
  });
  test('a bold word in a word cloud is drawn (a <tspan>), not dropped as an unknown SVG element', () => {
    const out = html('<!-- _class: word-cloud -->\n\n## W\n\n- **pricing** `5`\n- security `3`\n');
    assert.match(out, /<text class="wc-word"[^>]*><tspan dominant-baseline="central" font-weight="bold">pricing<\/tspan><\/text>/);
    assert.doesNotMatch(out, /<text[^>]*><strong>/);
  });
  test('a bold kanban lane is still its lane: `**Done**` keeps the done state', () => {
    const out = html('<!-- _class: kanban -->\n\n## K\n\n- Doing\n  - a `S`\n- **Done**\n  - b `S`\n');
    assert.match(out, /class="kanban-column" data-done[^>]*data-label="Done"/);
  });
  test('list-tabular keeps a bold-led name as ONE grid cell (an inline run), its value a sibling', () => {
    const run = require('../../../lib/transformers/inline-run.js');
    const out = run.applyToHtml(html('<!-- _class: list-tabular -->\n\n## L\n\n1. **Board** approval `Q3`\n2. Migration `Q4`\n'));
    assert.match(out, /<li><span class="lat-run"><strong>Board<\/strong> approval <\/span><code>Q3<\/code><\/li>/);
  });
  test('findLabel reads a balanced label, inner spans included', () => {
    const li = '<li><span class="lat-label"><span class="x">a</span> b</span><ul><li>c</li></ul></li>';
    assert.equal(findLabel(li).inner, '<span class="x">a</span> b');
    assert.equal(findLabel('<li><strong>no label</strong></li>'), null);
  });
});
