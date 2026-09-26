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
    if (m.pane.fit === 'none') continue;
    assert.ok(m.pane.budget || m.pane.noBudget, `${m.name} declares neither a pane budget nor why it has none`);
    // A pane form names a real component that itself goes in a pane.
    if (m.pane.form) {
      assert.ok(BY_NAME[m.pane.form], `${m.name}: pane.form '${m.pane.form}' names no component`);
      assert.notEqual(BY_NAME[m.pane.form].pane.fit, 'none', `${m.name}: pane.form '${m.pane.form}' opts out of panes`);
    }
  }
});

test('the pane catalog is exactly the manifests\' fit, form and stack (default rows left out)', () => {
  for (const m of MANIFESTS) {
    // What the carve reads — a missing row is the default `half` that stacks.
    assert.deepEqual(spec.specOf(CATALOG, m.name), { fit: m.pane.fit, stack: m.pane.stack !== false }, m.name);
    assert.equal(panes.paneForm(m.name), m.pane.form || m.name, m.name);
  }
  // No row restates the default.
  for (const [name, row] of Object.entries(CATALOG)) {
    assert.ok(row.fit !== 'half' || row.form || row.stack === false, `${name} restates the default`);
  }
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
  assert.ok(errs({ fit: 'wide-ish' }).length, 'unknown fit');
  assert.ok(errs({ fit: 'half' }).length, 'neither budget nor noBudget');
  assert.ok(errs({ fit: 'half', noBudget: 'one thing only', budget: base.pane.budget }).length, 'both');
  assert.ok(errs({ fit: 'none', noBudget: 'one thing only' }).length, 'an opted-out component declares nothing more');
  assert.ok(errs({ fit: 'half', stack: true, noBudget: 'one thing only' }).length, 'stack is absent or false');
  assert.ok(errs({ fit: 'half', stack: false, budget: base.pane.budget }).length, 'no stack counts when it does not stack');
  assert.ok(errs({ ...base.pane, budget: { ...base.pane.budget, side: { sweet: 5, hard: 3 } } }).length, 'sweet > hard');
  const { note, ...noNote } = base.pane.budget;
  assert.ok(errs({ fit: 'half', budget: { ...noNote, basis: 'editorial' } }).length, 'editorial without a reason');
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

test('the linter finds exactly the panes the carve renders, on every block-level edge case', () => {
  // The carve reads parsed tokens; the linter reads lines. Each case is rendered through the
  // engine and the two must name the same panes — or both none. A marker inside a nested
  // fence, a list item, an HTML block, a blockquote or an indented code block is not a pane.
  const e = createEngine();
  e.addThemes([{ name: 'lattice', css: fs.readFileSync(path.join(ROOT, 'dist/lattice.css'), 'utf8') }]);
  const it = items(3);
  const cases = {
    plain: `<!-- pane: list -->\n\n${it}\n\n<!-- pane: content -->\n\nx`,
    indent3: `   <!-- pane: list -->\n\n${it}\n\n   <!-- pane: content -->\n\nx`,
    indent4: `    <!-- pane: list -->\n\n${it}\n\n    <!-- pane: content -->\n\nx`,
    inList: `- lead\n\n  <!-- pane: list -->\n\n${it}\n\n  <!-- pane: content -->\n\n  x`,
    inHtml: `<div>\n<!-- pane: list -->\n</div>\n\n${it}\n\n<div>\n<!-- pane: content -->\n</div>\n\nx`,
    quote: `> <!-- pane: list -->\n\n${it}\n\n> <!-- pane: content -->\n\nx`,
    tildeFence: `~~~\n<!-- pane: kpi -->\n~~~\n\n<!-- pane: list -->\n\n${it}\n\n<!-- pane: content -->\n\nx`,
    nestedFence: `\`\`\`\`md\n\`\`\`\n<!-- pane: kpi -->\n\`\`\`\n<!-- pane: kpi -->\n\`\`\`\`\n\n<!-- pane: list -->\n\n${it}\n\n<!-- pane: content -->\n\nx`,
    crlf: `<!-- pane: list -->\r\n\r\n${it.replace(/\n/g, '\r\n')}\r\n\r\n<!-- pane: content -->\r\n\r\nx`,
    afterParagraph: `lead text\n<!-- pane: list -->\n\n${it}\n\n<!-- pane: content -->\n\nx`,
  };
  for (const [name, body] of Object.entries(cases)) {
    const slideMd = `## Heading.\n\n${body}\n`;
    const html = e.render(slideMd).html;
    const carved = [...html.matchAll(/<lat-pane class="[^"]*" data-pane="([^"]*)"/g)].map((m) => m[1]);
    const linted = spec.splitPaneMarkdown(slideMd)?.panes.map((p) => p.cls) || [];
    assert.deepEqual(linted, carved, name);
  }
});

test('a pane smaller than its basis scales its budget down, and a larger one never up', () => {
  const b = { side: { sweet: 4, hard: 6 }, stack: { sweet: 3, hard: 4 } };
  const half = { fit: 'half', stack: true };
  const side = (a) => spec.paneBudgetLimit(b, half, spec.parseLayout(`${a}/${100 - a}`), 0);
  assert.deepEqual(side(50), { sweet: 4, hard: 6 });
  assert.deepEqual(side(25), { sweet: 2, hard: 3 });
  assert.deepEqual(side(75), { sweet: 4, hard: 6 });
  assert.deepEqual(spec.paneBudgetLimit(b, half, spec.parseLayout('stack 25/75'), 0), { sweet: 1, hard: 2 });
  // A wide component is budgeted at 65%, so 65% is its full budget.
  assert.deepEqual(spec.paneBudgetLimit(b, { fit: 'wide', stack: true }, spec.parseLayout('65/35'), 0), { sweet: 4, hard: 6 });
  assert.equal(spec.paneBudgetLimit(b, { fit: 'half', stack: false }, spec.parseLayout('stack'), 0).hard, 4);
  assert.equal(spec.paneBudgetLimit({ side: b.side }, half, spec.parseLayout('stack'), 0), null);
});

test('lint: pane-fit names an opted-out, a too-narrow and a stacked-but-cannot pane', () => {
  const optedOut = paneRules(slide({ cls: 'title', body: '# Big' }, { cls: 'list', body: items(2) }));
  assert.deepEqual(optedOut.map((f) => [f.rule, f.classToken]), [['pane-fit', 'title']]);
  const narrow = paneRules(slide({ cls: 'list', body: items(2) }, { cls: 'table', body: '| A | B |\n|---|---|\n| 1 | 2 |' }, '60/40'));
  assert.deepEqual(narrow.map((f) => [f.rule, f.classToken]), [['pane-fit', 'table']]);
  assert.match(narrow[0].message, /65% share/);
  assert.equal(paneRules(slide({ cls: 'list', body: items(2) }, { cls: 'table', body: '| A | B |\n|---|---|\n| 1 | 2 |' }, '35/65')).length, 0);
  const stacked = paneRules(slide({ cls: 'kpi', body: '1. 42%\n   - Margin' }, { cls: 'list', body: items(2) }, 'stack'));
  assert.deepEqual(stacked.map((f) => [f.rule, f.classToken]), [['pane-fit', 'kpi']]);
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
  for (const layout of ['', '40/60', 'stack', 'stack 35/65']) {
    assert.deepEqual(paneRules(slide({ cls: 'matrix-2x2', body: quad }, { cls: 'content', body: 'x' }, layout)), [], layout || '50/50');
  }
  // Every budget sits at or above its component's own minimum.
  for (const m of MANIFESTS) {
    const b = m.pane.budget;
    if (!b?.min) continue;
    for (const c of [b.side, b.stack].filter(Boolean)) assert.ok(c.sweet >= b.min, `${m.name}: sweet ${c.sweet} < min ${b.min}`);
  }
});

test('lint: a component with no pane row (an installed package) is a half with no budget', () => {
  assert.equal(paneRules(slide({ cls: 'acme-widget', body: items(30) }, { cls: 'list', body: items(2) })).length, 0);
});

test('the carve renders an opted-out component as content, and keeps a component class off the host', () => {
  const e = createEngine();
  e.addThemes([{ name: 'lattice', css: fs.readFileSync(path.join(ROOT, 'dist/lattice.css'), 'utf8') }]);
  const html = e.render(slide({ cls: 'divider', body: 'Part two' }, { cls: 'list', body: items(2) })).html;
  // It renders AS content; `data-pane` keeps what the author wrote.
  assert.match(html, /<lat-pane class="content form" data-pane="divider"/);
  assert.doesNotMatch(html, /<lat-pane class="divider/);
});
