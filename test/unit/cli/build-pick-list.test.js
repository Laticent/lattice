/**
 * Unit: the component PICK surface (dist/docs/components.pick.md), emitted by
 * tools/build-docs-portal.js `renderPickMd` from the component manifests.
 *
 * This is the file HARD RULE #6's "before authoring any `_class:` slide" read lands
 * on, so its contract is: every component present exactly once, and every fact a PICK
 * depends on carried on the component's own line. A row that silently loses its
 * capacity budget sends an author into an overflow the linter only catches afterwards.
 *
 * Covers:
 *   1. One row per manifest, no duplicates, no strays.
 *   2. Capacity is rendered for every component that declares one, with its escalation
 *      target — the two facts AGENTS.md tells you to check BEFORE committing.
 *   3. Tags and axes ride along, because those are what a grep matches on.
 *   4. Cells can never break the table (a `|` in prose is escaped).
 *   5. Deterministic / idempotent.
 *   6. It stays SMALL — the whole point is that the catalog fits in one cheap read.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { renderPickMd } = require('../../../tools/build-docs-portal');
const { loadAll, manifestBucket } = require('../../../lib/components');

const manifests = loadAll();
const md = renderPickMd(manifests);
const dataRows = md.split('\n').filter((l) => l.startsWith('| ') && !/^\|\s*component\s*\|/.test(l) && !/^\|-/.test(l));
// Split on UNESCAPED pipes only — an escaped `\|` is cell content, not a delimiter.
const cells = (row) => row.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim());
const rowFor = (name) => dataRows.find((r) => cells(r)[0] === name);

describe('components.pick.md', () => {
  test('one row per component, exactly once', () => {
    assert.equal(dataRows.length, manifests.length, `${manifests.length} manifests, ${dataRows.length} rows`);
    const names = dataRows.map((r) => cells(r)[0]);
    assert.equal(new Set(names).size, names.length, 'a component is listed twice');
    for (const m of manifests) assert.ok(rowFor(m.name), `${m.name} has no row`);
  });

  test('every row carries its bucket and the three axes', () => {
    for (const m of manifests) {
      const c = cells(rowFor(m.name));
      assert.equal(c[1], manifestBucket(m), `${m.name}: wrong bucket`);
      assert.equal(c[2], `${m.form}/${m.function}/${m.substance}`, `${m.name}: wrong axes`);
    }
  });

  // The pick surface has to carry everything the pick needs or it just adds a hop:
  // AGENTS.md requires counting content against capacity BEFORE choosing.
  test('a declared capacity is rendered as axis:sweet/soft/hard', () => {
    const withCapacity = manifests.filter((m) => m.capacity);
    assert.ok(withCapacity.length >= 10, `expected the real corpus, got ${withCapacity.length}`);
    for (const m of withCapacity) {
      const c = cells(rowFor(m.name));
      assert.equal(c[3], `${m.capacity.axis}:${m.capacity.sweet}/${m.capacity.soft}/${m.capacity.hard}`, `${m.name}: capacity`);
    }
  });

  test('the escalation target rides along, since it is what you switch to', () => {
    const escalating = manifests.filter((m) => m.capacity?.escalateTo?.length);
    assert.ok(escalating.length, 'expected at least one component with escalateTo');
    for (const m of escalating) {
      const c = cells(rowFor(m.name));
      for (const target of m.capacity.escalateTo) {
        assert.ok(c[4].includes(target), `${m.name}: escalateTo ${target} missing from its row`);
      }
    }
  });

  test('every capacity cell is either a budget or an explicit dash — never blank', () => {
    for (const m of manifests) {
      const cell = cells(rowFor(m.name))[3];
      assert.match(cell, /^(—|[a-z-]+:\d+\/\d+\/\d+)$/, `${m.name}: unreadable capacity cell ${JSON.stringify(cell)}`);
    }
  });

  // A component can inherit its budget from its FAMILY rather than declaring one
  // (kpi and list do today). The pick list shows the EFFECTIVE budget, which is the
  // one an author overflows — reading only `m.capacity` would call these unbounded.
  test('an inherited family capacity is shown, not left as a dash', () => {
    const inherited = manifests.filter((m) => !m.capacity && cells(rowFor(m.name))[3] !== '—');
    assert.ok(inherited.length >= 1, 'expected at least one component inheriting a family capacity');
    for (const m of inherited) {
      assert.match(cells(rowFor(m.name))[3], /^[a-z-]+:\d+\/\d+\/\d+$/, `${m.name}: malformed inherited capacity`);
    }
  });

  // Tags are the searcher's vocabulary — grepping for them is the intended entry point.
  test('search tags are present and greppable on the row', () => {
    for (const m of manifests.filter((x) => Array.isArray(x.tags) && x.tags.length)) {
      const c = cells(rowFor(m.name));
      for (const tag of m.tags) assert.ok(c[5].split(' ').includes(tag), `${m.name}: tag ${tag} missing`);
    }
  });

  test('every row has a purpose, and it stays one line', () => {
    for (const m of manifests) {
      const c = cells(rowFor(m.name));
      assert.ok(c[6].length > 0, `${m.name}: empty purpose`);
      assert.ok(c[6].length <= 100, `${m.name}: purpose cell is ${c[6].length} chars, not a one-liner`);
    }
  });

  // Escaping is verified by RENDERING, not by a regex opinion about the source. The
  // first version of this test split on unescaped pipes and passed while the escaper
  // was incomplete — CodeQL found what the test could not. The contract that actually
  // matters: what a reader SEES is what the manifest wrote.
  describe('cell escaping — round-tripped through a markdown parser', () => {
    const MarkdownIt = require('markdown-it');
    const md = new MarkdownIt();
    const renderedPurpose = (purpose) => {
      const table = renderPickMd([{ ...manifests[0], name: 'esc-test', purpose, tags: ['x'] }]);
      const html = md.render(table.slice(table.indexOf('| component')));
      const tds = [...html.matchAll(/<td>(.*?)<\/td>/gs)].map((m) => m[1]);
      return { count: tds.length, purpose: tds[tds.length - 1] };
    };

    const cases = [
      ['a bare pipe', 'Use for a | b choices'],
      ['an escaped pipe', String.raw`Use for a \| b choices`],
      ['a lone backslash', String.raw`A windows path C:\dir`],
      ['a double backslash', String.raw`Escaped \\ backslash`],
      // NB: a template literal cannot END in a backslash — the lexer reads it as
      // escaping the closing backtick — so this one is built as an ordinary string.
      ['a trailing backslash', 'Ends with one \\'],
    ];

    for (const [label, input] of cases) {
      test(`${label} keeps the row intact and renders verbatim`, () => {
        const { count, purpose } = renderedPurpose(input);
        assert.equal(count, 7, `${label}: the row must still have exactly 7 cells`);
        assert.equal(purpose, input, `${label}: the reader must see what the manifest wrote`);
      });
    }
  });

  test('rendering is deterministic', () => {
    assert.equal(renderPickMd(manifests), md);
  });

  // The whole justification for this projection is that it is cheap to read. A rough
  // 4 chars/token puts the ceiling near 6k tokens — well under components.json's 95k,
  // and a tripwire if a future field turns the pick list back into a document.
  test('the catalog stays small enough to read in one go', () => {
    assert.ok(md.length < 24_000, `pick list is ${md.length} chars — it is becoming a document, not an index`);
  });

  test('it points at the per-component docs for authoring, per HARD RULE #6', () => {
    assert.match(md, /\.docs\.md/);
    assert.match(md, /components\.json/, 'it should say what the full record is for');
  });
});
