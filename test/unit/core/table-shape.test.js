const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const {
  tableShape, resolveReflow, cellKind, uniformity, labelText, REFLOW, REFLOW_CLASS,
} = require('../../../lib/core/table-shape.js');
const { applyToDom } = require('../../../lib/runtime/table-shape-dom.js');

const ROOT = path.resolve(__dirname, '../../..');

// ── the kinds ────────────────────────────────────────────────────────────────
// One table per kind, written the way a deck writes it. Each pins the verdict the design
// names for that kind (engineering/decisions/2026-11-03-responsive-tables.md).

const KINDS = {
  records: {
    headers: ['Name', 'Role', 'Location', 'Since'],
    rows: [['Ada Okafor', 'Engineering lead', 'Lagos', '2019'], ['Priya Raman', 'Design director', 'Bengaluru', '2021'], ['Tomás Ruiz', 'Product manager', 'Madrid', '2020']],
  },
  keyvalue: {
    headers: ['Spec', 'Value'],
    rows: [['Throughput', '40 Gb/s sustained'], ['Power draw', '180 W typical'], ['Warranty', 'Five years']],
  },
  periods: {
    headers: ['Metric', 'Q1', 'Q2', 'Q3', 'Q4'],
    rows: [['Revenue ($M)', '40.2', '44.8', '51.3', '58.0'], ['Gross margin', '61%', '62%', '62%', '63%']],
  },
  options: {
    headers: ['Criterion', 'Plan A', '**Plan B**', 'Plan C'],
    rows: [['Price per seat', '$12', '$24', '$48'], ['Single sign-on', 'No', 'Yes', 'Yes'], ['Support', 'Email', 'Chat, 8 hours', 'Phone, 24/7']],
  },
  ranked: {
    headers: ['Rank', 'Account', 'Industry', 'ARR ($K)'],
    rows: [['1', 'Northwind', 'Logistics', '1,240'], ['2', 'Contoso', 'Retail', '980'], ['3', 'Fabrikam', 'Manufacturing', '860']],
  },
  schedule: {
    headers: ['Date', 'Milestone', 'Owner'],
    rows: [['12 Jan', 'Freeze the old schema', 'Ada Okafor'], ['2 Feb', 'Dual-write to both stores', 'Tomás Ruiz'], ['23 Feb', 'Backfill and verify', 'Nia Brooks']],
  },
  prose: {
    headers: ['Risk', 'Impact', 'Mitigation'],
    rows: [
      ['Vendor lock-in', 'Migration costs rise every single year that we choose to wait.', 'Abstract the storage layer behind one interface by the third quarter.'],
      ['Key-person risk', 'Two engineers hold all of the billing knowledge between them today.', 'Pair rotations and a written runbook for every billing procedure we run.'],
    ],
  },
};

for (const [kind, table] of Object.entries(KINDS)) {
  test(`a ${kind} table is named ${kind}`, () => {
    assert.equal(tableShape(table), kind);
  });
}

test('which way the values line up decides row labels: an option table reads by row', () => {
  // Each row holds one kind (prices, marks), each column a mix — the signal the kernel's
  // whole row-label decision rests on.
  const { options } = KINDS;
  const rowU = uniformity(options.rows.map((r) => r.slice(1)));
  const colU = uniformity(options.headers.slice(1).map((_, i) => options.rows.map((r) => r[i + 1])));
  assert.ok(rowU > colU, `rows ${rowU} should be more uniform than columns ${colU}`);
});

test('a record table reads by column', () => {
  const { records } = KINDS;
  const rowU = uniformity(records.rows.map((r) => r.slice(1)));
  const colU = uniformity(records.headers.slice(1).map((_, i) => records.rows.map((r) => r[i + 1])));
  assert.ok(colU > rowU, `columns ${colU} should be more uniform than rows ${rowU}`);
});

test('nothing to judge returns null and never throws', () => {
  assert.equal(tableShape(), null);
  assert.equal(tableShape({ headers: ['Only'], rows: [['one']] }), null);
  assert.equal(tableShape({ headers: ['A', 'B'], rows: [] }), null);
  assert.equal(tableShape({ headers: ['A', 'B', 'C'], rows: [['x']] }) !== undefined, true);
});

test('cell kinds: placeholders are skipped, marks, numbers and dates are told apart', () => {
  assert.equal(cellKind('—'), null);
  assert.equal(cellKind(''), null);
  assert.equal(cellKind('Yes'), 'mark');
  assert.equal(cellKind('$48'), 'num');
  assert.equal(cellKind('12 Jan'), 'date');
  assert.equal(cellKind('Engineering lead'), 'short');
  assert.equal(cellKind('Migration costs rise every year we wait.'), 'long');
});

