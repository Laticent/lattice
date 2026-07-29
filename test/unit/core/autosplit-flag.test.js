/**
 * The deck-level `autosplit:` directive — ONE reader, and the default that flipped.
 *
 * This was two regexes in two files (the emulator's, deciding whether the engine
 * splits; lint-core's, deciding what the author is told). They agreed only by
 * coincidence, and the coincidence would have broken the moment the default changed —
 * which it did: split is now ON for a deck that says nothing. A portrait deck whose
 * author never heard of the flag now splits, so a linter still reading "opt-in" would
 * tell them their slide merely overflows. That is the lie-to-the-author defect the
 * split note's rule 10 is about, and it is why this is pinned rather than assumed.
 */

const test = require('node:test');
const assert = require('node:assert');

const { autosplitEnabled, autosplitDirective } = require('../../../lib/core/autosplit-flag');

test('autosplit directive', async (t) => {
  await t.test('DEFAULTS ON — a deck that says nothing gets the split move', () => {
    assert.strictEqual(autosplitEnabled('---\nsize: portrait\n---\n'), true);
    assert.strictEqual(autosplitEnabled(''), true);
    assert.strictEqual(autosplitDirective('---\nsize: portrait\n---\n'), null,
      'no directive is distinguishable from an explicit one — lint needs that to warn about a landscape opt-in');
  });

  await t.test('`off` opts out, in every accepted spelling', () => {
    for (const v of ['off', 'false', 'no', 'OFF', 'False']) {
      assert.strictEqual(autosplitEnabled(`---\nautosplit: ${v}\n---\n`), false, v);
      assert.strictEqual(autosplitDirective(`---\nautosplit: ${v}\n---\n`), false, v);
    }
  });

  await t.test('`on` still reads as an explicit opt-in', () => {
    for (const v of ['on', 'true', 'yes', 'ON']) {
      assert.strictEqual(autosplitEnabled(`---\nautosplit: ${v}\n---\n`), true, v);
      assert.strictEqual(autosplitDirective(`---\nautosplit: ${v}\n---\n`), true, v);
    }
  });

  await t.test('`off` WINS over a stray `on` — a deck that says both is opting out', () => {
    // Not a hypothetical tidiness rule: under the old default an unrecognized or
    // duplicated value read as "not on", which was also the default, so the mistake
    // was invisible. Now the two answers differ, and the safe reading of an ambiguous
    // deck is the one that changes nothing about its committed output.
    assert.strictEqual(autosplitEnabled('---\nautosplit: on\nautosplit: off\n---\n'), false);
  });

  await t.test('the directive is deck-level — an inline mention does not toggle it', () => {
    // The regex is line-anchored, so prose or a comment naming the flag is inert.
    assert.strictEqual(autosplitEnabled('---\nsize: portrait\n---\n\nWe set autosplit: off last quarter.\n'), true,
      'a sentence about the flag is not the flag');
  });

  await t.test('the engine and the linter read the same answer', () => {
    // The whole point of the module. Both consumers are required here rather than
    // re-implemented, so a future edit to either cannot silently diverge.
    const lintCore = require('../../../lib/authoring/lint-core');
    assert.ok(typeof lintCore.lintTextWith === 'function', 'lint-core loads with the shared reader');
    const emulatorSrc = require('node:fs')
      .readFileSync(require('node:path').join(__dirname, '..', '..', '..', 'lattice-emulator.js'), 'utf8');
    assert.match(emulatorSrc, /autosplit-flag'\)\.autosplitEnabled\(/,
      'the emulator must read the directive through the shared module, not its own regex');
    const lintSrc = require('node:fs')
      .readFileSync(require('node:path').join(__dirname, '..', '..', '..', 'lib', 'authoring', 'lint-core.js'), 'utf8');
    assert.doesNotMatch(lintSrc, /autosplit:\\s\*\(\?:on\|true\|yes\)/,
      'lint-core must not carry a second copy of the directive regex');
  });
});
