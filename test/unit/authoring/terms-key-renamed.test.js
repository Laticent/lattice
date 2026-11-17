
// `terms-key-renamed`: `acronyms:` and `lexicon:` are older names for `terms:`
// (engineering/decisions/2026-11-16-terms-registry.md). A suggestion with a fix that keeps every
// term sounding the same and keeps what an acronym stands for.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../../lib/authoring/lint-core');

const vocab = { names: new Set(), modifiers: new Set(), capacity: {} };
const findings = (src) => core.lintTextWith(src, vocab).filter((f) => f.rule === 'terms-key-renamed');
let termEntries, termsSpokenMap;
test.before(async () => {
  ({ termEntries, termsSpokenMap } = await import('../../../lib/core/resolve-narration.mjs'));
});

describe('terms-key-renamed', () => {
  test('a terms: block, or no block, is silent', () => {
    assert.deepEqual(findings('---\nterms:\n  Derby: Darby\n---\n\n# Deck\n'), []);
    assert.deepEqual(findings('---\ntheme: indaco\n---\n\n# Deck\n'), []);
  });

  test('lexicon: is a suggestion whose fix renames the header and nothing else', () => {
    const src = '---\nlexicon:\n  Derby: Darby\n  "→": leads to\n---\n\n# Deck\n';
    const f = findings(src);
    assert.equal(f.length, 1);
    assert.equal(f[0].severity, 'suggestion');
    const fixed = core.fixAllDetailed(src, vocab).text;
    assert.equal(fixed, '---\nterms:\n  Derby: Darby\n  "→": leads to\n---\n\n# Deck\n');
    assert.deepEqual(findings(fixed), []);
  });

  test('acronyms: keeps each plain value as the expansion, quoting one the flow form would split', () => {
    const src = [
      '---',
      'theme: indaco # kept',
      'acronyms:',
      '  CRO: chief revenue officer',
      '  EMEA: Europe, the Middle East and Africa',
      '  ARR: { expansion: annual recurring revenue, definition: "Revenue that recurs." }',
      '  EBITDA:',
      '    expansion: ee bit dah',
      '    definition: "Operating profit."',
      '---',
      '',
      '# Deck',
      '',
    ].join('\n');
    const before = termsSpokenMap(src);
    const fixed = core.fixAllDetailed(src, vocab).text;
    assert.equal(fixed, [
      '---',
      'theme: indaco # kept',
      'terms:',
      '  CRO: { expansion: chief revenue officer }',
      '  EMEA: { expansion: "Europe, the Middle East and Africa" }',
      '  ARR: { expansion: annual recurring revenue, definition: "Revenue that recurs." }',
      '  EBITDA:',
      '    expansion: ee bit dah',
      '    definition: "Operating profit."',
      '---',
      '',
      '# Deck',
      '',
    ].join('\n'));
    assert.deepEqual(findings(fixed), []);
    // The voice says exactly what it said before, and every entry still knows what it stands for.
    assert.deepEqual([...termsSpokenMap(fixed)], [...before]);
    assert.equal(termEntries(fixed).get('EMEA').expansion, 'Europe, the Middle East and Africa');
    assert.equal(termEntries(fixed).get('EBITDA').definition, 'Operating profit.');
  });

  test('an acronyms: entry its own parser skips blocks the fix (renaming would start speaking it)', () => {
    const src = '---\nacronyms:\n  "R&D": research and development\n  CRO: chief revenue officer\n---\n\n# Deck\n';
    assert.deepEqual(findings(src).map((x) => [x.classToken, x.autofixable]), [['acronyms', false]]);
    assert.equal(core.fixAllDetailed(src, vocab).text, src);
  });

  test('an inline terms: line elsewhere blocks the fix too', () => {
    const src = '---\nlexicon:\n  Derby: Darby\nterms: {}\n---\n\n# Deck\n';
    assert.deepEqual(findings(src).map((x) => x.autofixable), [false]);
  });

  test('two blocks are reported without a fix (renaming one would leave two terms: blocks)', () => {
    const src = '---\nacronyms:\n  CRO: chief revenue officer\nlexicon:\n  Derby: Darby\n---\n\n# Deck\n';
    const f = findings(src);
    assert.deepEqual(f.map((x) => [x.classToken, x.autofixable]), [['acronyms', false], ['lexicon', false]]);
    assert.equal(core.fixAllDetailed(src, vocab).text, src);
  });
});
