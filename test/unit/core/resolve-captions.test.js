const test = require('node:test');
const assert = require('node:assert/strict');

// ESM module under test — dynamic import from this CJS test.
let parseNarrationFrontMatter;
test.before(async () => {
  ({ parseNarrationFrontMatter } = await import('../../../lib/core/resolve-captions.mjs'));
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

test('captions: 1-based slide-number map, quotes stripped', () => {
  const { captions } = parseNarrationFrontMatter(fm('captions:\n  1: "Welcome. Three things today."\n  4: The ask.'));
  assert.equal(captions.get(1), 'Welcome. Three things today.');
  assert.equal(captions.get(4), 'The ask.');
  assert.equal(captions.size, 2);
});

test('both blocks coexist and are scoped (a dedented sibling key ends the block)', () => {
  const { acronyms, captions } = parseNarrationFrontMatter(
    fm('theme: indaco\nacronyms:\n  CRO: chief revenue officer\ncaptions:\n  2: "Second slide."\ncolor-mode: dark'),
  );
  assert.equal(acronyms.size, 1);
  assert.equal(acronyms.get('CRO').expansion, 'chief revenue officer');
  assert.equal(captions.size, 1);
  assert.equal(captions.get(2), 'Second slide.');
});

test('absent keys → empty maps (never throws)', () => {
  const { acronyms, captions } = parseNarrationFrontMatter(fm('theme: indaco'));
  assert.equal(acronyms.size, 0);
  assert.equal(captions.size, 0);
  const none = parseNarrationFrontMatter('# no front matter\n');
  assert.equal(none.acronyms.size, 0);
  assert.equal(none.captions.size, 0);
});

test('non-string input is safe', () => {
  for (const v of [null, undefined, 42, {}]) {
    const r = parseNarrationFrontMatter(v);
    assert.equal(r.acronyms.size, 0);
    assert.equal(r.captions.size, 0);
  }
});
