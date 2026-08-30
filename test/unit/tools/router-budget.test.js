const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  checkRouterBudget,
  routerTokenCount,
  ROUTER_FILE,
  ROUTER_TOKEN_CEILING,
} = require('../../../tools/check-ownership.js');

const ROOT = path.join(__dirname, '..', '..', '..');

/**
 * #1896. `CLAUDE.md` is the only surface every session pays unconditionally, and it was the
 * only one in the context-tiering system with no budget.
 *
 * THE GATE MEASURES WHAT IT CLAIMS, and this file is much shorter than it was because of it.
 * The first version counted BYTES against a calibrated ratio and this suite tried to guard
 * the substitution with a composition check — the share of non-letter bytes staying in a
 * 24-32% band. A checker was asked to break it and did, with the gate docblock's own example:
 * fill the headroom with a CSS fence and the file is 5% more tokens than the gate reports,
 * with the band green at 29.6%. Non-letter share and bytes/token correlate at r = -0.30
 * across the repo. The check was decorative, and an assertion that reads like a guarantee and
 * gives none is worse than no assertion, because it is the one a future reader trusts.
 *
 * With a real tokenizer there is nothing to guard: the number the gate reports IS the number.
 * What is worth testing is that it can fail, and that it agrees with an independent count.
 */
describe('the L0 router budget (#1896)', () => {
  const file = path.join(ROOT, ROUTER_FILE);
  const text = fs.readFileSync(file, 'utf8');

  test('CLAUDE.md is inside its ceiling', () => {
    const errors = [];
    checkRouterBudget(errors);
    assert.deepEqual(
      errors, [],
      `${ROUTER_FILE} is ${routerTokenCount(text)} tokens, over the ${ROUTER_TOKEN_CEILING} ceiling`,
    );
  });

  // A gate that cannot fail is a comment. Driven against the real check rather than a
  // reimplementation, by handing it a file whose token count is known to exceed the ceiling.
  test('it fails, and the message says how to respond', () => {
    const errors = [];
    const realRead = fs.readFileSync;
    // The ceiling in words, then some — cheap to build and unambiguously over.
    const oversized = 'budget '.repeat(ROUTER_TOKEN_CEILING + 500);
    fs.readFileSync = (p, ...rest) => (p === file ? oversized : realRead.call(fs, p, ...rest));
    try {
      checkRouterBudget(errors);
    } finally {
      fs.readFileSync = realRead;
    }
    assert.equal(errors.length, 1);
    assert.match(errors[0], /o200k_base tokens .* over the \d+-token ceiling/);
    assert.match(errors[0], /Raise the ceiling in the PR WITH the trade/);
    // The one wrong fix, named in the message on purpose: routing resident text behind a
    // pointer buys tokens by spending a read, which is the expensive half (#1897).
    assert.match(errors[0], /do not "fix" it by routing text behind a pointer/);
  });

  // The gate and this test could both be wrong in the same direction if they shared a helper,
  // so the count is re-derived here from the package's own entry point rather than the gate's.
  test('the count agrees with an independent o200k_base encode', () => {
    const { encode } = require('gpt-tokenizer');
    assert.equal(routerTokenCount(text), encode(text).length);
  });

  test('the ceiling leaves real headroom, and is not a zero-slack ratchet', () => {
    const tokens = routerTokenCount(text);
    assert.ok(tokens < ROUTER_TOKEN_CEILING, `${tokens} is already at or over ${ROUTER_TOKEN_CEILING}`);
    assert.ok(
      ROUTER_TOKEN_CEILING - tokens > 1000,
      `only ${ROUTER_TOKEN_CEILING - tokens} tokens of headroom. Zero slack was rejected on ` +
      'purpose: this file is ALLOWED to be its size, so a ratchet here is a permanent tax ' +
      'rather than a burn-down. If the file has grown into the ceiling, that is the gate ' +
      'working — raise it with the trade, in the PR.',
    );
  });
});
