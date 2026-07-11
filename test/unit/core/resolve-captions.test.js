const test = require('node:test');
const assert = require('node:assert/strict');

// ESM module under test — dynamic import from this CJS test.
let parseNarrationFrontMatter, frontMatterCaptions;
test.before(async () => {
  ({ parseNarrationFrontMatter, frontMatterCaptions } = await import('../../../lib/core/resolve-captions.mjs'));
});

const fm = (body) => `---\n${body}\n---\n\n# Deck\n`;

test('acronyms: string shorthand → { expansion }', () => {
  const { acronyms } = parseNarrationFrontMatter(fm('acronyms:\n  CRO: chief revenue officer\n  GTM: go to market'));
  assert.deepEqual(acronyms.get('CRO'), { expansion: 'chief revenue officer' });
  assert.deepEqual(acronyms.get('GTM'), { expansion: 'go to market' });
});

test('acronyms: inline flow object with a comma-bearing quoted definition', () => {
  const { acronyms } = parseNarrationFrontMatter(
    fm('acronyms:\n  ARR: { expansion: annual recurring revenue, definition: "Revenue, recurring yearly." }'),
  );
  assert.deepEqual(acronyms.get('ARR'), {
    expansion: 'annual recurring revenue',
    definition: 'Revenue, recurring yearly.',
  });
});

test('acronyms: block object form (comma-safe definition, no quotes needed)', () => {
  const { acronyms } = parseNarrationFrontMatter(
    fm('acronyms:\n  EBITDA:\n    expansion: ee bit dah\n    definition: Earnings before interest, taxes, and amortization.'),
  );
  assert.equal(acronyms.get('EBITDA').expansion, 'ee bit dah');
  assert.match(acronyms.get('EBITDA').definition, /^Earnings before interest, taxes, and amortization\.$/);
});

test('acronyms: digit-leading terms are allowed', () => {
  const { acronyms } = parseNarrationFrontMatter(fm('acronyms:\n  5G: fifth generation\n  3PL: third party logistics'));
  assert.equal(acronyms.get('5G').expansion, 'fifth generation');
  assert.equal(acronyms.get('3PL').expansion, 'third party logistics');
});

test('acronyms: an entry with no expansion is skipped', () => {
  const { acronyms } = parseNarrationFrontMatter(fm('acronyms:\n  FOO:\n    definition: only a definition'));
  assert.equal(acronyms.has('FOO'), false);
});

test('acronyms: last duplicate wins', () => {
  const { acronyms } = parseNarrationFrontMatter(fm('acronyms:\n  X: first\n  X: second'));
  assert.equal(acronyms.get('X').expansion, 'second');
});

test('acronyms: a reserved field name (expansion/definition) is never a standalone term', () => {
  // An under-indented block-object child would otherwise become a bogus term.
  const { acronyms } = parseNarrationFrontMatter(fm('acronyms:\n  EBITDA:\n  expansion: ee bit dah'));
  assert.equal(acronyms.has('expansion'), false);
});

test('acronyms: the block is scoped (a dedented sibling key ends it)', () => {
  const { acronyms } = parseNarrationFrontMatter(
    fm('theme: indaco\nacronyms:\n  CRO: chief revenue officer\ncolor-mode: dark'),
  );
  assert.equal(acronyms.size, 1);
  assert.equal(acronyms.get('CRO').expansion, 'chief revenue officer');
});

test('tolerates trailing whitespace after the opening/closing fence (parity with app parsers)', () => {
  const { acronyms } = parseNarrationFrontMatter('--- \nacronyms:\n  CRO: chief revenue officer\n--- \n\n# Deck\n');
  assert.equal(acronyms.get('CRO').expansion, 'chief revenue officer'); // NOT silently dropped
});

test('absent key → empty map; non-string input is safe (never throws)', () => {
  assert.equal(parseNarrationFrontMatter(fm('theme: indaco')).acronyms.size, 0);
  assert.equal(parseNarrationFrontMatter('# no front matter\n').acronyms.size, 0);
  for (const v of [null, undefined, 42, {}]) {
    assert.equal(parseNarrationFrontMatter(v).acronyms.size, 0);
  }
});

// ── captions: (Layer 1 — slide-number-keyed read-as text) ───────────────────────────

test('captions: slide-number keys → text, kept as authored 1-based numbers', () => {
  const { captions } = parseNarrationFrontMatter(fm('captions:\n  3: FY26 revenue grew forty percent.\n  5: Net dollar retention held.'));
  assert.equal(captions.get(3), 'FY26 revenue grew forty percent.');
  assert.equal(captions.get(5), 'Net dollar retention held.');
  assert.equal(captions.size, 2);
});

test('captions: a quoted value keeps its leading/trailing space (quotes stripped)', () => {
  const { captions } = parseNarrationFrontMatter(fm('captions:\n  2: "  spaced read.  "'));
  assert.equal(captions.get(2), '  spaced read.  ');
});

test('captions: a non-integer key is skipped; an empty value is skipped', () => {
  const { captions } = parseNarrationFrontMatter(fm('captions:\n  intro: not a number\n  4:\n  6: kept'));
  assert.equal(captions.has(4), false); // empty value
  assert.equal(captions.size, 1);
  assert.equal(captions.get(6), 'kept');
});

test('captions: last duplicate key wins', () => {
  const { captions } = parseNarrationFrontMatter(fm('captions:\n  1: first\n  1: second'));
  assert.equal(captions.get(1), 'second');
});

test('captions: the block is scoped (a dedented sibling key ends it) and coexists with acronyms', () => {
  const { captions, acronyms } = parseNarrationFrontMatter(
    fm('acronyms:\n  CRO: chief revenue officer\ncaptions:\n  1: opener line.\ntheme: indaco'),
  );
  assert.equal(acronyms.get('CRO').expansion, 'chief revenue officer');
  assert.equal(captions.get(1), 'opener line.');
  assert.equal(captions.size, 1);
});

test('frontMatterCaptions is the captions map directly; absent key + bad input → empty, never throws', () => {
  assert.equal(frontMatterCaptions(fm('captions:\n  7: line.')).get(7), 'line.');
  assert.equal(frontMatterCaptions(fm('theme: indaco')).size, 0);
  for (const v of [null, undefined, 42, {}]) assert.equal(frontMatterCaptions(v).size, 0);
});
