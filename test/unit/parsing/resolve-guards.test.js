/**
 * `guards:` register decisions. The register's job is small and its failure modes
 * are all "silently resolved to the baseline", so each case below is one of them.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  GUARDS_NAMES, readFrontMatterGuards, isKnownGuards,
  guardsClass, guardsClassFromSource, isGuardsToken, guardsEnabled,
} = require('../../../lib/core/resolve-guards');

const fm = (body) => `---\n${body}\n---\n\n# Slide\n`;

test('the vocabulary is loose | strict, and loose is the baseline', () => {
  assert.deepEqual([...GUARDS_NAMES], ['loose', 'strict']);
  assert.equal(guardsClass('loose'), '', 'loose must stamp NO token');
  assert.equal(guardsClass('strict'), 'guards-strict');
});

test('a deck that says nothing is byte-identical to one written before the register', () => {
  assert.equal(guardsClassFromSource(fm('marp: true\ntheme: indaco')), '');
  assert.equal(guardsClassFromSource(''), '');
  assert.equal(guardsClassFromSource(null), '');
});

test('reads the key from front matter, case- and space-insensitively', () => {
  assert.equal(readFrontMatterGuards(fm('guards: strict')), 'strict');
  assert.equal(guardsClassFromSource(fm('guards:   STRICT  ')), 'guards-strict');
  assert.equal(guardsClassFromSource(fm('theme: cuoio\nguards: strict\npaginate: true')), 'guards-strict');
});

test('an annotated value still resolves — the shared scalar rule, not a private regex', () => {
  // A `$`-anchored pattern here is how the same deck resolves differently on two
  // render paths. This is the case that catches it.
  assert.equal(guardsClassFromSource(fm('guards: strict  # for the board pack')), 'guards-strict');
});

test('an unknown value resolves to the baseline, which is why lint must flag it', () => {
  assert.equal(isKnownGuards('strict'), true);
  assert.equal(isKnownGuards('strictt'), false);
  assert.equal(guardsClassFromSource(fm('guards: strictt')), '',
    'an unknown value must not silently enable trimming');
});

test('a body-level `guards:` is not front matter', () => {
  assert.equal(readFrontMatterGuards('# Slide\n\nguards: strict\n'), null);
});

test('per-slide tokens are recognized and the opt-out wins', () => {
  assert.equal(isGuardsToken('guards-strict'), true);
  assert.equal(isGuardsToken('guards-loose'), true);
  assert.equal(isGuardsToken('guards'), false);

  assert.equal(guardsEnabled(['guards-strict']), true);
  assert.equal(guardsEnabled('content guards-strict'), true);
  assert.equal(guardsEnabled([]), false);
  assert.equal(guardsEnabled(['guards-strict', 'guards-loose']), false,
    'a slide opting out must beat the deck-wide token');
});
