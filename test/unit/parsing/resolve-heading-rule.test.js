/**
 * Unit: the `heading-rule:` register resolver (lib/core/resolve-heading-rule.js) — the HEADING RULE accent
 * finish. Maps the deck front-matter `heading-rule:` value to the `rule-<value>` class token both
 * render paths append to every section. `auto` is the default and carries NO token; only
 * full / short / accent / none do. Sibling of resolve-spectrum / resolve-eyebrow / resolve-card-lift.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  HEADING_RULE_NAMES,
  HEADING_RULE_TOKENS,
  readFrontMatterHeadingRule,
  isKnownHeadingRule,
  headingRuleClass,
  headingRuleClassFromSource,
} = require('../../../lib/core/resolve-heading-rule');

describe('resolve-heading-rule', () => {
  test('full / short / accent / none map to their class token; auto maps to no token (default)', () => {
    assert.equal(headingRuleClass('full'), 'heading-rule-full');
    assert.equal(headingRuleClass('short'), 'heading-rule-short');
    assert.equal(headingRuleClass('accent'), 'heading-rule-accent');
    assert.equal(headingRuleClass('none'), 'no-heading-rule');
    assert.equal(headingRuleClass('auto'), '', 'auto is the default — no class');
  });

  test('omitted / unrecognized resolve to no class; case/whitespace-insensitive', () => {
    assert.equal(headingRuleClass(''), '');
    assert.equal(headingRuleClass('   '), '');
    assert.equal(headingRuleClass('fulll'), '', 'typo → no class (deck-lint flags it)');
    assert.equal(headingRuleClass(undefined), '');
    assert.equal(headingRuleClass(null), '');
    assert.equal(headingRuleClass('  SHORT '), 'heading-rule-short');
  });

  test('isKnownHeadingRule recognizes the five names only', () => {
    for (const n of ['auto', 'full', 'short', 'accent', 'none']) assert.ok(isKnownHeadingRule(n), n);
    assert.ok(!isKnownHeadingRule('underline'));
    assert.ok(!isKnownHeadingRule(''));
    assert.ok(!isKnownHeadingRule(undefined));
  });

  test('HEADING_RULE_NAMES / HEADING_RULE_TOKENS list the recognized set', () => {
    assert.deepEqual([...HEADING_RULE_NAMES], ['auto', 'full', 'short', 'accent', 'none']);
    assert.deepEqual([...HEADING_RULE_TOKENS], ['heading-rule-auto', 'heading-rule-full', 'heading-rule-short', 'heading-rule-accent', 'no-heading-rule', 'with-heading-rule']);
  });

  test('readFrontMatterHeadingRule extracts from the front-matter block only; quotes + absence', () => {
    const md = '---\nmarp: true\nheading-rule: short\n---\n\n# H\n\n`rule: not-this` in body\n';
    assert.equal(readFrontMatterHeadingRule(md), 'short');
    assert.equal(headingRuleClassFromSource(md), 'heading-rule-short');
    assert.equal(readFrontMatterHeadingRule('---\nheading-rule: "accent"\n---\n'), 'accent');
    assert.equal(readFrontMatterHeadingRule('---\ntheme: carta\n---\n'), null);
    assert.equal(readFrontMatterHeadingRule(''), null);
  });

  test('CSS contract — every token has a rule; palette-blind (base.accent-finish.css)', () => {
    const css = fs.readFileSync(path.join(__dirname, '../../../lib/base/base.accent-finish.css'), 'utf8');
    // `heading-rule-auto` and `with-heading-rule` are the restore tokens (a slide back on the default inside
    // a deck that set another value): they draw nothing of their own, so they have no rule, and must
    // not grow one.
    const RESTORES = ['heading-rule-auto', 'with-heading-rule'];
    for (const cls of HEADING_RULE_TOKENS.filter((t) => !RESTORES.includes(t))) {
      assert.ok(css.includes(`.${cls}`), `${cls} has no rule in base.accent-finish.css`);
    }
    for (const r of RESTORES) assert.ok(!css.includes(`.${r}`), `${r} is a restore token and draws nothing`);
    // accent draws in --accent; short/none/full are token-driven. The heading rule is a real
    // <hr class="masthead-rule"> in the lede (not a pseudo), so `accent` recolors that element.
    assert.match(css, /section\.heading-rule-accent\.form \.cell-masthead \.masthead-rule\s*\{\s*background:\s*var\(--accent\)/);
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css), 'accent-finish CSS must be palette-blind (var(--token) only)');
  });
});