// ── what this change lays out ────────────────────────────────────────────────

test('records and prose become cards, key-value becomes pairs, every other kind keeps its table', () => {
  assert.deepEqual({ ...REFLOW }, { records: 'cards', prose: 'cards', keyvalue: 'pairs' });
  assert.equal(resolveReflow([], KINDS.records), 'cards');
  assert.equal(resolveReflow([], KINDS.prose), 'cards');
  assert.equal(resolveReflow([], KINDS.keyvalue), 'pairs');
  for (const k of ['periods', 'options', 'ranked', 'schedule']) assert.equal(resolveReflow([], KINDS[k]), null, k);
});

test('slide modifiers overrule the measurement, and no-table-reflow wins a slide carrying more than one', () => {
  assert.equal(resolveReflow(['table-cards'], KINDS.periods), 'cards');
  assert.equal(resolveReflow(['table-pairs'], KINDS.records), 'pairs');
  assert.equal(resolveReflow(['no-table-reflow'], KINDS.records), null);
  assert.equal(resolveReflow(['table-cards', 'no-table-reflow'], KINDS.records), null);
  assert.equal(resolveReflow('not an array', KINDS.records), 'cards');
});

test('a cell label is its header as plain text', () => {
  assert.equal(labelText('**Plan B**'), 'Plan B');
  assert.equal(labelText('  `ARR`  ($K) '), 'ARR ($K)');
});

// ── the DOM mirror ───────────────────────────────────────────────────────────

