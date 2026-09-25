/**
 * `fit:` register decisions (engineering/decisions/2026-09-25-fit-policy.md) — the new
 * spelling of `guards:`, with a third level. Each case is one way a deck could silently
 * get a different level than its author wrote:
 *
 *   · `heal` is the default and stamps no token (byte-identical renders);
 *   · `fit:` wins over the old `guards:` when a deck carries both;
 *   · the old spelling still resolves (`strict` → trim, `loose` → heal);
 *   · `guardsEnabled` (the TRIM gate, injected on its own) and `fitLevel` agree on every
 *     combination of override tokens — the two are written out separately because the
 *     injected one may not call the other, and this is what keeps them one rule.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FIT_NAMES, FIT_TOKENS, GUARDS_TOKENS, fitClass, fitClassFromFrontMatter,
  readFrontMatterFit, isKnownFit, isGuardsToken, fitLevel, guardsEnabled,
} = require('../../../lib/core/resolve-guards');

test('the vocabulary is report | heal | trim, and heal is the default with no token', () => {
  assert.deepEqual([...FIT_NAMES], ['report', 'heal', 'trim']);
  assert.equal(fitClass('heal'), '');
  assert.equal(fitClass('report'), 'fit-report');
  assert.equal(fitClass('TRIM '), 'fit-trim');
  assert.equal(fitClass('bogus'), '', 'an unknown value falls to the default — lint flags it');
});

test('fit: wins over guards:, and guards: still resolves on its own', () => {
  assert.equal(fitClassFromFrontMatter('fit: report\nguards: strict'), 'fit-report');
  assert.equal(fitClassFromFrontMatter('guards: strict'), 'guards-strict');
  assert.equal(fitClassFromFrontMatter('guards: loose'), '');
  assert.equal(fitClassFromFrontMatter('title: x'), '');
  assert.equal(fitClassFromFrontMatter('fit: report  # for the rehearsal'), 'fit-report', 'an annotated value still resolves');
});

test('readFrontMatterFit / isKnownFit read the key the same way the engine does', () => {
  assert.equal(readFrontMatterFit('---\nfit: trim\n---\n\n# x\n'), 'trim');
  assert.equal(readFrontMatterFit('# no front matter'), null);
  assert.equal(isKnownFit(' Heal'), true);
  assert.equal(isKnownFit('strict'), false);
});

test('every override token, either spelling, is a register token', () => {
  for (const t of [...FIT_TOKENS, 'guards-strict', 'guards-loose']) assert.equal(isGuardsToken(t), true, t);
  assert.equal(isGuardsToken('fit'), false);
  assert.deepEqual([...GUARDS_TOKENS].sort(), [...FIT_TOKENS, 'guards-strict', 'guards-loose'].sort());
});

test('fitLevel reads the new spelling first, then the old, then the default', () => {
  assert.equal(fitLevel('list'), 'heal');
  assert.equal(fitLevel('list fit-report'), 'report');
  assert.equal(fitLevel(['fit-trim']), 'trim');
  assert.equal(fitLevel('guards-strict'), 'trim');
  assert.equal(fitLevel('guards-strict fit-heal'), 'heal', 'the new spelling wins');
});

test('guardsEnabled (the TRIM gate) is exactly fitLevel === "trim", over every token combination', () => {
  const pool = [...GUARDS_TOKENS];
  for (let mask = 0; mask < 1 << pool.length; mask++) {
    const cls = pool.filter((_, i) => mask & (1 << i));
    assert.equal(guardsEnabled(cls), fitLevel(cls) === 'trim', JSON.stringify(cls));
  }
});
