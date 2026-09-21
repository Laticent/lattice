const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { execSync } = require('node:child_process');
const path = require('node:path');

const {
  ROW_LABEL_CLASS,
  firstColumnIsRowLabel,
  resolveRowLabel,
  cellText,
  applyToDom,
  ROW_LABEL_OFF_CLASS,
  RAW_TABLES_CLASS,
} = require('../../../lib/core/table-row-label.js');

const ROOT = path.resolve(__dirname, '../../..');

// ── the ON arm ────────────────────────────────────────────────────────────────
// The default is ON, so these pin the cases where nothing should turn it off.

test('a named label header over a textual column is a row label', () => {
  assert.equal(firstColumnIsRowLabel({
    headers: ['Criterion', 'Option A', 'Option B'],
    firstColumn: ['Speed', 'Auditability', 'Cost'],
  }), true);
});

test('an EMPTY first header cell is still a row label', () => {
  // A real and common shape in the corpus — the row-label column is there, it just
  // has no column name. An empty header must not read as "no label". (The count
  // that used to sit in this sentence is gone on purpose: it was the rotted 224
  // that lib/core/table-row-label.js's own docblock names as a cautionary tale,
  // left behind by the commit that corrected it everywhere else. The live tuple is
  // the diagnostic the corpus test below prints.)
  assert.equal(firstColumnIsRowLabel({
    headers: ['', 'Option A', 'Option B'],
    firstColumn: ['Cost', 'Speed'],
  }), true);
});

test('markdown emphasis in the label does not change the verdict', () => {
  assert.equal(firstColumnIsRowLabel({
    headers: ['Step', 'What happens'],
    firstColumn: ['**One**', '**Two**'],
  }), true);
});

test('one placeholder cell does not flip a textual column', () => {
  assert.equal(firstColumnIsRowLabel({
    headers: ['Region', 'Q3'],
    firstColumn: ['EMEA', '—', 'APAC'],
  }), true);
});

test('a header that merely CONTAINS an index word is still a subject', () => {
  // `Reference` is a subject; `Ref.` is an index. The pattern is anchored, and
  // a false OFF here would silently drop emphasis from a citation table whose
  // first column really is the label.
  assert.equal(firstColumnIsRowLabel({
    headers: ['Reference', 'Finding'],
    firstColumn: ['Smith 2024', 'Jones 2023'],
  }), true);
});

// ── the OFF arm ───────────────────────────────────────────────────────────────
// The four shapes base.elements.css names. Each is a case where bolding column
// one is wrong, and each is why base refuses to make this bet unasked.

test('a single-column table has no first column to distinguish', () => {
  assert.equal(firstColumnIsRowLabel({ headers: ['Only'], firstColumn: ['a', 'b'] }), false);
});

test('an index header turns the bet off', () => {
  for (const h of ['#', 'No.', 'no', 'Ref.', 'ID', 'Idx', '№', 'S/N']) {
    assert.equal(
      firstColumnIsRowLabel({ headers: [h, 'Finding'], firstColumn: ['1', '2'] }),
      false,
      `expected '${h}' to read as an index header`,
    );
  }
});

test('an all-numeric first column turns the bet off', () => {
  assert.equal(firstColumnIsRowLabel({
    headers: ['Year', 'Revenue'],
    firstColumn: ['2024', '2025', '2026'],
  }), false);
  assert.equal(firstColumnIsRowLabel({
    headers: ['Price', 'Tier'],
    firstColumn: ['$10', '$20'],
  }), false);
});

test('inline-code fences do not hide a numeric column', () => {
  // `cellText` strips the fences first, so a table of backticked ports reads as
  // numeric exactly as the bare form does.
  assert.equal(firstColumnIsRowLabel({
    headers: ['Port', 'Service'],
    firstColumn: ['`8080`', '`443`'],
  }), false);
});

test('a column of bare state markers turns the bet off', () => {
  assert.equal(firstColumnIsRowLabel({
    headers: ['Done', 'Task'],
    firstColumn: ['[x]', '[ ]', '[-]', '[/]'],
  }), false);
});

test('a marker WITH a trailing label is a label, not a marker column', () => {
  // `MARKER_CELL` is anchored whole-string on purpose: `[x] Certified` carries
  // words, so the column is still labeling its rows.
  assert.equal(firstColumnIsRowLabel({
    headers: ['State', 'Note'],
    firstColumn: ['[x] Certified', '[ ] Pending'],
  }), true);
});

test('a header-only table has nothing to emphasize', () => {
  assert.equal(firstColumnIsRowLabel({ headers: ['A', 'B'], firstColumn: [] }), false);
  assert.equal(firstColumnIsRowLabel({ headers: ['A', 'B'], firstColumn: ['', '  '] }), false);
});

