/**
 * Unit: the `eyebrow:` register resolver (lib/core/resolve-eyebrow.js) — the EYEBROW accent
 * finish. Maps the deck front-matter `eyebrow:` value to the `eyebrow-<value>` class token
 * both render paths append to every section. `plain` is the default and carries NO token;
 * only dot / bar / arrow / underline do. Sibling of resolve-rule / resolve-spectrum / resolve-lift.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  EYEBROW_NAMES,
  EYEBROW_TOKENS,
  readFrontMatterEyebrow,
  isKnownEyebrow,
  eyebrowClass,
  eyebrowClassFromSource,
} = require('../../../lib/core/resolve-eyebrow');

describe('resolve-eyebrow', () => {
  test('dot / bar / arrow / underline map to their class token; plain maps to no token (default)', () => {
    assert.equal(eyebrowClass('dot'), 'eyebrow-dot');
    assert.equal(eyebrowClass('bar'), 'eyebrow-bar');
    assert.equal(eyebrowClass('arrow'), 'eyebrow-arrow');
    assert.equal(eyebrowClass('underline'), 'eyebrow-underline');
    assert.equal(eyebrowClass('plain'), '', 'plain is the default — no class');
  });

  test('omitted / unrecognized resolve to no class; case/whitespace-insensitive', () => {
    assert.equal(eyebrowClass(''), '');
    assert.equal(eyebrowClass('   '), '');
    assert.equal(eyebrowClass('dott'), '', 'typo → no class (deck-lint flags it)');
    assert.equal(eyebrowClass(undefined), '');
    assert.equal(eyebrowClass(null), '');
    assert.equal(eyebrowClass('  ARROW '), 'eyebrow-arrow');
  });

  test('isKnownEyebrow recognizes the five names only', () => {
    for (const n of ['plain', 'dot', 'bar', 'arrow', 'underline']) assert.ok(isKnownEyebrow(n), n);
    assert.ok(!isKnownEyebrow('tick'));
    assert.ok(!isKnownEyebrow(''));
    assert.ok(!isKnownEyebrow(undefined));
  });

  test('EYEBROW_NAMES / EYEBROW_TOKENS list the recognized set', () => {
    assert.deepEqual([...EYEBROW_NAMES], ['plain', 'dot', 'bar', 'arrow', 'underline']);
    assert.deepEqual([...EYEBROW_TOKENS], ['eyebrow-dot', 'eyebrow-bar', 'eyebrow-arrow', 'eyebrow-underline']);
  });

  test('readFrontMatterEyebrow extracts from the front-matter block only; quotes + absence', () => {
    const md = '---\nmarp: true\neyebrow: dot\n---\n\n# H\n\n`eyebrow: not-this` in body\n';
    assert.equal(readFrontMatterEyebrow(md), 'dot');
    assert.equal(eyebrowClassFromSource(md), 'eyebrow-dot');
    assert.equal(readFrontMatterEyebrow('---\neyebrow: "underline"\n---\n'), 'underline');
    assert.equal(readFrontMatterEyebrow('---\ntheme: carta\n---\n'), null);
    assert.equal(readFrontMatterEyebrow(''), null);
  });

  test('CSS contract — every token decorates the kicker; palette-blind (base.accent-finish.css)', () => {
    const css = fs.readFileSync(path.join(__dirname, '../../../lib/base/base.accent-finish.css'), 'utf8');
    for (const cls of EYEBROW_TOKENS) {
      assert.ok(css.includes(`.${cls}`), `${cls} has no rule in base.accent-finish.css`);
    }
    // Leading marks use gap, never margin (HARD RULE #20).
    assert.ok(!/section\.eyebrow-[a-z]+[^{]*\{[^}]*margin/.test(css), 'eyebrow marks must space with gap/padding, not margin');
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css), 'accent-finish CSS must be palette-blind (var(--token) only)');
  });
});
