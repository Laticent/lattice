/**
 * The PANE contract — each component's `pane` manifest field (fit / form / stack / budget),
 * the shared spec both the carve and the linter read (lib/core/pane-spec.js), and the three
 * lint rules built on it (pane-fit, pane-overflow, pane-crowd). The carve's own behavior lives
 * in panes.test.js; this file pins the contract every component had to decide.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const components = require('../../../lib/components');
const spec = require('../../../lib/core/pane-spec');
const panes = require('../../../lib/core/panes');
const { lintText } = require('../../../lib/authoring/lint');
const { createEngine } = require('../../../lib/engine');

const ROOT = path.join(__dirname, '../../..');
const MANIFESTS = components.loadAll();
const BY_NAME = Object.fromEntries(MANIFESTS.map((m) => [m.name, m]));
const CATALOG = require('../../../lib/forms/cell/pane/pane-catalog.generated.js');

const paneRules = (md) => lintText(md).filter((f) => f.rule.startsWith('pane-'));
const slide = (a, b, layout = '') => `## T\n\n${layout ? `<!-- panes: ${layout} -->\n\n` : ''}<!-- pane: ${a.cls} -->\n\n${a.body}\n\n<!-- pane: ${b.cls} -->\n\n${b.body}\n`;
const items = (n) => Array.from({ length: n }, (_, i) => `- Point ${i + 1}`).join('\n');

test('every built-in component decides how it behaves in a pane', () => {
  for (const m of MANIFESTS) {
    assert.ok(m.pane, `${m.name} declares no pane field`);
    assert.ok('side' in m.pane && 'stack' in m.pane, `${m.name} declares no measured side/stack share`);
    if (m.pane.side === false && m.pane.stack === false) continue;
    assert.ok(m.pane.budget || m.pane.noBudget, `${m.name} declares neither a pane budget nor why it has none`);
    // A pane form names a real component that itself goes in a pane.
    if (m.pane.form) {
      assert.ok(BY_NAME[m.pane.form], `${m.name}: pane.form '${m.pane.form}' names no component`);
      const f = BY_NAME[m.pane.form].pane;
      assert.ok(!(f.side === false && f.stack === false), `${m.name}: pane.form '${m.pane.form}' fits no pane`);
    }
  }
});

test('the pane catalog is exactly the manifests\' side, stack and form', () => {
  for (const m of MANIFESTS) {
    assert.deepEqual(spec.specOf(CATALOG, m.name), { side: m.pane.side, stack: m.pane.stack }, m.name);
    assert.equal(panes.paneForm(m.name), m.pane.form || m.name, m.name);
  }
  // No row: an installed package, which fits any share both ways.
  assert.deepEqual(spec.specOf(CATALOG, 'acme-widget'), { side: 25, stack: 25 });
});

test('a measured budget stays within the slide capacity the component already ships', () => {
  for (const m of MANIFESTS) {
    const b = m.pane.budget;
    if (!b || !m.capacity?.hard) continue;
    assert.ok(b.side.hard <= m.capacity.hard, `${m.name}: pane side hard ${b.side.hard} > slide hard ${m.capacity.hard}`);
    if (b.stack) assert.ok(b.stack.hard <= m.capacity.hard, `${m.name}: pane stack hard ${b.stack.hard} > slide hard ${m.capacity.hard}`);
  }
});

test('the validator rejects a pane field that has not decided', () => {
  const base = BY_NAME.list;
  const errs = (pane) => components.validate({ ...base, pane }, 'x').filter((e) => e.includes('pane'));
  assert.equal(errs(base.pane).length, 0);
  const fits = { side: 50, stack: 50 };
  assert.ok(errs({ side: 'wide', stack: 50, noBudget: 'one thing only' }).length, 'a share is a number');
  assert.ok(errs({ side: 33, stack: 50, noBudget: 'one thing only' }).length, 'a share is in 5% steps');
  assert.ok(errs({ side: 80, stack: 50, noBudget: 'one thing only' }).length, 'a share is 25–75');
  assert.ok(errs({ stack: 50, noBudget: 'one thing only' }).length, 'side is declared');
  assert.ok(errs({ ...fits }).length, 'neither budget nor noBudget');
  assert.ok(errs({ ...fits, noBudget: 'one thing only', budget: base.pane.budget }).length, 'both');
  assert.ok(errs({ side: false, stack: false, noBudget: 'one thing only' }).length, 'a component that fits no pane declares nothing more');
  assert.ok(errs({ side: 50, stack: false, budget: base.pane.budget }).length, 'no stack counts when it does not stack');
  assert.ok(errs({ ...base.pane, budget: { ...base.pane.budget, side: { sweet: 5, hard: 3 } } }).length, 'sweet > hard');
  assert.ok(errs({ ...base.pane, budget: { ...base.pane.budget, at: 72 } }).length, 'budget.at is a share');
  assert.ok(errs({ ...base.pane, review: 'no' }).length, 'a review says why');
  const { note, ...noNote } = base.pane.budget;
  assert.ok(errs({ ...fits, budget: { ...noNote, basis: 'editorial' } }).length, 'editorial without a reason');
});

test('the carve and the linter read one layout parser', () => {
  assert.equal(panes.parseLayout, spec.parseLayout);
  assert.deepEqual(spec.parseLayout('stack 35/65 no-rule'), { direction: 'stack', a: 35, b: 65, rule: false });
  assert.match(spec.parseLayout('80/20').error, /25\/75/);
});

test('splitPaneMarkdown finds the two panes, and never a marker inside a fence', () => {
  const md = '## T\n\n<!-- pane: list -->\n\n- a\n\n```md\n<!-- pane: table -->\n```\n\n<!-- pane: content -->\n\nx\n\n<!-- pane: quote -->\n\ny\n';
  const out = spec.splitPaneMarkdown(md);
  assert.deepEqual(out.panes.map((p) => p.cls), ['list', 'content']);
  // A third marker folds into the second pane, as the carve folds it.
  assert.match(out.panes[1].markdown, /y/);
  assert.equal(spec.splitPaneMarkdown('## T\n\n<!-- pane: list -->\n\n- a\n'), null);
});

// The carve reads markdown-it's parsed tokens; the linter reads lines, running the part of
// CommonMark's block structure that decides whether a marker is a top-level HTML block
// (lib/core/pane-spec.js splitPaneMarkdown). Both must name the same panes on every slide.
function paneAgreement() {
  const e = createEngine();
  e.addThemes([{ name: 'lattice', css: fs.readFileSync(path.join(ROOT, 'dist/lattice.css'), 'utf8') }]);
  const { splitTopLevel } = require('../../../lib/authoring/slide-split');
  return (md) => {
    const carved = [...e.render(md).html.matchAll(/<lat-pane class="[^"]*" data-pane="([^"]*)"/g)].map((m) => m[1]);
    const linted = splitTopLevel(md).flatMap((sl) => spec.splitPaneMarkdown(sl)?.panes.map((p) => p.cls) || []);
    return { carved, linted };
  };
}

test('the linter finds exactly the panes the carve renders: every edge case the reviews found', () => {
  // A marker inside a nested fence, a list item, any of the seven HTML block types, a
  // blockquote or indented code (tabs included) is not a pane; one after inline HTML, a
  // paragraph a type-7 tag cannot interrupt, or a list that ended is.
  const agree = paneAgreement();
  const it = '- a\n- b\n- c';
  const P = '<!-- pane: list -->';
  const Q = '<!-- pane: content -->';
  const cases = {
 ord1paren:`1) lead\n   ${P}\n\n${it}\n\n${Q}\n\nx`,
 ord10:`10. lead\n    ${P}\n\n${it}\n\n${Q}\n\nx`,
 ord10_3sp:`10. lead\n   ${P}\n\n${it}\n\n${Q}\n\nx`,
 nested:`- a\n  - b\n    ${P}\n\n${it}\n\n${Q}\n\nx`,
 nested2:`- a\n  - b\n  ${P}\n\n${it}\n\n${Q}\n\nx`,
 listThenCol0NoBlank:`- a\n${P}\n\n${it}\n\n${Q}\n\nx`,
 listThenCol0Blank:`- a\n\n${P}\n\n${it}\n\n${Q}\n\nx`,
 listThenIndent1:`- a\n ${P}\n\n${it}\n\n${Q}\n\nx`,
 paraThen2dot:`lead\n2. foo\n   ${P}\n\n${it}\n\n${Q}\n\nx`,
 paraThenEmptyItem:`lead\n-\n${P}\n\n${it}\n\n${Q}\n\nx`,
 wideSpaceItem:`-     code\n  ${P}\n\n${it}\n\n${Q}\n\nx`,
 script:`<script>\n\n${P}\n</script>\n\n${it}\n\n${Q}\n\nx`,
 pre:`<pre>\n\n${P}\n</pre>\n\n${it}\n\n${Q}\n\nx`,
 style:`<style>\n\n${P}\n</style>\n\n${it}\n\n${Q}\n\nx`,
 mlcomment:`<!-- note\n\n${P}\n\n${it}\n\n${Q}\n\nx`,
 mlcomment2:`<!--\nstuff\n${P}\n\n${it}\n\n${Q}\n\nx`,
 php:`<?php\n\n${P}\n?>\n\n${it}\n\n${Q}\n\nx`,
 cdata:`<![CDATA[\n\n${P}\n]]>\n\n${it}\n\n${Q}\n\nx`,
 doctype:`<!DOCTYPE x\n${P}\n\n${it}\n\n${Q}\n\nx`,
 custom7paraInterrupt:`lead\n<custom-el>\n${P}\n\n${it}\n\n${Q}\n\nx`,
 inlineSpan:`<span>hi</span> there\n${P}\n\n${it}\n\n${Q}\n\nx`,
 boldLine:`<b>Note</b>\n${P}\n\n${it}\n\n${Q}\n\nx`,
 tab:`\t${P}\n\n${it}\n\n\t${Q}\n\nx`,
 tab2:`  \t${P}\n\n${it}\n\n${Q}\n\nx`,
 fenceInListThenCol0:`- a\n  \`\`\`\n${P}\n\n${it}\n\n${Q}\n\nx`,
 fenceInListClosed:`- a\n  \`\`\`\n  ${P}\n  \`\`\`\n\n${P}\n\n${it}\n\n${Q}\n\nx`,
 fenceListEnd:`- a\n\n  \`\`\`\n  x\n\n${P}\n\n${it}\n\n${Q}\n\nx`,
 blockquoteFence:`> \`\`\`\n${P}\n\n${it}\n\n${Q}\n\nx`,
 panesInHtml:`<div>\n<!-- panes: stack -->\n</div>\n\n${P}\n\n${it}\n\n${Q}\n\nx`,
 panesInPre:`<pre>\n\n<!-- panes: stack -->\n</pre>\n\n${P}\n\n${it}\n\n${Q}\n\nx`,
 htmlThenListItem:`<div>\n- a\n\n  ${P}\n\n${it}\n\n${Q}\n\nx`,
 unclosedFence:`\`\`\`\n${P}\n\n${it}\n\n${Q}\n\nx`,
 fenceCloseIndent4:`\`\`\`\n    \`\`\`\n${P}\n\`\`\`\n\n${P}\n\n${it}\n\n${Q}\n\nx`,
 table:`| a |\n|---|\n| ${P} |\n\n${P}\n\n${it}\n\n${Q}\n\nx`,
 setext:`${P}\n===\n\n${it}\n\n${Q}\n\nx`,
 closeDiv:`</div>\n${P}\n\n${it}\n\n${Q}\n\nx`,
 htmlCloseTagInline:`lead\n</custom>\n${P}\n\n${it}\n\n${Q}\n\nx`,
 // A bare `>`, a heading in a list item and an HTML block opening a list item open no
 // paragraph, so a type-7 tag after them is not a lazy continuation (fourth checker).
 // A comment block ends at `-->` only, as in markdown-it: `--!>` leaves it open.
 commentBangEnd:`<!-- a --!>\n${P}\n\n${it}\n\n${Q}\n\nx`,
 // An empty list item closes at a blank line, so an indented marker after it is top level.
 emptyItemBlank:`- <div>\n- \n\n   ${P}\n\n${it}\n\n${Q}\n\nx`,
 bareQuote:`>\n</span>\n${P}\n\n${it}\n\n${Q}\n\nx`,
 itemHeading:`- # Head\n</span>\n${P}\n\n${it}\n\n${Q}\n\nx`,
 itemHtml:`- <div>\n</span>\n<textarea>\n\n${P}\n\n${it}\n\n${Q}\n\nx`,
  };
  for (const [name, body] of Object.entries(cases)) {
    const { carved, linted } = agree(`## Heading.\n\n${body}\n`);
    assert.deepEqual(linted, carved, name);
  }
});

test('the linter finds exactly the panes the carve renders: 400 seeded random slides', () => {
  const agree = paneAgreement();
  let seed = 20260926;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const frags = ['', '', 'text line', '- item', '  - nested', '1. first', '2) second', '10. ten', '-', '*    wide',
    '  continued', '```', '~~~', '````md', '  ```', '<div>', '</div>', '<pre>', '</pre>', '<!-- note', '-->', '<?php',
    '?>', '<custom-el>', '<span>x</span> y', '<b>b</b>', '> quote', '    indented', '\tTabbed', '  \ttab2', '***',
    '<!-- pane: list -->', '<!-- pane: list -->', '  <!-- pane: list -->', '    <!-- pane: kpi -->', '<!-- pane: content -->',
    '<!-- pane: content -->', '<!-- panes: stack -->', '<![CDATA[', ']]>', '<script>', '</script>', '| a | b |', '|---|---|'];
  let withPanes = 0;
  for (let t = 0; t < 400; t++) {
    const lines = Array.from({ length: 4 + Math.floor(rnd() * 10) }, () => frags[Math.floor(rnd() * frags.length)]);
    const md = `## H\n\n${lines.join('\n')}\n`;
    const { carved, linted } = agree(md);
    if (carved.length) withPanes++;
    assert.deepEqual(linted, carved, JSON.stringify(lines));
  }
  assert.ok(withPanes >= 20, `only ${withPanes} slides carried panes — the generator stopped exercising the carve`);
});

test('a pane smaller than its basis scales its budget down, and a larger one never up', () => {
  const b = { side: { sweet: 4, hard: 6 }, stack: { sweet: 3, hard: 4 } };
  const half = { side: 25, stack: 25 };
  const side = (a) => spec.paneBudgetLimit(b, half, spec.parseLayout(`${a}/${100 - a}`), 0);
  assert.deepEqual(side(50), { sweet: 4, hard: 6 });
  assert.deepEqual(side(25), { sweet: 2, hard: 3 });
  assert.deepEqual(side(75), { sweet: 4, hard: 6 });
  assert.deepEqual(spec.paneBudgetLimit(b, half, spec.parseLayout('stack 25/75'), 0), { sweet: 1, hard: 2 });
  // A budget set at 65% (`at`) has its full count at 65%, and scales down below it.
  assert.deepEqual(spec.paneBudgetLimit({ ...b, at: 65 }, half, spec.parseLayout('65/35'), 0), { sweet: 4, hard: 6 });
  assert.deepEqual(spec.paneBudgetLimit({ ...b, at: 65 }, half, spec.parseLayout('50/50'), 0), { sweet: 3, hard: 4 });
  assert.equal(spec.paneBudgetLimit(b, half, spec.parseLayout('stack'), 0).hard, 4);
  assert.equal(spec.paneBudgetLimit({ side: b.side }, half, spec.parseLayout('stack'), 0), null);
});

test('arrangePanes: as written, re-oriented, or split — from each component\'s measured shares', () => {
  const specs = { a: { side: 35, stack: 50 }, b: { side: 25, stack: 30 }, c: { side: false, stack: 50 }, frame: { side: false, stack: false } };
  const at = (layout, cls) => spec.arrangePanes(specs, cls, spec.parseLayout(layout));
  assert.equal(at('40/60', ['a', 'b']).as, 'written');
  // a needs 35% side by side and has 30: stacked at the same shares, a needs 50% and has 30 — split.
  assert.equal(at('30/70', ['a', 'b']).as, 'split');
  // c never sits side by side, but stacks at 50%: the same 50/50 renders stacked.
  const turned = at('50/50', ['c', 'b']);
  assert.deepEqual([turned.as, turned.layout.direction], ['reoriented', 'stack']);
  assert.match(turned.why, /"c" does not read side by side/);
  // A whole-slide frame fits no pane: always split.
  assert.equal(at('50/50', ['frame', 'b']).as, 'split');
  // An installed package (no row) fits any share.
  assert.equal(at('25/75', ['acme-widget', 'b']).as, 'written');
});

test('lint: pane-arrange says when a slide will re-orient or split, and nothing when it renders as written', () => {
  const frame = paneRules(slide({ cls: 'title', body: '# Big' }, { cls: 'list', body: items(2) }));
  assert.deepEqual(frame.map((f) => f.rule), ['pane-arrange']);
  assert.match(frame[0].message, /splits into one slide per pane/);
  const code = '```js\nconst x = 1;\n```';
  const turned = paneRules(slide({ cls: 'code', body: code }, { cls: 'content', body: 'x' }));
  assert.deepEqual(turned.map((f) => f.rule), ['pane-arrange']);
  assert.match(turned[0].message, /render stacked/);
  assert.deepEqual(paneRules(slide({ cls: 'list', body: items(2) }, { cls: 'table', body: '| A | B |\n|---|---|\n| 1 | 2 |' }, '35/65')), []);
  // A pane that splits into its own slide is held to that component's SLIDE capacity.
  const own = paneRules(slide({ cls: 'kpi', body: '1. 42%\n   - Margin' }, { cls: 'list', body: items(20) }, 'stack'));
  assert.deepEqual(own.map((f) => f.rule), ['pane-arrange', 'pane-overflow']);
  assert.match(own[1].message, /becomes its own 'list' slide/);
});

test('lint: a pane past its budget is pane-overflow, past sweet is pane-crowd — per pane, not summed', () => {
  const hard = BY_NAME.list.pane.budget.side.hard;
  const sweet = BY_NAME.list.pane.budget.side.sweet;
  const over = paneRules(slide({ cls: 'list', body: items(hard + 1) }, { cls: 'content', body: 'x' }));
  assert.deepEqual(over.map((f) => f.rule), ['pane-overflow']);
  assert.match(over[0].message, new RegExp(`this pane has ${hard + 1}`));
  const crowd = paneRules(slide({ cls: 'list', body: items(sweet + 1) }, { cls: 'content', body: 'x' }));
  assert.deepEqual(crowd.map((f) => f.rule), ['pane-crowd']);
  // Two lists at their sweet count each are two comfortable panes, not one crowded slide.
  assert.equal(paneRules(slide({ cls: 'list', body: items(sweet) }, { cls: 'list', body: items(sweet) })).length, 0);
  // A narrower pane holds less: the same count that fits at 50% crowds at 25%.
  assert.ok(paneRules(slide({ cls: 'list', body: items(sweet) }, { cls: 'content', body: 'x' }, '25/75')).length);
});

test('lint: pane-layout names a ratio off the grid and a third marker', () => {
  const bad = lintText(slide({ cls: 'list', body: items(2) }, { cls: 'content', body: 'x' }, '80/20')).filter((f) => f.rule === 'pane-layout');
  assert.equal(bad.length, 1);
  assert.match(bad[0].message, /25\/75/);
  const three = lintText(`${slide({ cls: 'list', body: items(2) }, { cls: 'content', body: 'x' })}\n<!-- pane: quote -->\n\n> y\n`).filter((f) => f.rule === 'pane-layout');
  assert.match(three[0].message, /3 pane markers/);
});

test('lint: a correct pane of a fixed-size component is never warned (a 2x2 is always four)', () => {
  const quad = '- **A.**\n  - a\n- **B.**\n  - b\n- **C.**\n  - c\n- **D.**\n  - d';
  for (const layout of ['', '55/45', '65/35']) {
    assert.deepEqual(paneRules(slide({ cls: 'matrix-2x2', body: quad }, { cls: 'content', body: 'x' }, layout)), [], layout || '50/50');
  }
  // Every budget sits at or above its component's own minimum.
  for (const m of MANIFESTS) {
    const b = m.pane.budget;
    if (!b?.min) continue;
    for (const c of [b.side, b.stack].filter(Boolean)) assert.ok(c.sweet >= b.min, `${m.name}: sweet ${c.sweet} < min ${b.min}`);
  }
});

test('the Studio\'s lint runs the pane rules too: a vocab without pane data falls back to the baked table', () => {
  const core = require('../../../lib/authoring/lint-core');
  // Shaped like the Studio's vocab (docs/src/pages/studio.astro → buildVocabSets): names,
  // modifiers and capacity, no pane data.
  const studio = { names: new Set(MANIFESTS.map((m) => m.name)), modifiers: new Set() };
  const rules = (md, vocab) => core.lintTextWith(md, vocab).filter((f) => f.rule.startsWith('pane-')).map((f) => f.rule);
  const split = slide({ cls: 'kpi', body: '1. 42%\n   - Margin' }, { cls: 'list', body: items(2) }, 'stack');
  const crowded = slide({ cls: 'list', body: items(20) }, { cls: 'content', body: 'x' });
  assert.deepEqual(rules(split, studio), ['pane-arrange']);
  assert.deepEqual(rules(crowded, studio), ['pane-overflow']);
  // An EMPTY pane table is no table: it falls back too, rather than silencing every pane rule.
  assert.deepEqual(rules(split, { ...studio, paneSpec: {}, paneBudget: {} }), ['pane-arrange']);
  assert.deepEqual(rules(crowded, { ...studio, paneSpec: {}, paneBudget: {} }), ['pane-overflow']);
  // …and the baked table is exactly what buildVocab derives from the manifests.
  const baked = require('../../../lib/authoring/pane-lint.generated.js');
  const { paneSpec, paneBudget } = spec.paneVocab(MANIFESTS);
  assert.deepEqual(baked.budget, paneBudget);
  for (const m of MANIFESTS) assert.deepEqual(spec.specOf(baked.spec, m.name), spec.specOf(paneSpec, m.name), m.name);
});

test('lint: a component with no pane row (an installed package) fits any share, with no budget', () => {
  assert.equal(paneRules(slide({ cls: 'acme-widget', body: items(30) }, { cls: 'list', body: items(2) })).length, 0);
});

test('a panes slide the engine cannot lay out renders the way arrangePanes says — split or re-oriented', () => {
  const e = createEngine();
  e.addThemes([{ name: 'lattice', css: fs.readFileSync(path.join(ROOT, 'dist/lattice.css'), 'utf8') }]);
  const sections = (html) => [...html.matchAll(/<section\b[^>]*class="([^"]*)"/g)].map((m) => m[1].split(/\s+/));
  // A whole-slide frame fits no pane: two ordinary slides, the divider and the list.
  const split = e.render(slide({ cls: 'divider', body: 'Part two' }, { cls: 'list', body: items(2) })).html;
  const s = sections(split);
  assert.equal(s.length, 2);
  assert.ok(s[0].includes('divider') && s[1].includes('list'), JSON.stringify(s));
  assert.doesNotMatch(split, /lat-pane/);
  // Code never sits side by side but stacks at 50%: the same slide renders stacked.
  const turned = e.render(slide({ cls: 'code', body: '```js\nconst x = 1;\n```' }, { cls: 'content', body: 'x' })).html;
  assert.equal(sections(turned).length, 1);
  assert.match(turned, /<div class="lat-panes" data-panes="stack"/);
});

test('the engine, the source-side slide map and the lint agree on when a slide splits: 120 seeded pairings', () => {
  const { slideClassSpans } = require('../../../lib/core/slide-class-spans');
  const { paneSplitLine } = require('../../../lib/authoring/lint-core');
  const e = createEngine();
  e.addThemes([{ name: 'lattice', css: fs.readFileSync(path.join(ROOT, 'dist/lattice.css'), 'utf8') }]);
  let seed = 20260927;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
  // Each shape of fit: both ways, side only, stack only, neither, and a component with no row.
  const bodies = { list: '- One\n- Two', bar: '- A `4`\n- B `7`', kpi: '1. 42%\n   - Margin', code: '```js\nconst x = 1;\n```',
    table: '| a | b |\n|---|---|\n| 1 | 2 |', pricing: '- Basic\n  - $9', content: 'Prose.', 'no-such-thing': 'Text.' };
  const layouts = ['', '<!-- panes: 25/75 -->\n', '<!-- panes: 65/35 -->\n', '<!-- panes: stack -->\n', '<!-- panes: stack 30/70 -->\n', '<!-- panes: 30/60 -->\n'];
  const spots = ['', '<!-- _class: dark -->\n', '<!-- _class: glossary -->\n'];
  const counts = { 1: 0, 2: 0 };
  for (let t = 0; t < 120; t++) {
    const [a, b] = [pick(Object.keys(bodies)), pick(Object.keys(bodies))];
    const size = pick(['hd', 'hd', 'hd', 'portrait', 'square']);
    const spot = pick(spots);
    const tail = rnd() < 0.3 ? `\n${spot || '<!-- _footer: F -->\n'}` : '';
    const slide = `${rnd() < 0.5 ? spot : ''}## T\n\n${pick(layouts)}<!-- pane: ${a} -->\n\n${bodies[a]}\n\n<!-- pane: ${b} -->\n\n${bodies[b]}\n${tail}`;
    const src = `---\nsize: ${size}\n---\n\n${slide}`;
    const label = JSON.stringify(src);
    const rendered = [...e.render(src).html.matchAll(/<section\b[^>]*class="([^"]*)"/g)].map((m) => m[1].split(/\s+/));
    const spans = slideClassSpans(src).spans;
    assert.equal(spans.length, rendered.length, `spans vs engine: ${label}`);
    spans.forEach((sp, i) => {
      for (const c of sp.slideClass.split(/\s+/).filter(Boolean)) assert.ok(rendered[i].includes(c), `page ${i} lacks '${c}': ${label}`);
    });
    assert.equal(paneSplitLine(slide, src) >= 0, rendered.length === 2, `lint vs engine: ${label}`);
    counts[rendered.length]++;
  }
  // The generator reaches both outcomes, so neither half of the agreement is vacuous.
  assert.ok(counts[1] >= 20 && counts[2] >= 20, JSON.stringify(counts));
});