test('a column of nothing but placeholders is not a set of labels', () => {
  assert.equal(firstColumnIsRowLabel({
    headers: ['Owner', 'Task'],
    firstColumn: ['—', 'n/a', 'TBD'],
  }), false);
});

test('missing or malformed input never throws', () => {
  assert.equal(firstColumnIsRowLabel(), false);
  assert.equal(firstColumnIsRowLabel({}), false);
  assert.equal(firstColumnIsRowLabel({ headers: ['A', 'B'], firstColumn: [null, undefined] }), false);
});

// ── the override ──────────────────────────────────────────────────────────────

test('row-label and no-row-label overrule the measurement', () => {
  const numeric = { headers: ['Year', 'X'], firstColumn: ['2024'] };
  const labelled = { headers: ['Criterion', 'X'], firstColumn: ['Speed'] };
  assert.equal(resolveRowLabel(['table', 'row-label'], numeric), true, 'row-label forces ON');
  assert.equal(resolveRowLabel(['table', 'no-row-label'], labelled), false, 'no-row-label forces OFF');
  assert.equal(resolveRowLabel(['table'], labelled), true, 'no token = measured');
});

test('no-row-label wins a slide carrying both', () => {
  // The opt-OUT is what an author reaches for after SEEING the wrong thing, so a
  // stray `row-label` beside it must not win. (Both are per-SLIDE tokens: a
  // deck-level `class:` never reaches the rule that feeds this — see the kernel.)
  assert.equal(
    resolveRowLabel(['table', 'row-label', 'no-row-label'], { headers: ['A', 'B'], firstColumn: ['x'] }),
    false,
  );
});

test('a non-array class list is tolerated', () => {
  assert.equal(resolveRowLabel(undefined, { headers: ['A', 'B'], firstColumn: ['x'] }), true);
  assert.equal(resolveRowLabel(null, { headers: ['Only'], firstColumn: ['x'] }), false);
});

test('cellText normalizes emphasis, code fences and whitespace', () => {
  assert.equal(cellText('  **Bold**  '), 'Bold');
  assert.equal(cellText('`code`'), 'code');
  assert.equal(cellText('a   b'), 'a b');
  assert.equal(cellText(null), '');
});

// ── the corpus ────────────────────────────────────────────────────────────────

// The two tables that are SUPPOSED to resolve OFF: the demonstration slides in
// examples/universal-table.md, where a year column shows the rule declining and
// `row-label` then forces it back on over the same data. They are the corpus's
// only negative cases, and they exist because a rule with no negative case can
// only be tested for recall.
const EXPECTED_OFF = Object.freeze([
  'examples/universal-table.md: | Year | Revenue | Growth |',
  'examples/universal-table.md: | Year | Revenue | Growth |',
  // examples/table-component.md carries the same demonstration: the rule declining
  // over a year column, then `row-label` forcing it back on over that identical
  // data. Two tables, one OFF and one explicitly overruled.
  'examples/table-component.md: | Year | Revenue | Growth |',
  'examples/table-component.md: | Year | Revenue | Growth |',
]);

