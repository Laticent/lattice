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
      const c = cells(rowFor(m.name))[3].replace(/\*$/, '');
      assert.equal(c, `${m.capacity.axis}:${m.capacity.sweet}/${m.capacity.soft}/${m.capacity.hard}`, `${m.name}: capacity`);
    }
  });

  // A budget only means something WITH the deck size it was measured at. capacityEntry
  // attaches `family: 'wide'` for exactly this reason; the first cut of this projection
  // dropped it and published the wide number as if it were universal. Measured against
  // the real linter, `list item:5/6/6` warns at 5 on a mobile deck and tolerates 7 on a
  // tall one — the column both understated and overstated the truth.
  test('a budget that varies by deck family is marked', () => {
    const varying = manifests.filter((m) => {
      const fam = m.adapt?.capacity;
      const fams = fam ? ['wide', 'square', 'tall', 'strip'].map((k) => fam[k]).filter(Boolean) : [];
      return fams.length > 1 && fams.some((f) => f.sweet !== fams[0].sweet || f.soft !== fams[0].soft || f.hard !== fams[0].hard);
    });
    assert.ok(varying.length >= 3, `expected the real corpus, got ${varying.length}`);
    for (const m of varying) {
      assert.match(cells(rowFor(m.name))[3], /\*$/, `${m.name}: family-varying budget must be marked`);
    }
    // …and one that does NOT vary must not be marked, or the mark means nothing.
    const invariant = manifests.find((m) => {
      const fam = m.adapt?.capacity;
      const fams = fam ? ['wide', 'square', 'tall', 'strip'].map((k) => fam[k]).filter(Boolean) : [];
      return fams.length > 1 && fams.every((f) => f.sweet === fams[0].sweet && f.soft === fams[0].soft && f.hard === fams[0].hard);
    });
    if (invariant) assert.doesNotMatch(cells(rowFor(invariant.name))[3], /\*$/, `${invariant.name}: invariant budget must not be marked`);
  });

  // A component whose SPLIT axis was retired (matrix-2x2's four quadrants, split-compare's
  // two sides) still holds a fixed count. Rendering it as `—` under a legend reading "no
  // repeating axis … its budget is prose length" asserted something false about 40 rows.
  test('a retired axis still publishes its count', () => {
    for (const name of ['matrix-2x2', 'split-compare']) {
      if (!manifests.some((m) => m.name === name)) continue;
      assert.match(cells(rowFor(name))[3], /^\d+\/\d+\/\d+$/, `${name}: fixed count should be published, not dashed`);
    }
  });

  test('the escalation target rides along, since it is what you switch to', () => {
    // Read the EFFECTIVE capacity, not `m.capacity` — a component can inherit both its
    // budget and its escalation targets from its family, and filtering on the flat field
    // silently excused exactly those rows.
    const { capacityEntry } = require('../../../tools/build-docs-portal');
    const escalating = manifests.filter((m) => capacityEntry(m).capacity?.escalateTo?.length);
    assert.ok(escalating.length >= 2, `expected the real corpus, got ${escalating.length}`);
    let derivedCovered = 0;
    for (const m of escalating) {
      const c = cells(rowFor(m.name));
      for (const target of capacityEntry(m).capacity.escalateTo) {
        assert.ok(c[4].includes(target), `${m.name}: escalateTo ${target} missing from its row`);
      }
      if (!m.capacity) derivedCovered += 1;
    }
    assert.ok(derivedCovered >= 1, 'a component with DERIVED escalation targets must be covered');
  });

  // Bucket order is the taxonomy's narrative sequence (anchor → statement → inventory → …),
  // the same order CLAUDE.md, components.md and the docs site read in. Alphabetical would
  // scramble it on the one surface an agent reads top to bottom, and a checker mutation
  // that reversed the sort survived the suite.
  test('rows follow the canonical bucket order, then name', () => {
    const { BUCKETS } = require('../../../lib/components');
    const rank = new Map(BUCKETS.map((b, i) => [b, i]));
    const seen = dataRows.map((r) => cells(r)).map((c) => [rank.get(c[1]), c[0]]);
    for (let i = 1; i < seen.length; i += 1) {
      const [prevBucket, prevName] = seen[i - 1];
      const [bucket, name] = seen[i];
      assert.ok(
        prevBucket < bucket || (prevBucket === bucket && prevName.localeCompare(name, 'en') < 0),
        `row ${i} is out of order: ${prevName} (${prevBucket}) before ${name} (${bucket})`,
      );
    }
    assert.equal(seen[0][0], 0, 'the first row should be in the first canonical bucket');
  });

  test('every capacity cell is either a budget or an explicit dash — never blank', () => {
    for (const m of manifests) {
      const cell = cells(rowFor(m.name))[3];
      assert.match(cell, /^(—|([a-z-]+:)?\d+\/\d+\/\d+\*?)$/, `${m.name}: unreadable capacity cell ${JSON.stringify(cell)}`);
    }
  });

  // A component can inherit its budget from its FAMILY rather than declaring one
  // (kpi and list do today). The pick list shows the EFFECTIVE budget, which is the
  // one an author overflows — reading only `m.capacity` would call these unbounded.
  // A shape-only assertion let a checker mutation that rendered every derived budget as
  // 1/1/1 survive the entire suite. Pin the VALUE against the family it was lifted from.
  test('a derived capacity carries its family real numbers', () => {
    const derived = manifests.filter((m) => !m.capacity && m.adapt?.capacity?.wide);
    assert.ok(derived.length >= 2, `expected the real corpus, got ${derived.length}`);
    for (const m of derived) {
      const w = m.adapt.capacity.wide;
      const axis = m.adapt.capacity.axis ? `${m.adapt.capacity.axis}:` : '';
      const want = `${axis}${w.sweet}/${w.soft}/${w.hard}`;
      assert.equal(cells(rowFor(m.name))[3].replace(/\*$/, ''), want, `${m.name}: derived capacity value`);
    }
  });

  test('an inherited family capacity is shown, not left as a dash', () => {
    const inherited = manifests.filter((m) => !m.capacity && cells(rowFor(m.name))[3] !== '—');
    assert.ok(inherited.length >= 1, 'expected at least one component inheriting a family capacity');
    for (const m of inherited) {
      assert.match(cells(rowFor(m.name))[3], /^([a-z-]+:)?\d+\/\d+\/\d+\*?$/, `${m.name}: malformed inherited capacity`);
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
      assert.ok(c[7].length > 0, `${m.name}: empty purpose`);
      assert.ok(c[7].length <= 170, `${m.name}: purpose cell is ${c[7].length} chars, not a one-liner`);
    }
  });

  // A purpose is cut at a SENTENCE boundary, not a character count. The first version
  // clamped at 96 chars and truncated 61 of 61 rows — manifest prose is written
  // head-first ("Use for X…") and tail-last ("…for Y, use `Z` instead"), so the clamp
  // ate the discriminating half of every row while rendering as a complete claim.
  test('most rows are a COMPLETE sentence, not a truncation', () => {
    const truncated = manifests.filter((m) => cells(rowFor(m.name))[7].endsWith('…'));
    assert.ok(truncated.length <= 8, `${truncated.length} rows truncated — the cap should be a backstop, not the mechanism`);
    for (const m of manifests) {
      const purpose = cells(rowFor(m.name))[7];
      assert.ok(/[.!?]$/.test(purpose) || purpose.endsWith('…'), `${m.name}: purpose neither ends a sentence nor marks a cut: ${purpose}`);
    }
  });

  // The confusable clusters (list / cards-stack / list-tabular; matrix-grid /
  // matrix-2x2 / roadmap) are what a pick surface most needs to disambiguate: an author
  // whose count happens to fit the first plausible row needs to see its neighbors.
  test('related components are named on the row', () => {
    const withRelated = manifests.filter((m) => Array.isArray(m.related) && m.related.length);
    assert.ok(withRelated.length >= 30, `expected the real corpus, got ${withRelated.length}`);
    const known = new Set(manifests.map((m) => m.name));
    for (const m of withRelated) {
      const seeAlso = cells(rowFor(m.name))[6].split(' ').filter(Boolean);
      for (const rel of m.related) {
        const name = typeof rel === 'string' ? rel : rel.name;
        if (!known.has(name)) continue; // dangling relation — asserted separately below
        assert.ok(seeAlso.includes(name), `${m.name}: related component ${name} missing from its row`);
      }
      for (const name of seeAlso) {
        assert.ok(known.has(name), `${m.name}: see-also names ${name}, which is not a component`);
      }
    }
  });

  // The pick surface must not launder a dangling reference into a peer recommendation.
  test('a relation naming a component that does not exist is dropped', () => {
    const fake = [{ ...manifests[0], name: 'rel-test', related: [{ name: 'ghost-component' }, { name: manifests[1].name }] }, manifests[1]];
    const row = renderPickMd(fake).split('\n').find((l) => l.startsWith('| rel-test '));
    const seeAlso = row.split(/(?<!\\)\|/).slice(1, -1)[6].trim();
    assert.ok(!seeAlso.includes('ghost-component'), 'a non-existent component must not be recommended');
    assert.ok(seeAlso.includes(manifests[1].name), 'a real relation must survive');
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
        assert.equal(count, 8, `${label}: the row must still have exactly 8 cells`);
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
