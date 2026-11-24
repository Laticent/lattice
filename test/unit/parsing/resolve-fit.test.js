/**
 * `fit:` register decisions (engineering/decisions/2026-09-25-fit-policy.md). Each case is
 * one way a deck could silently get a different level than its author wrote:
 *
 *   · `heal` is the default and stamps no token (byte-identical renders);
 *   · an annotated or oddly cased value still resolves, and an unknown one falls to the default;
 *   · the retired `guards:` spelling resolves to NOTHING (renames decision D2, 2026-11-21) —
 *     lint's `guards-renamed` rewrites it, the engine never reads it;
 *   · `trimEnabled` (the TRIM gate, injected on its own) and `fitLevel` agree on every
 *     combination of override tokens — the two are written out separately because the
 *     injected one may not call the other, and this is what keeps them one rule.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const fit = require('../../../lib/core/resolve-fit');
const {
  FIT_NAMES, FIT_TOKENS, fitClass, fitClassFromFrontMatter,
  readFrontMatterFit, isKnownFit, isFitToken, fitLevel, trimEnabled,
} = fit;

test('the vocabulary is report | heal | trim, and heal is the default with no token', () => {
  assert.deepEqual([...FIT_NAMES], ['report', 'heal', 'trim']);
  assert.equal(fitClass('heal'), '');
  assert.equal(fitClass('report'), 'fit-report');
  assert.equal(fitClass('TRIM '), 'fit-trim');
  assert.equal(fitClass('bogus'), '', 'an unknown value falls to the default — lint flags it');
});

test('fitClassFromFrontMatter reads fit:, annotated or not, and nothing else', () => {
  assert.equal(fitClassFromFrontMatter('fit: report'), 'fit-report');
  assert.equal(fitClassFromFrontMatter('theme: cuoio\nfit:   TRIM  \npaginate: true'), 'fit-trim');
  assert.equal(fitClassFromFrontMatter('fit: report  # for the rehearsal'), 'fit-report', 'an annotated value still resolves');
  assert.equal(fitClassFromFrontMatter('title: x'), '');
  assert.equal(fitClassFromFrontMatter(''), '');
});

test('the retired guards: spelling resolves to nothing, alone or beside fit:', () => {
  assert.equal(fitClassFromFrontMatter('guards: strict'), '', 'guards: strict must not enable trimming any more');
  assert.equal(fitClassFromFrontMatter('guards: loose'), '');
  assert.equal(fitClassFromFrontMatter('fit: report\nguards: strict'), 'fit-report');
  for (const gone of ['GUARDS_NAMES', 'GUARDS_TOKENS', 'guardsClass', 'guardsEnabled', 'GUARDS_ENABLED_SRC', 'isGuardsToken', 'readFrontMatterGuards']) {
    assert.equal(fit[gone], undefined, `${gone} is the old spelling's and is gone`);
  }
});

test('readFrontMatterFit / isKnownFit read the key the same way the engine does', () => {
  assert.equal(readFrontMatterFit('---\nfit: trim\n---\n\n# x\n'), 'trim');
  assert.equal(readFrontMatterFit('# no front matter'), null);
  assert.equal(readFrontMatterFit('# Slide\n\nfit: trim\n'), null, 'a body-level `fit:` is not front matter');
  assert.equal(isKnownFit(' Heal'), true);
  assert.equal(isKnownFit('strict'), false);
});

test('only the fit-* tokens are register tokens', () => {
  for (const t of FIT_TOKENS) assert.equal(isFitToken(t), true, t);
  for (const t of ['fit', 'guards-strict', 'guards-loose']) assert.equal(isFitToken(t), false, t);
});

test('fitLevel reads the slide token, then the default', () => {
  assert.equal(fitLevel('list'), 'heal');
  assert.equal(fitLevel('list fit-report'), 'report');
  assert.equal(fitLevel(['fit-trim']), 'trim');
  assert.equal(fitLevel('guards-strict'), 'heal', 'the retired class does nothing');
});

test('trimEnabled (the TRIM gate) is exactly fitLevel === "trim", over every token combination', () => {
  const pool = [...FIT_TOKENS, 'guards-strict', 'guards-loose'];
  for (let mask = 0; mask < 1 << pool.length; mask++) {
    const cls = pool.filter((_, i) => mask & (1 << i));
    assert.equal(trimEnabled(cls), fitLevel(cls) === 'trim', JSON.stringify(cls));
    assert.equal(trimEnabled(cls.join(' ')), fitLevel(cls) === 'trim', `as a class string: ${cls.join(' ')}`);
  }
});

test('TRIM_ENABLED_SRC is trimEnabled itself, closure-free', () => {
  const injected = new Function(`return (${fit.TRIM_ENABLED_SRC})`)();
  assert.equal(injected(['fit-trim']), true);
  assert.equal(injected('content fit-trim fit-report'), false);
  assert.equal(injected(['guards-strict']), false);
});