test('every table in every shipped deck resolves as the design says', (t) => {
  // The measurement the design rests on, re-run rather than quoted, over the
  // four roots the docblock names — `examples/`, `exemplars/`,
  // `test/integration/baseline-decks/` and `lib/components/`. Widen the scope
  // and the totals move, which is why the scope is part of the claim.
  //
  // Both arms are asserted. Every table resolves ON except the two demo tables
  // above, so this catches a rule that fired OFF too eagerly AND one that
  // stopped firing OFF at all — the second is the arm that would have let the
  // `table-fill` gate bug back in.
  // It deliberately does NOT assert a total — decks come and go, and pinning
  // the count would make this test a chore rather than a guard.
  const files = execSync(
    "find examples exemplars test/integration/baseline-decks lib/components -name '*.md'",
    { cwd: ROOT, encoding: 'utf8' },
  ).split('\n').filter(Boolean);

  const cells = (row) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  const offenders = [];
  let seen = 0;
  let named = 0;
  let empty = 0;

  for (const f of files) {
    const lines = readFileSync(path.join(ROOT, f), 'utf8').split('\n');
    let run = [];
    let fenced = false;
    const flush = () => {
      if (run.length >= 3) {
        const headers = cells(run[0]);
        const body = run.slice(2).map(cells);
        seen++;
        if (!firstColumnIsRowLabel({ headers, firstColumn: body.map((r) => r[0] ?? '') })) {
          offenders.push(`${f}: | ${headers.join(' | ')} |`);
        } else if ((headers[0] ?? '').trim() === '') empty++;
        else named++;
      }
      run = [];
    };
    for (const l of lines) {
      if (/^\s*```/.test(l)) { fenced = !fenced; continue; }
      if (fenced) continue;
      if (/^\s*\|.*\|\s*$/.test(l)) { run.push(l); continue; }
      flush();
    }
    flush();
  }

  // PRINTED, not asserted. The docblock in lib/core/table-row-label.js quotes this
  // tuple, and it has been wrong twice — 224, then 227 — both times because a human
  // retyped it instead of re-running the walk. A diagnostic makes re-deriving it one
  // command. It is still not asserted: decks come and go, and pinning the total
  // would make this a chore rather than a guard (the OFF SET below is the guard).
  t.diagnostic(`corpus: ${seen} tables — ${named} named / ${empty} empty / ${offenders.length} OFF`);
  assert.ok(seen > 100, `expected a real corpus, walked ${seen} tables`);
  // SORTED both sides: `offenders` is built in `find(1)` order, which is not
  // stable across machines the moment a second file legitimately resolves OFF.
  assert.deepEqual(
    [...offenders].sort(),
    [...EXPECTED_OFF].sort(),
    `the set of tables resolving OFF changed.\ngot:\n${offenders.join('\n')}`,
  );
});

test('the stamped class name is the one the CSS selects', () => {
  // Three files have to agree on this string and none imports the CSS, so the
  // only thing standing between them is this assertion.
  const css = readFileSync(path.join(ROOT, 'lib/base/base.variants.css'), 'utf8');
  assert.match(css, new RegExp(`table\\.${ROW_LABEL_CLASS}\\s*\\{`),
    `base.variants.css must style table.${ROW_LABEL_CLASS}`);
  assert.match(css, new RegExp(`table\\.${ROW_LABEL_CLASS}[^}]*--table-label-weight`));
  assert.match(css, new RegExp(`table\\.${ROW_LABEL_CLASS}[^}]*--table-label-ink`));

  const elements = readFileSync(path.join(ROOT, 'lib/base/base.elements.css'), 'utf8');
  assert.match(elements, /td:first-child[^}]*--table-label-weight/s,
    'base.elements.css must READ the property the variant sets');
});

// ── the DOM extractor ─────────────────────────────────────────────────────────
// `applyToDom` is the half the browser runtime runs, and the half a future engine
// HTML-stage caller would run (see the decision record's § "The raw-HTML
// regression"). It used to live inline in lib/runtime/index.js, where nothing
// could reach it without booting the whole runtime — so the extractor that
// decides what the kernel SEES went untested while the kernel itself had 20
// tests. These pin the reading, not the verdict.

const { JSDOM } = require('jsdom');

/** Parse a slide, run the extractor, and report which tables came back stamped. */
function stamp(html) {
  const dom = new JSDOM(`<body>${html}</body>`);
  applyToDom(dom.window.document);
  return [...dom.window.document.querySelectorAll('table')]
    .map((t) => t.classList.contains(ROW_LABEL_CLASS));
}

const LABEL_TABLE = `<table><thead><tr><th>Region</th><th>Revenue</th></tr></thead>`
  + `<tbody><tr><td>North</td><td>4.2</td></tr><tr><td>South</td><td>3.1</td></tr></tbody></table>`;

test('applyToDom stamps a row-label table on a table slide', () => {
  assert.deepEqual(stamp(`<section class="table">${LABEL_TABLE}</section>`), [true]);
});

test('applyToDom leaves a table alone on a slide that did not opt in', () => {
  assert.deepEqual(stamp(`<section class="content">${LABEL_TABLE}</section>`), [false]);
});

test('applyToDom reads a header row of `th` with no thead', () => {
  // A table built by a transform does not always carry a `thead`; the extractor
  // falls back to the first row containing a `th`, and losing that fallback would
  // leave `headers` empty — which the kernel reads as a single-column table and
  // turns OFF.
  const noThead = '<table><tr><th>Region</th><th>Revenue</th></tr>'
    + '<tr><td>North</td><td>4.2</td></tr></table>';
  assert.deepEqual(stamp(`<section class="table">${noThead}</section>`), [true]);
});

test('applyToDom judges each table on a slide separately', () => {
  // A year column resolves OFF beside a label column that resolves ON — the same
  // slide, two verdicts. A per-SLIDE stamp would report one of them wrongly.
  const years = '<table><thead><tr><th>Year</th><th>Revenue</th></tr></thead>'
    + '<tbody><tr><td>2024</td><td>4.2</td></tr><tr><td>2025</td><td>3.1</td></tr></tbody></table>';
  assert.deepEqual(stamp(`<section class="table">${LABEL_TABLE}${years}</section>`), [true, false]);
});

test('applyToDom honors no-row-label, and it beats row-label', () => {
  assert.deepEqual(stamp(`<section class="no-row-label">${LABEL_TABLE}</section>`), [false]);
  assert.deepEqual(stamp(`<section class="row-label no-row-label">${LABEL_TABLE}</section>`), [false]);
});

test('applyToDom is idempotent and never unstamps', () => {
  // The engine path would run this AFTER the token walker has already stamped the
  // markdown tables, so re-running must be a no-op rather than a re-decision.
  const dom = new JSDOM(`<body><section class="table">${LABEL_TABLE}</section></body>`);
  applyToDom(dom.window.document);
  applyToDom(dom.window.document);
  const table = dom.window.document.querySelector('table');
  assert.equal(table.classList.contains(ROW_LABEL_CLASS), true);
  assert.equal([...table.classList].filter((c) => c === ROW_LABEL_CLASS).length, 1);
});

test('applyToDom reaches a root that IS the slide', () => {
  // A CONTRACT test for the parameter type, not a pin on any caller's path — no
  // caller passes a section today, and an earlier version of this comment wrongly
  // said `withDom` does (it hands back `doc.body`). `applyToDom` takes any root,
  // and `querySelectorAll` never matches its own root, so without the guard a
  // caller handing us one section would silently do nothing.
  const dom = new JSDOM(`<body><section class="table">${LABEL_TABLE}</section></body>`);
  applyToDom(dom.window.document.querySelector('section'));
  assert.equal(dom.window.document.querySelector('table').classList.contains(ROW_LABEL_CLASS), true);
});

test('applyToDom tolerates a root with no query interface', () => {
  // Fail-closed: the callers are renders, and an un-stamped table still renders.
  assert.doesNotThrow(() => applyToDom(null));
  assert.doesNotThrow(() => applyToDom({}));
});

// ── the raw-HTML fallback ─────────────────────────────────────────────────────
// A table written as raw `<table>` HTML never reaches the rule: markdown-it hands
// it through as an opaque block. `compare-table` styled `td:first-child`
// unconditionally and caught it for free, so leaving it unemphasized was a
// REGRESSION, not a gap. The fallback restores it — and these pin the two halves
// that make the fallback safe, because a rule that emphasized every unjudged
// table would bold the year column the kernel deliberately declines.

test('a declined table is STAMPED as declined, not left bare', () => {
  // The whole fallback rests on this. "Judged and declined" and "never judged"
  // are indistinguishable to CSS unless the OFF verdict is written down.
  const years = '<table><thead><tr><th>Year</th><th>Revenue</th></tr></thead>'
    + '<tbody><tr><td>2024</td><td>4.2</td></tr><tr><td>2025</td><td>3.1</td></tr></tbody></table>';
  const dom = new JSDOM(`<body><section class="table">${years}</section></body>`);
  applyToDom(dom.window.document);
  const t = dom.window.document.querySelector('table');
  assert.equal(t.classList.contains(ROW_LABEL_OFF_CLASS), true, 'a declined table carries the OFF class');
  assert.equal(t.classList.contains(ROW_LABEL_CLASS), false);
});

test('the CSS fallback is scoped so it cannot reach a judged table', () => {
  // Read out of the stylesheet rather than asserted about it in prose: the rule
  // must carry BOTH `:not()`s and must name the section marker. Drop either
  // `:not()` and a deliberately-declined column gets bolded; drop the marker and
  // every unjudged table in the deck does.
  const css = readFileSync(path.join(ROOT, 'lib/base/base.variants.css'), 'utf8');
  const rule = new RegExp(
    `section\\.${RAW_TABLES_CLASS}[^{]*table:not\\(\\.${ROW_LABEL_CLASS}\\):not\\(\\.${ROW_LABEL_OFF_CLASS}\\)`,
  );
  assert.match(css, rule, 'the fallback must exclude BOTH verdicts and be scoped to the marker');
});

test('the fallback selector names no component, so the ownership gate stays quiet', () => {
  // checkUniversalTableGuard registers a claim for a table-subject rule only when
  // the selector chains a COMPONENT class. Writing `section.table.lat-raw-tables`
  // here would trip it, and the gate's remedy — a `:not(.table)` deny entry —
  // would cut this component back out of the universal treatment it exists to get.
  // COMMENTS STRIPPED FIRST. The rule's own docblock spells out
  // `section.table.lat-raw-tables` as the thing not to write, so a naive line scan
  // fails on the warning rather than on a selector — which is exactly what happened.
  const css = readFileSync(path.join(ROOT, 'lib/base/base.variants.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const fallback = css.split('\n').filter((l) => l.includes(RAW_TABLES_CLASS));
  assert.ok(fallback.length > 0, 'the fallback rule must exist');
  for (const line of fallback) {
    assert.doesNotMatch(line, /section\.[a-z-]*\btable\b/,
      `the fallback must not chain the component name: ${line}`);
  }
});
