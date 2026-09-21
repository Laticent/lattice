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
  // 22 of the repo's 224 tables are this shape — the row-label column is real,
  // it just has no column name. An empty header must not read as "no label".
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
]);

test('every table in every shipped deck resolves as the design says', () => {
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
        }
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
