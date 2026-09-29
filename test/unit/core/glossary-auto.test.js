const test = require('node:test');
const assert = require('node:assert/strict');

// ESM module under test — dynamic import from this CJS test (mirrors resolve-narration.test.js).
let GLOSSARY_VENUE_ROWS, appendAutoGlossary, glossaryEntries, resolveGlossaryMode, buildGlossarySlideMarkdown, readFrontMatterGlossary, autoGlossarySections, withoutAutoGlossary;
test.before(async () => {
  ({ GLOSSARY_VENUE_ROWS, appendAutoGlossary, glossaryEntries, resolveGlossaryMode, buildGlossarySlideMarkdown, readFrontMatterGlossary, autoGlossarySections, withoutAutoGlossary } = await import(
    '../../../lib/core/glossary-auto.mjs'
  ));
});

// Auto-glossary (#920): a `glossary: auto` deck grows a reference-appendix slide built from the
// acronym registry's `definition` fields, reusing the shipped `glossary` component. These pin the
// transform's contract; the parity suite / real CLI export prove it renders to a term/definition table.
const fm = (body, tail = '\n\n# Deck\n\nBody.\n') => `---\n${body}\n---${tail}`;

const REGISTRY = [
  'glossary: auto',
  'acronyms:',
  '  ARR: { expansion: annual recurring revenue, definition: "Revenue that recurs yearly." }',
  '  CAC: { expansion: customer acquisition cost, definition: "Cost to win one customer." }',
  '  GTM: go to market', // expansion-only, no definition
].join('\n');

test('resolveGlossaryMode: only explicit `glossary: auto` opts in', () => {
  assert.equal(resolveGlossaryMode(fm('glossary: auto')), 'auto');
  assert.equal(resolveGlossaryMode(fm('glossary: "auto"')), 'auto');
  assert.equal(resolveGlossaryMode(fm('glossary: off')), 'off');
  assert.equal(resolveGlossaryMode(fm('theme: indaco')), 'off'); // absent → off
  assert.equal(resolveGlossaryMode('# no front matter'), 'off');
});

test('readFrontMatterGlossary: reads the scalar, lowercased; a `glossary-` look-alike does not misfire', () => {
  assert.equal(readFrontMatterGlossary(fm('glossary: Auto')), 'auto');
  assert.equal(readFrontMatterGlossary(fm('glossary-note: x')), null);
  for (const v of [null, undefined, 42, {}]) assert.equal(readFrontMatterGlossary(v), null);
});

test('glossaryEntries: only defined terms, sorted alphabetically; expansion-only omitted', () => {
  const entries = glossaryEntries(fm(REGISTRY));
  assert.deepEqual(entries, [
    { term: 'ARR', definition: 'Revenue that recurs yearly.' },
    { term: 'CAC', definition: 'Cost to win one customer.' },
  ]);
  // GTM (no definition) is not present.
  assert.ok(!entries.some((e) => e.term === 'GTM'));
});

test('glossaryEntries: sorts case-insensitively', () => {
  const entries = glossaryEntries(
    fm(['glossary: auto', 'acronyms:', '  zeta: { expansion: z, definition: "last" }', '  Alpha: { expansion: a, definition: "first" }'].join('\n')),
  );
  assert.deepEqual(entries.map((e) => e.term), ['Alpha', 'zeta']);
});