function domOf(html) {
  const dom = new JSDOM(`<body>${html}</body>`);
  applyToDom(dom.window.document);
  return dom.window.document;
}
const tableHtml = ({ headers, rows }) =>
  `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

test('applyToDom stamps the verdict, the class, the roles and every cell label', () => {
  const doc = domOf(`<section class="content"><div class="cell-stage">${tableHtml(KINDS.records)}</div></section>`);
  const t = doc.querySelector('table');
  assert.equal(t.getAttribute('data-lat-reflow'), 'cards');
  assert.ok(t.classList.contains(REFLOW_CLASS.cards));
  assert.equal(t.getAttribute('role'), 'table');
  assert.deepEqual([...t.querySelectorAll('tbody tr:first-child td')].map((td) => td.getAttribute('data-lat-col')), ['Name', 'Role', 'Location', 'Since']);
  assert.equal(t.querySelector('th').getAttribute('role'), 'columnheader');
  assert.equal(t.querySelector('td').getAttribute('role'), 'cell');
});

test('applyToDom marks a table that keeps its shape, and labels none of its cells', () => {
  const doc = domOf(`<section class="content">${tableHtml(KINDS.periods)}</section>`);
  const t = doc.querySelector('table');
  assert.equal(t.getAttribute('data-lat-reflow'), 'none');
  assert.equal(t.querySelector('td').hasAttribute('data-lat-col'), false);
  assert.equal(t.hasAttribute('role'), false);
});

test('applyToDom is idempotent and honors the slide override', () => {
  const doc = domOf(`<section class="content no-table-reflow">${tableHtml(KINDS.records)}</section>`);
  const t = doc.querySelector('table');
  assert.equal(t.getAttribute('data-lat-reflow'), 'none');
  applyToDom(doc);
  assert.equal(t.getAttribute('data-lat-reflow'), 'none');
});

// ── the token path ───────────────────────────────────────────────────────────

test('the engine stamps the same verdicts on a rendered deck, on any slide', () => {
  const { createEngine } = require('../../../lib/engine');
  const deck = [
    '---', 'theme: indaco', '---', '', '## Two tables', '',
    '| Name | Role | Location |', '|---|---|---|', '| Ada | Lead | Lagos |', '| Priya | Director | Bengaluru |', '',
    '| Spec | Value |', '|---|---|', '| Power | 180 W |', '| Size | 1U |',
  ].join('\n');
  const doc = new JSDOM(createEngine().render(deck).html).window.document;
  const tables = [...doc.querySelectorAll('section table')];
  assert.deepEqual(tables.map((t) => t.getAttribute('data-lat-reflow')), ['cards', 'pairs']);
  assert.equal(tables[0].querySelector('td:nth-child(2)').getAttribute('data-lat-col'), 'Role');
});

// ── the CSS selects what the kernel stamps ───────────────────────────────────

test('base.table-reflow.css selects the stamped classes and label attribute, and is bundled', () => {
  const css = fs.readFileSync(path.join(ROOT, 'lib/base/base.table-reflow.css'), 'utf8');
  for (const cls of Object.values(REFLOW_CLASS)) assert.ok(css.includes(`table.${cls}`), `no rule selects table.${cls}`);
  assert.ok(css.includes('attr(data-lat-col)'), 'the card labels must read data-lat-col');
  assert.ok(!/attr\(data-label\)/.test(css), 'data-label belongs to the Guide (SANCTIONED_MARK_IDENTITY), not to tables');
  const build = fs.readFileSync(path.join(ROOT, 'tools/build-css.js'), 'utf8');
  assert.ok(build.includes("'lib/base/base.table-reflow.css'"), 'the sheet is not in the CSS bundle');
});

// ── the bake-off floor ───────────────────────────────────────────────────────
// The shipped detector won a bake-off on 225 independently labeled tables
// (tools/frame-lab/bakeoff/, `npm run tables:bakeoff`). Hold it to that result, so a
// change to the kernel cannot quietly lose ground. The floors sit a little under the
// measured 82% (all tables) and 67% (deck tables); raise them when the kernel improves.

test('the shipped detector keeps its bake-off result', () => {
  const { score, DETECTORS } = require('../../../tools/frame-lab/bakeoff/bakeoff.js');
  const shipped = Object.entries(DETECTORS).find(([name]) => name.includes('table-shape'))[1];
  const r = score(shipped);
  assert.equal(r.n, 225);
  assert.ok(r.layout / r.n >= 0.80, `right layout on ${r.layout}/${r.n} tables, below the 80% floor`);
  assert.ok(r.deckLayout / r.deckN >= 0.64, `right layout on ${r.deckLayout}/${r.deckN} deck tables, below the 64% floor`);
  // And it still beats doing nothing by a wide margin.
  const none = score(DETECTORS['A. default only']);
  assert.ok(r.layout - none.layout >= 70, 'the detector no longer clearly beats no detection');
});

// ── panes, raw HTML and row headers (the checker's findings) ────────────────

const PANE_DECK = (hostClass, marker = '') => [
  '---', 'theme: indaco', '---', '', `<!-- _class: columns ratio-30-70 ${hostClass} -->`, '', '## Two panes', '',
  marker, '### The team', '', '| Name | Role | City |', '|---|---|---|', '| Ada | Lead | Lagos |', '| Priya | Director | Pune |', '',
  '### Notes', '', 'A paragraph.',
].join('\n');

test('a slide-level override reaches the tables in its panes', () => {
  const { createEngine } = require('../../../lib/engine');
  const verdict = (deck) => new JSDOM(createEngine().render(deck).html).window.document.querySelector('lat-pane table').getAttribute('data-lat-reflow');
  assert.equal(verdict(PANE_DECK('')), 'cards');
  assert.equal(verdict(PANE_DECK('no-table-reflow')), 'none');
  assert.equal(verdict(PANE_DECK('table-pairs')), 'pairs');
  // A pane marker that names its own override keeps it over the host's.
  assert.equal(verdict(PANE_DECK('no-table-reflow', '<!-- _pane: content table-cards -->')), 'cards');
});

test('the DOM mirror judges a pane table by the pane, and by the host override, as the engine does', () => {
  const pane = (paneCls, hostCls = '') => domOf(`<section class="lat-pane-host ${hostCls}"><div class="cell-stage"><lat-pane class="content ${paneCls}"><div class="cell-stage">${tableHtml(KINDS.records)}</div></lat-pane></div></section>`)
    .querySelector('table').getAttribute('data-lat-reflow');
  assert.equal(pane(''), 'cards');
  assert.equal(pane('no-table-reflow'), 'none');
  assert.equal(pane('', 'no-table-reflow'), 'none');
  assert.equal(pane('table-cards', 'no-table-reflow'), 'cards');
});

test('a th in a body row is a row header, not a column header', () => {
  const doc = domOf(`<section class="content"><table><thead><tr><th>Name</th><th>Role</th><th>City</th></tr></thead><tbody>
    <tr><th scope="row">Ada</th><td>Lead</td><td>Lagos</td></tr><tr><th scope="row">Priya</th><td>Director</td><td>Pune</td></tr></tbody></table></section>`);
  const t = doc.querySelector('table');
  assert.equal(t.getAttribute('data-lat-reflow'), 'cards');
  assert.equal(t.querySelector('thead th').getAttribute('role'), 'columnheader');
  assert.equal(t.querySelector('tbody th').getAttribute('role'), 'rowheader');
});

test('a raw <table> keeps its shape on the engine path and in the mirror alike', () => {
  const { createEngine } = require('../../../lib/engine');
  const { RAW_REFLOW_ATTR } = require('../../../lib/core/table-shape.js');
  const deck = ['---', 'theme: indaco', '---', '', '## Raw', '',
    '<table><tr><th>Name</th><th>Role</th><th>City</th></tr><tr><td>Ada</td><td>Lead</td><td>Lagos</td></tr><tr><td>Priya</td><td>Director</td><td>Pune</td></tr></table>'].join('\n');
  const doc = new JSDOM(createEngine().render(deck).html).window.document;
  const section = doc.querySelector('section');
  assert.ok(section.hasAttribute(RAW_REFLOW_ATTR), 'the engine marks a slide holding a raw table');
  assert.equal(doc.querySelector('table').hasAttribute('data-lat-reflow'), false, 'the engine walker cannot read raw HTML');
  applyToDom(doc);
  assert.equal(doc.querySelector('table').getAttribute('data-lat-reflow'), 'none', 'the mirror leaves it alone too');
});

test('the mirror judges only the tables reflow can apply to, never a figure\'s own table', () => {
  const doc = domOf(`<section class="heatmap"><div class="cell-stage"><div class="chart-body">
    <div class="chart-sr-only">${tableHtml(KINDS.records)}</div></div></div></section>`);
  assert.equal(doc.querySelector('table').hasAttribute('data-lat-reflow'), false);
});

// ── table-owning components ──────────────────────────────────────────────────

test('glossary declares its own narrow layout on both paths, and its range pill still reads the table', () => {
  const { createEngine } = require('../../../lib/engine');
  const deck = ['---', 'theme: indaco', '---', '', '<!-- _class: glossary -->', '', '## Terms', '',
    '- **Alpha**', '  - The first letter.', '- **Omega**', '  - The last letter.'].join('\n');
  const doc = new JSDOM(createEngine().render(deck).html).window.document;
  const t = doc.querySelector('table.glossary-terms');
  assert.ok(t, 'the glossary table is built');
  assert.equal(t.getAttribute('data-lat-reflow'), 'pairs');
  assert.match(doc.querySelector('h2').textContent, /A\s*[–-]\s*O/, 'the A–O range pill still reads the generated table');
  // The DOM mirror builds the same table from the list on a Marp render.
  const { applyToDom: glossaryToDom } = require('../../../lib/core/glossary-slide.js');
  const m = new JSDOM('<section class="glossary"><h2>Terms</h2><ul><li><strong>Alpha</strong><ul><li>The first.</li></ul></li></ul></section>').window.document;
  glossaryToDom(m);
  assert.equal(m.querySelector('table.glossary-terms')?.getAttribute('data-lat-reflow'), 'pairs');
});

test('the reflow sheet admits obligation-matrix and the statute-stack lane, and keeps the four that draw their own', () => {
  const css = fs.readFileSync(path.join(ROOT, 'lib/base/base.table-reflow.css'), 'utf8');
  const deny = ':where(:not(.glossary):not(.matrix-grid):not(.math.derivation.form):not(.roadmap))';
  assert.ok(css.includes(deny), 'the deny list is glossary, matrix-grid, math derivation and roadmap');
  assert.ok(!/:not\(\.obligation-matrix\)|:not\(\.statute-stack\.lane\)/.test(css), 'obligation-matrix and the lane take the shared cards');
});

test('glossary and math derivation carry their own narrow rule, which respects a held table and no-table-reflow', () => {
  const gl = fs.readFileSync(path.join(ROOT, 'lib/components/inventory/glossary/glossary.styles.css'), 'utf8');
  const math = fs.readFileSync(path.join(ROOT, 'lib/components/math/math/math.styles.css'), 'utf8');
  const block = (css) => {
    const at = css.search(/@container \(width < \d+em\) \{/);
    assert.ok(at >= 0, 'has a container query');
    return css.slice(at, css.indexOf('\n}\n', at));
  };
  for (const [name, css] of [['glossary', gl], ['math', math]]) {
    const rules = block(css).split('\n').filter((l) => /^\s+section\./.test(l));
    assert.ok(rules.length > 0, `${name}'s container block has rules`);
    for (const r of rules) {
      assert.match(r, /table:not\(\.lat-reflow-held\)/, `${name}: every container rule skips a held table — ${r.trim()}`);
      assert.match(r, /:not\(\.no-table-reflow\)/, `${name}: every container rule honors no-table-reflow — ${r.trim()}`);
    }
  }
  // 17em, not 18em: a glossary in the catalog's minimum 35% pane on 16:9 is 17.8em wide and keeps its table.
  assert.match(gl, /@container \(width < 17em\)/);
  // The mobile strip rule stacks as it always did: a hold must not undo it.
  assert.ok(!/\[data-family="strip"\]\) table:not\(\.lat-reflow-held\)/.test(gl), 'the strip arms ignore a hold');
});
