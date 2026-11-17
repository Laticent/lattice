
// The `terms:` registry and the two keys it absorbs (`acronyms:`, `lexicon:`), read as ONE map by
// lib/core/resolve-narration.mjs. engineering/decisions/2026-11-16-terms-registry.md §3.
const test = require('node:test');
const assert = require('node:assert/strict');

let termEntries, termsSpokenMap, glossaryEntries;
test.before(async () => {
  ({ termEntries, termsSpokenMap } = await import('../../../lib/core/resolve-narration.mjs'));
  ({ glossaryEntries } = await import('../../../lib/core/glossary-auto.mjs'));
});

const fm = (body) => `---\n${body}\n---\n\n# Deck\n`;

test('terms: a plain value is what the voice says; an empty one silences', () => {
  const md = fm('terms:\n  Derby: Darby\n  "🎯": ""\n  "Twinkima G": Twinkee mah Gee\n  "→": leads to');
  assert.deepEqual([...termsSpokenMap(md)], [['Derby', 'Darby'], ['🎯', ''], ['Twinkima G', 'Twinkee mah Gee'], ['→', 'leads to']]);
  assert.deepEqual(termEntries(md).get('Derby'), { pronounce: 'Darby', from: 'terms' });
});

test('terms: the object form keeps meaning, pronunciation and definition apart', () => {
  const md = fm([
    'terms:',
    '  EBITDA:',
    '    expansion: earnings before interest, taxes, depreciation and amortization',
    '    pronounce: ee bit dah',
    '    definition: "A measure of operating profit."',
    '  ARR: { expansion: annual recurring revenue, definition: "Revenue that recurs." }',
    '  Glossary-only: { definition: "Has no spoken form." }',
  ].join('\n'));
  const e = termEntries(md);
  assert.deepEqual(e.get('EBITDA'), {
    expansion: 'earnings before interest, taxes, depreciation and amortization',
    pronounce: 'ee bit dah',
    definition: 'A measure of operating profit.',
    from: 'terms',
  });
  // The voice says `pronounce`, else `expansion`; a definition-only entry says nothing.
  const spoken = termsSpokenMap(md);
  assert.equal(spoken.get('EBITDA'), 'ee bit dah');
  assert.equal(spoken.get('ARR'), 'annual recurring revenue');
  assert.equal(spoken.has('Glossary-only'), false);
});

test('terms: acronyms: and lexicon: read as aliases, and terms: wins a clash', () => {
  const md = fm([
    'lexicon:',
    '  Derby: Dorby',
    '  Q3: lexicon q3',
    'acronyms:',
    '  CRO: chief revenue officer',
    '  Q3: acronyms q3',
    'terms:',
    '  Derby: Darby',
  ].join('\n'));
  const e = termEntries(md);
  assert.deepEqual(e.get('CRO'), { expansion: 'chief revenue officer', from: 'acronyms' });
  assert.deepEqual(e.get('Derby'), { pronounce: 'Darby', from: 'terms' });
  assert.equal(termsSpokenMap(md).get('Q3'), 'acronyms q3'); // acronyms beat lexicon, as before
});

test('terms: a terms: entry overrides only the fields it sets', () => {
  const md = fm('acronyms:\n  CRO: chief revenue officer\nterms:\n  CRO: { definition: "Owns revenue." }');
  assert.deepEqual(termEntries(md).get('CRO'), { expansion: 'chief revenue officer', definition: 'Owns revenue.', from: 'terms' });
  assert.equal(termsSpokenMap(md).get('CRO'), 'chief revenue officer');
});

test('terms: an under-indented field line is never read as a term of its own', () => {
  const md = fm('terms:\n  EBITDA:\n  pronounce: ee bit dah');
  assert.equal(termEntries(md).has('pronounce'), false);
});

test('glossary: a terms: definition reaches the glossary; a lexicon: entry never does', () => {
  const md = fm('lexicon:\n  Derby: Darby\nterms:\n  ARR: { expansion: annual recurring revenue, definition: "Revenue that recurs." }');
  assert.deepEqual(glossaryEntries(md), [{ term: 'ARR', definition: 'Revenue that recurs.' }]);
});
