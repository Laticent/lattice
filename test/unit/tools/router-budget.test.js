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

  // This asserted the gate's count against `require('gpt-tokenizer').encode` and called that
  // independent. It is not: the package's CJS main RE-EXPORTS the o200k_base module, so both
  // sides were the same function object and the assertion read `n === n`. A checker caught it,
  // and by this commit's own standard — an assertion that reads like a guarantee and gives
  // none is worse than no assertion — it had to go.
  //
  // What is actually independent is a value not computed here. These counts are pinned from
  // OpenAI's own `tiktoken` (`o200k_base`, n_vocab 200019), cross-checked out of band against
  // 80 tracked `.md` files including `CLAUDE.md`: 80/80 matched. The emoji pair is the useful
  // one — it is 6 tokens under o200k_base and 9 under cl100k_base, so if a dependency bump
  // ever moves what the gate resolves to, this fails instead of silently re-budgeting.
  test('the encoding really is o200k_base, pinned against tiktoken', () => {
    const { encode } = require('gpt-tokenizer/encoding/o200k_base');
    for (const [input, expected] of [
      ['🚀🇬🇧', 6], // 9 under cl100k_base — this is the discriminator
      ['CLAUDE.md is the L0 router.', 10],
      ['function checkRouterBudget(errors) {', 7],
      ['', 0],
    ]) {
      assert.equal(encode(input).length, expected, `o200k_base count changed for ${JSON.stringify(input)}`);
    }
  });

  // THIS ASSERTS A PROPERTY OF THE CONSTANT, NOT OF TODAY'S FILE, and the difference is the
  // whole reason it was rewritten. It used to require `CEILING - live count > 1000`, which
  // quietly made the real budget 16,117 rather than 16,500: adding a rule the size of #22
  // (1,288 tokens) left `build:check` GREEN and turned `npm test` RED, while the decision
  // record said in terms that such a rule "fits without a trade". A test that shadows the
  // gate it accompanies is a second, secret ceiling.
  //
  // The property worth holding is that the CEILING was not pinned at zero slack over the file
  // it was chosen against. `US_ENGLISH_BUDGET` was a burn-down toward zero and that ratchet
  // shape was right for it; this file is ALLOWED to be its size, so a zero-slack gate here is
  // the "a bad gate is a permanent tax" case from CLAUDE.md's own second filter. Growth past
  // the ceiling is the GATE's job to report, and only the gate's.
  const BASELINE_AT_CHOOSING = 15117; // CLAUDE.md when the owner set the +10% headroom
  test('the ceiling was not pinned at zero slack over the file it was set against', () => {
    assert.ok(
      ROUTER_TOKEN_CEILING >= Math.round(BASELINE_AT_CHOOSING * 1.05),
      `${ROUTER_TOKEN_CEILING} is under 5% slack over the ${BASELINE_AT_CHOOSING} baseline it ` +
      'was chosen against. Lowering it that far turns a growth budget into a ratchet.',
    );
  });
});
