const test = require('node:test');
const assert = require('node:assert/strict');

// ESM module under test — dynamic import from this CJS test.
let parseNarrationFrontMatter, frontMatterLang, lexiconMap, narration;
test.before(async () => {
  narration = await import('../../../lib/core/resolve-narration.mjs');
  ({ parseNarrationFrontMatter, frontMatterLang, lexiconMap } = narration);
});

const fm = (body) => `---\n${body}\n---\n\n# Deck\n`;

test('lexicon: parses a quoted glyph or a WORD → spoken override map', () => {
  const { lexicon } = parseNarrationFrontMatter(fm('lexicon:\n  "→": leads to\n  Kubernetes: koober-net-eez'));
  assert.equal(lexicon.get('→'), 'leads to');
  assert.equal(lexicon.get('Kubernetes'), 'koober-net-eez'); // a word key, not just a glyph
});

test('lexicon: an empty value is kept as the deliberate "silence this token" signal', () => {
  const { lexicon } = parseNarrationFrontMatter(fm('lexicon:\n  "🎯": ""\n  "★": '));
  assert.equal(lexicon.get('🎯'), '');
  assert.equal(lexicon.get('★'), '');
});

test('lexicon: a bare (unquoted) key works too, last-wins on a duplicate', () => {
  const { lexicon } = parseNarrationFrontMatter(fm('lexicon:\n  ÷: over\n  →: first\n  →: second'));
  assert.equal(lexicon.get('÷'), 'over');
  assert.equal(lexicon.get('→'), 'second');
});

test('lexicon: the old `symbols:` key is NOT an alias — only `lexicon:` is read (renamed pre-release)', () => {
  // #949 shipped the key as `symbols:`; #952 renamed it to `lexicon:` before any release and carries
  // no alias. A `symbols:` block must be inert so the sole author-facing key is `lexicon:`.
  assert.equal(lexiconMap(fm('symbols:\n  "→": to the')).size, 0);
  assert.equal(parseNarrationFrontMatter(fm('symbols:\n  "→": old\nlexicon:\n  "→": new')).lexicon.get('→'), 'new');
});

test('lexicon: a double-quoted value decodes escaped quotes/backslashes (writer↔reader symmetry)', () => {
  // The Studio writer escapes `"`→`\"` and `\`→`\\`; the reader must decode them or they leak.
  const { lexicon } = parseNarrationFrontMatter(fm('lexicon:\n  "x": "say \\"hi\\""\n  "y": "a\\\\b"'));
  assert.equal(lexicon.get('x'), 'say "hi"');
  assert.equal(lexicon.get('y'), 'a\\b');
});

test('lexicon: absent key → empty map; lexiconMap is the thin accessor', () => {
  assert.equal(parseNarrationFrontMatter(fm('theme: indaco')).lexicon.size, 0);
  assert.equal(lexiconMap(fm('lexicon:\n  "→": to the')).get('→'), 'to the');
});

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

test('blockLines is indent-aware: a nested key under lexicon is NOT double-parsed as its own block', () => {
  // A `acronyms:` header NESTED under `lexicon:` (indented) must not open an acronyms block —
  // else its children get parsed twice (once inside lexicon, once as acronyms). Only a ROOT
  // `acronyms:` (column 0) is a real block. Red-team follow-up, PR #952.
  const { acronyms, lexicon } = parseNarrationFrontMatter(
    fm('lexicon:\n  "→": to\n  acronyms:\n    CRO: chief revenue officer'),
  );
  assert.equal(acronyms.size, 0, 'the nested acronyms: is not a real block');
  assert.equal(lexicon.get('→'), 'to');
});

test('the parsers still round-trip together at the front-matter root, beside a retired say: map', () => {
  // acronyms (Layer 2) and lexicon (say-as) coexist and each parse cleanly; a retired `say:` block between them is
  // neither read nor allowed to bleed into its neighbors.
  const { acronyms, lexicon } = parseNarrationFrontMatter(
    fm('acronyms:\n  CRO: chief revenue officer\nsay:\n  2: FY26 revenue grew.\nlexicon:\n  "→": to\n  Kubernetes: koober-net-eez'),
  );
  assert.equal(acronyms.get('CRO').expansion, 'chief revenue officer');
  assert.equal(acronyms.size, 1);
  assert.equal(lexicon.get('→'), 'to');
  assert.equal(lexicon.get('Kubernetes'), 'koober-net-eez');
  assert.equal(lexicon.size, 2);
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

// ── the retired say: map (engineering/decisions/2026-11-20-four-notes.md N6) ─────────────────

test('the front-matter say: map is NOT read: a slide\'s say line lives on the slide as @say{…}', () => {
  const parsed = parseNarrationFrontMatter(fm('say:\n  3: FY26 revenue grew forty percent.\n  5: Net dollar retention held.'));
  assert.equal(Object.hasOwn(parsed, 'say'), false, 'the parse result carries no say map');
  assert.deepEqual(Object.keys(parsed).sort(), ['acronyms', 'lexicon', 'terms']);
  assert.equal(Object.hasOwn(narration, 'frontMatterSayMap'), false, 'the accessor is gone, not left returning an empty map');
  assert.equal(Object.hasOwn(narration.default, 'frontMatterSayMap'), false);
});

// The locale-guard signal (#919): the Marp `lang:` directive marks a deck's narration
// language. Both narration producers read it via this one helper so they can't drift.
test('frontMatterLang reads the Marp lang: directive, lowercased; absent → null', () => {
  assert.equal(frontMatterLang(fm('lang: fr')), 'fr');
  assert.equal(frontMatterLang(fm('lang: en-US')), 'en-us'); // lowercased for the isEnglishLang test
  assert.equal(frontMatterLang(fm('theme: indaco\nlang: "de"')), 'de'); // quoted, among other keys
  assert.equal(frontMatterLang(fm('theme: indaco')), null); // absent → null (English default)
});

test('frontMatterLang: bad input and a language: look-alike key never mis-fire', () => {
  for (const v of [null, undefined, 42, {}]) assert.equal(frontMatterLang(v), null);
  // `language:` must NOT match the `lang:` key (the `:` follows `lang` exactly).
  assert.equal(frontMatterLang(fm('language: klingon')), null);
});
