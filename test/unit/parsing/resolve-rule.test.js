/**
 * Unit: the `rule:` register resolver (lib/core/resolve-rule.js) — the HEADING RULE accent
 * finish. Maps the deck front-matter `rule:` value to the `rule-<value>` class token both
 * render paths append to every section. `auto` is the default and carries NO token; only
 * full / short / accent / none do. Sibling of resolve-spectrum / resolve-eyebrow / resolve-lift.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  RULE_NAMES,
  RULE_TOKENS,
  readFrontMatterRule,
  isKnownRule,
  ruleClass,
  ruleClassFromSource,
} = require('../../../lib/core/resolve-rule');

describe('resolve-rule', () => {
  test('full / short / accent / none map to their class token; auto maps to no token (default)', () => {
    assert.equal(ruleClass('full'), 'rule-full');
    assert.equal(ruleClass('short'), 'rule-short');
    assert.equal(ruleClass('accent'), 'rule-accent');
    assert.equal(ruleClass('none'), 'rule-none');
    assert.equal(ruleClass('auto'), '', 'auto is the default — no class');
  });

  test('omitted / unrecognized resolve to no class; case/whitespace-insensitive', () => {
    assert.equal(ruleClass(''), '');
    assert.equal(ruleClass('   '), '');
    assert.equal(ruleClass('fulll'), '', 'typo → no class (deck-lint flags it)');
    assert.equal(ruleClass(undefined), '');
    assert.equal(ruleClass(null), '');
    assert.equal(ruleClass('  SHORT '), 'rule-short');
  });

  test('isKnownRule recognizes the five names only', () => {
    for (const n of ['auto', 'full', 'short', 'accent', 'none']) assert.ok(isKnownRule(n), n);
    assert.ok(!isKnownRule('underline'));
    assert.ok(!isKnownRule(''));
    assert.ok(!isKnownRule(undefined));
  });

  test('RULE_NAMES / RULE_TOKENS list the recognized set', () => {
    assert.deepEqual([...RULE_NAMES], ['auto', 'full', 'short', 'accent', 'none']);
    assert.deepEqual([...RULE_TOKENS], ['rule-full', 'rule-short', 'rule-accent', 'rule-none']);
  });

  test('readFrontMatterRule extracts from the front-matter block only; quotes + absence', () => {
    const md = '---\nmarp: true\nrule: short\n---\n\n# H\n\n`rule: not-this` in body\n';
    assert.equal(readFrontMatterRule(md), 'short');
    assert.equal(ruleClassFromSource(md), 'rule-short');
    assert.equal(readFrontMatterRule('---\nrule: "accent"\n---\n'), 'accent');
    assert.equal(readFrontMatterRule('---\ntheme: carta\n---\n'), null);
    assert.equal(readFrontMatterRule(''), null);
  });

  test('CSS contract — every token has a rule; palette-blind (base.accent-finish.css)', () => {
    const css = fs.readFileSync(path.join(__dirname, '../../../lib/base/base.accent-finish.css'), 'utf8');
    for (const cls of RULE_TOKENS) {
      assert.ok(css.includes(`.${cls}`), `${cls} has no rule in base.accent-finish.css`);
    }
    // accent draws in --accent; short/none/full are token-driven.
    assert.match(css, /section\.rule-accent\.form \.cell-masthead::after\s*\{\s*background:\s*var\(--accent\)/);
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css), 'accent-finish CSS must be palette-blind (var(--token) only)');
  });
});
