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
 * #1896. `CLAUDE.md` is the only surface every session pays unconditionally, and it was
 * the only one in the context-tiering system with no budget. The gate is a BYTE ceiling
 * standing in for an o200k_base token budget, so the thing most worth testing is not the
 * comparison — it is that the substitution stays honest. If the file's bytes-per-token
 * ratio drifts, the byte number silently stops meaning the token number the gate's
 * docblock claims it means, and nothing else in the repo would notice.
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

  // THE SUBSTITUTION CHECK. 3.907 was measured across five revisions spanning +1,144
  // tokens, with a spread of 0.08% — that stability is the whole license for using bytes.
  // A 2% band is ~25x the observed drift, so this fails on a real change in what the file
  // is made of (a table of short cells, a wall of code fences) and not on ordinary prose.
  // Re-measure with o200k_base in a scratchpad; gpt-tokenizer is deliberately not a repo
  // dependency, which is exactly why this arm has to be a proxy check rather than a real one.
  test('the byte-per-token calibration still describes the file', () => {
    const text = fs.readFileSync(file, 'utf8');
    // A cheap, tokenizer-free stand-in for "what the file is made of": the share of bytes
    // that are whitespace, punctuation or digits rather than letters. o200k splits those
    // far more finely than prose words, so a move here is what would move the ratio.
    const nonWord = (text.match(/[^A-Za-z]/g) || []).length / text.length;
    assert.ok(
      nonWord > 0.24 && nonWord < 0.32,
      `CLAUDE.md is ${(nonWord * 100).toFixed(1)}% non-letter bytes, outside the 24-32% band the ` +
      `${ROUTER_BYTES_PER_TOKEN} bytes/token calibration was measured on. The byte ceiling may no ` +
      'longer mean the token budget it claims — re-measure with o200k_base and update ' +
      'ROUTER_BYTES_PER_TOKEN and ROUTER_BYTE_CEILING together.',
    );
  });

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