test('buildGlossarySlideMarkdown: emits the glossary component grammar (directive, heading, Term/Definition list)', () => {
  const md = buildGlossarySlideMarkdown([{ term: 'ARR', definition: 'Recurs yearly.' }]);
  assert.match(md, /<!-- _class: glossary -->/);
  assert.match(md, /## Glossary/);
  assert.match(md, /- ARR\n {2}- Recurs yearly\./);
});

test('buildGlossarySlideMarkdown: a multi-line definition is collapsed so it can not break the list', () => {
  const md = buildGlossarySlideMarkdown([{ term: 'X', definition: 'line one\n  line two' }]);
  assert.match(md, /- X\n {2}- line one line two/);
});

test('appendAutoGlossary: appends a glossary slide and strips the trigger (idempotent, round-trip-safe)', () => {
  const src = fm(REGISTRY);
  const out = appendAutoGlossary(src);
  assert.notEqual(out, src);
  assert.match(out, /<!-- _class: glossary -->/);
  assert.match(out, /- ARR\n {2}- Revenue that recurs yearly\./);
  // The trigger is consumed: the emitted source no longer carries `glossary:` …
  assert.ok(!/^\s*glossary:/m.test(out.match(/^---[\s\S]*?---/)[0]));
  // …so re-running is a no-op (renders the literal slide once, never regenerates).
  assert.equal(appendAutoGlossary(out), out);
  // …and the acronyms block is untouched (only the trigger line was removed).
  assert.match(out, /ARR: \{ expansion: annual recurring revenue/);
});

test('appendAutoGlossary: no-op without the trigger, or with the trigger but no defined terms', () => {
  const noTrigger = fm('acronyms:\n  ARR: { expansion: annual recurring revenue, definition: "x" }');
  assert.equal(appendAutoGlossary(noTrigger), noTrigger); // no `glossary: auto`
  const noDefs = fm('glossary: auto\nacronyms:\n  GTM: go to market'); // expansion-only
  assert.equal(appendAutoGlossary(noDefs), noDefs); // nothing to define → no slide
  const noRegistry = fm('glossary: auto\ntheme: indaco');
  assert.equal(appendAutoGlossary(noRegistry), noRegistry);
});

test('appendAutoGlossary: bad input is safe', () => {
  for (const v of [null, undefined, 42, {}]) assert.equal(typeof appendAutoGlossary(v), 'string');
});

// The narration trim (engineering/pipeline.md §6): every narrator indexes the
// projection by authored slide, so the glossary's one extra rendered section is dropped for all of
// them through this one function, and only that shape is.
test('autoGlossarySections: 1 when a slide is appended, 0 otherwise', () => {
  assert.equal(autoGlossarySections(fm(REGISTRY)), 1);
  assert.equal(autoGlossarySections(fm('theme: indaco')), 0);
  // `glossary: auto` with no defined term appends nothing, so there is nothing to trim.
  assert.equal(autoGlossarySections(fm('glossary: auto')), 0);
});

test('withoutAutoGlossary: drops exactly the trailing glossary entry, and only that', () => {
  const md = fm(REGISTRY);
  assert.deepEqual(withoutAutoGlossary(['a', 'glossary'], 1, md), ['a']);
  // Already trimmed (the producer did it): unchanged, so applying it twice is safe.
  const trimmed = ['a'];
  assert.equal(withoutAutoGlossary(trimmed, 1, md), trimmed);
  // Two over is not the glossary (an autosplit, say): left for the caller's own guard.
  assert.deepEqual(withoutAutoGlossary(['a', 'b', 'c'], 1, md), ['a', 'b', 'c']);
  // No glossary appended: a one-over list is not trimmed.
  assert.deepEqual(withoutAutoGlossary(['a', 'b'], 1, fm('theme: indaco')), ['a', 'b']);
  assert.equal(withoutAutoGlossary(undefined, 1, md), undefined);
});

// Reading text reads at --fs-body at every venue (2026-09-29-one-reading-size-per-venue.md), so a
// glossary with more terms than the room's budget pages instead of clipping. The budget is the
// glossary component's measured venueCapacity (venue-capacity.generated.js).
const manyTerms = (n) => `acronyms:\n${Array.from({ length: n }, (_, i) => `  T${String(i).padStart(2, '0')}: { expansion: term ${i}, definition: "A short definition for term number ${i}." }`).join('\n')}\nglossary: auto`;
const glossarySlides = (out) => (out.match(/<!-- _class: glossary -->/g) || []).length;

test('appendAutoGlossary: a glossary past the venue budget pages, evenly', () => {
  const VC = require('../../../lib/authoring/venue-capacity.generated.js');
  const rows = VC.items.glossary;
  const shortest = String(Math.min(...Object.keys(rows).map(Number)));
  const perLaptop = rows[shortest][0];
  const out = appendAutoGlossary(fm(manyTerms(perLaptop + 2)));
  assert.equal(glossarySlides(out), 2);
  assert.equal(autoGlossarySections(fm(manyTerms(perLaptop + 2))), 2);
  // An even cut: the two pages differ by at most one term.
  const pages = out.split('<!-- _class: glossary -->').slice(1).map((p) => (p.match(/^- /gm) || []).length);
  assert.ok(Math.abs(pages[0] - pages[1]) <= 1, `uneven pages ${pages}`);
  // At or under the budget it stays one slide.
  assert.equal(glossarySlides(appendAutoGlossary(fm(manyTerms(perLaptop)))), 1);
});

test('appendAutoGlossary: a bigger venue holds fewer terms a page', () => {
  const laptop = glossarySlides(appendAutoGlossary(fm(manyTerms(12))));
  const hall = glossarySlides(appendAutoGlossary(fm(`venue: hall\n${manyTerms(12)}`)));
  assert.ok(hall > laptop, `hall ${hall} pages, laptop ${laptop}`);
});

test('withoutAutoGlossary: drops every glossary page when the glossary paginates', () => {
  const md = fm(`venue: hall\n${manyTerms(12)}`);
  const n = autoGlossarySections(md);
  assert.ok(n > 1);
  const list = ['a', ...Array.from({ length: n }, () => 'glossary')];
  assert.deepEqual(withoutAutoGlossary(list, 1, md), ['a']);
});

test('GLOSSARY_VENUE_ROWS mirrors the generated glossary rows exactly', () => {
  // The kernel keeps its own copy so the docs bundle does not ship the whole table
  // (docs/route-budget.json). A re-measured glossary budget must update both.
  const VC = require('../../../lib/authoring/venue-capacity.generated.js');
  assert.deepEqual(JSON.parse(JSON.stringify(GLOSSARY_VENUE_ROWS)), VC.items.glossary);
});
