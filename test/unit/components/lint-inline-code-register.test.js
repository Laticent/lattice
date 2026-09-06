/**
 * THE `unknown-inline-code` RULE — the one gate between an author and a silent,
 * backwards failure, and until this file nothing in the tree touched it.
 *
 * WHY IT MATTERS MORE THAN A TYPO GUARD. `inlineCodeClass` maps anything that is not
 * exactly `literal` to the RUNNING default, on purpose: a typo must never quietly turn a
 * deck's pills off. The cost of that choice is the opposite failure — an author writes
 * `inline-code: off` (the word everyone reaches for first, and what this register was
 * called in its first draft), reads their own front matter, and gets pills anyway. This
 * rule is the only thing that tells them why. It is not decoration.
 *
 * IT WAS A SURVIVING MUTANT. An independent checker deleted the rule's call site in
 * `lintTextWith` and the whole suite stayed green; nothing in `test/` mentioned
 * `unknown-inline-code`. It also found the rule blind to a trailing YAML comment — so
 * `inline-code: off  # turn the pills off` linted CLEAN, disarming the guard with a `#`.
 * Both are covered below.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../../lib/authoring/lint-core');
const { INLINE_CODE_NAMES, INLINE_CODE_TOKENS } = require('../../../lib/core/resolve-inline-code');
const { buildVocab } = require('../../../lib/authoring/lint');

const deck = (fm) => `---\nmarp: true\ntheme: indaco\n${fm}\n---\n\n# T\n\nBody \`{A}\`.\n`;
const vocab = { names: new Set(['kpi']), modifiers: new Set(['dark']), inlineCodeNames: [...INLINE_CODE_NAMES] };
const warn = (fm) => core.lintTextWith(deck(fm), vocab).find((f) => f.rule === 'unknown-inline-code');

describe('unknown-inline-code', () => {
  test('the two real values lint clean', () => {
    for (const v of ['rich', 'literal', 'LITERAL', "'literal'", '"rich"']) {
      assert.equal(warn(`inline-code: ${v}`), undefined, `${v} is a valid value`);
    }
    assert.equal(warn('theme: indaco'), undefined, 'no key at all is not a finding');
  });

  test('`off` warns — the value an author reaches for first, which does nothing', () => {
    const f = warn('inline-code: off');
    assert.ok(f, 'the whole point of the rule');
    assert.equal(f.severity, 'warning');
    assert.match(f.message, /keep rendering pills and marks/);
    // The fix line has to name the real values, or the author is told they are wrong
    // without being told what to write.
    assert.match(f.fix, /rich/);
    assert.match(f.fix, /literal/);
  });

  test('a trailing YAML comment does not disarm it', () => {
    // The `$`-anchored regex this rule used to carry could not see past a comment, so the
    // single most likely way to write it — the switch plus the reason — was invisible.
    assert.ok(warn('inline-code: off  # imported deck, no pills please'), 'commented `off` must still warn');
    assert.equal(warn('inline-code: literal  # imported deck'), undefined, 'a commented VALID value is clean');
  });

  test('a value the engine cannot read as a name still warns', () => {
    // `frontMatterName` returns null for a non-bare value, which the engine treats as
    // UNSET — so the deck renders pills. A rule keyed on the same reader would see null
    // and say nothing, which is the failure wearing a different hat.
    for (const v of ['littéral', 'lit.eral', 'lit eral']) {
      assert.ok(warn(`inline-code: ${v}`), `${v} renders pills and must warn`);
    }
  });
});

describe('the per-slide token is in the modifier vocabulary', () => {
  test('`inline-code-literal` is a known universal modifier', () => {
    // ALSO A SURVIVING MUTANT: deleting `...INLINE_CODE_TOKENS` from `buildVocab` left the
    // whole suite green, while the per-slide spelling taught in base.docs.md and
    // base.registers.docs.md started reporting `unknown-class`. The docs and the linter
    // disagreed and nothing noticed.
    const v = buildVocab();
    for (const token of INLINE_CODE_TOKENS) {
      assert.ok(v.modifiers.has(token), `${token} must lint as a known modifier`);
      assert.ok(v.universalModifiers.has(token), `${token} must be UNIVERSAL — it is not one component's`);
    }
  });

  test('and a near-miss still reports unknown-class, so the check is not vacuous', () => {
    const v = buildVocab();
    assert.equal(v.modifiers.has('inline-code-litera'), false);
  });
});
