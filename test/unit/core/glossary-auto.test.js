const test = require('node:test');
const assert = require('node:assert/strict');

// ESM module under test — dynamic import from this CJS test (mirrors resolve-captions.test.js).
let appendAutoGlossary, glossaryEntries, resolveGlossaryMode, buildGlossarySlideMarkdown, readFrontMatterGlossary;
test.before(async () => {
  ({ appendAutoGlossary, glossaryEntries, resolveGlossaryMode, buildGlossarySlideMarkdown, readFrontMatterGlossary } = await import(
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
