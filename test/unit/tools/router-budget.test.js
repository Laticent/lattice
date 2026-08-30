const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  checkRouterBudget,
  ROUTER_FILE,
  ROUTER_BYTE_CEILING,
  ROUTER_BYTES_PER_TOKEN,
} = require('../../../tools/check-ownership.js');

const ROOT = path.join(__dirname, '..', '..', '..');

/**
 * #1896. `CLAUDE.md` is the only surface every session pays unconditionally, and it was the
 * only one in the context-tiering system with no budget. The gate is a BYTE ceiling standing
 * in for an o200k_base token budget. What that substitution rests on is one measurement — the
 * ratio's 0.08% spread across four distinct revisions of this one file — and what it does NOT
 * rest on is any check in this file, for the reason spelled out below.
 */
describe('the L0 router budget (#1896)', () => {
  const file = path.join(ROOT, ROUTER_FILE);
  const bytes = fs.statSync(file).size;

  test('CLAUDE.md is inside its ceiling', () => {
    const errors = [];
    checkRouterBudget(errors);
    assert.deepEqual(errors, [], `${ROUTER_FILE} is ${bytes} bytes, over ${ROUTER_BYTE_CEILING}`);
  });

  // A gate that cannot fail is a comment. Driven against the real check rather than a
  // reimplementation of it, by pointing the ceiling at the live file's own size.
  test('it fails, and the message says how to respond', () => {
    const errors = [];
    const original = fs.statSync;
    fs.statSync = (p, ...rest) => {
      const stat = original.call(fs, p, ...rest);
      return p === file ? { ...stat, size: ROUTER_BYTE_CEILING + 1 } : stat;
    };
    try {
      checkRouterBudget(errors);
    } finally {
      fs.statSync = original;
    }
    assert.equal(errors.length, 1);
    assert.match(errors[0], /over the \d+-byte/);
    assert.match(errors[0], /Raise the ceiling in the PR WITH the trade/);
    // The one wrong fix, named in the message on purpose: routing resident text behind a
    // pointer buys tokens by spending a read, which is the expensive half (#1897).
    assert.match(errors[0], /do not "fix" it by routing text behind a pointer/);
  });

  // THERE IS NO SUBSTITUTION CHECK, AND PRETENDING OTHERWISE WAS WORSE THAN NOTHING.
  //
  // A first version of this file asserted that CLAUDE.md's share of non-letter bytes stayed
  // in a 24-32% band, on the theory that composition drift is what would move bytes/token.
  // A checker was asked to break it and did, with the docblock's own example: fill the whole
  // 5,740-byte headroom with a CSS fence and the file is 17,342 real tokens while the gate
  // reports 16,509 — 5% understated — and the band sits at 29.6%, green. Identifier-dense
  // prose is worse. Across every tracked .md over 4k, non-letter share and bytes/token
  // correlate at r = -0.30; of the 625 repo files inside that band, bytes/token spans 3.53 to
  // 4.70. It could not have worked structurally either: 5,740 bytes is under 10% of the file,
  // so nothing that fits under the ceiling moves a whole-file ratio by 4.5 points.
  //
  // So the proxy is UNGUARDED, and that is stated rather than dressed up. What protects it is
  // the ceiling being low enough that drift cannot accumulate far before a human is in the
  // loop: raising it means re-measuring with o200k_base, which is when the calibration gets
  // re-derived. An assertion that reads like a guarantee and gives none is worse than the
  // honest sentence, because it is the sentence a future reader trusts.

  test('the ceiling leaves real headroom, and is not a zero-slack ratchet', () => {
    assert.ok(bytes < ROUTER_BYTE_CEILING, 'the file is already at or over the ceiling');
    const slackTokens = (ROUTER_BYTE_CEILING - bytes) / ROUTER_BYTES_PER_TOKEN;
    assert.ok(
      slackTokens > 1000,
      `only ${Math.round(slackTokens)} tokens of headroom. Zero slack was rejected on purpose: ` +
      'this file is ALLOWED to be its size, so a ratchet here is a permanent tax rather than a ' +
      'burn-down. If the file has grown into the ceiling, that is the gate working — raise it ' +
      'with the trade, in the PR.',
    );
  });
});
