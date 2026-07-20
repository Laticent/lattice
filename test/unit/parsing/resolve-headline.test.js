/**
 * Unit: the `headline:` register resolver (lib/core/resolve-headline.js) — the HEADLINE
 * ALIGNMENT register. Maps the deck front-matter `headline:` value to the `head-<value>`
 * class token both render paths append to every section. `auto` is the default and carries
 * NO token (the component keeps its baked alignment); only left / center / right do.
 * Sibling of resolve-eyebrow / resolve-rule / resolve-spectrum / resolve-lift.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  HEADLINE_NAMES,
  HEADLINE_TOKENS,
  readFrontMatterHeadline,
  isKnownHeadline,
  headlineClass,
  headlineClassFromSource,
} = require('../../../lib/core/resolve-headline');

describe('resolve-headline', () => {
  test('left / center / right map to their class token; auto maps to no token (default)', () => {
    assert.equal(headlineClass('left'), 'head-left');
    assert.equal(headlineClass('center'), 'head-center');
    assert.equal(headlineClass('right'), 'head-right');
    assert.equal(headlineClass('auto'), '', 'auto is the default — no class, component keeps its alignment');
  });

  test('omitted / unrecognized resolve to no class; case/whitespace-insensitive', () => {
    assert.equal(headlineClass(''), '');
    assert.equal(headlineClass('   '), '');
    assert.equal(headlineClass('centre'), '', 'British spelling → no class (deck-lint flags it)');
    assert.equal(headlineClass(undefined), '');
    assert.equal(headlineClass(null), '');
    assert.equal(headlineClass('  CENTER '), 'head-center');
  });

  test('isKnownHeadline recognizes the four names only', () => {
    for (const n of ['auto', 'left', 'center', 'right']) assert.ok(isKnownHeadline(n), n);
    assert.ok(!isKnownHeadline('centre'));
    assert.ok(!isKnownHeadline(''));
    assert.ok(!isKnownHeadline(undefined));
  });

  test('HEADLINE_NAMES / HEADLINE_TOKENS list the recognized set', () => {
    assert.deepEqual([...HEADLINE_NAMES], ['auto', 'left', 'center', 'right']);
    assert.deepEqual([...HEADLINE_TOKENS], ['head-left', 'head-center', 'head-right']);
  });

  test('readFrontMatterHeadline extracts from the front-matter block only; quotes + absence', () => {
    const md = '---\nmarp: true\nheadline: center\n---\n\n# H\n\n`headline: not-this` in body\n';
    assert.equal(readFrontMatterHeadline(md), 'center');
    assert.equal(headlineClassFromSource(md), 'head-center');
    assert.equal(readFrontMatterHeadline('---\nheadline: "left"\n---\n'), 'left');
    assert.equal(readFrontMatterHeadline('---\ntheme: carta\n---\n'), null);
    assert.equal(readFrontMatterHeadline(''), null);
  });

  test('CSS contract — every token drives the alignment seam; palette-blind, no margin', () => {
    const css = fs.readFileSync(path.join(__dirname, '../../../lib/base/base.accent-finish.css'), 'utf8');
    for (const cls of HEADLINE_TOKENS) {
      assert.ok(css.includes(`.${cls}`), `${cls} has no rule in base.accent-finish.css`);
    }
    // The register drives one inherited property, not a scattered set of text-aligns.
    assert.ok(css.includes('--headline-align'), 'the register must set the shared --headline-align seam');
    // Alignment is text-align/align-*, never margin (HARD RULE #20).
    assert.ok(!/section\.head-[a-z]+[^{]*\{[^}]*margin/.test(css), 'headline alignment must not use margin');
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css), 'accent-finish CSS must be palette-blind (var(--token) only)');
  });
});
