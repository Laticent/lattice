/**
 * Unit: the `headline:` register resolver (lib/core/resolve-headline.js) — the HEADLINE
 * ALIGNMENT register. Maps the deck front-matter `headline:` value to the `head-<value>`
 * class token both render paths append to every section. `auto` is the default and carries
 * NO token (the component keeps its baked alignment); only `left` does. (`center`/`right`
 * are a deferred follow-up — see the decision doc § "Scoped to auto + left".)
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
  test('left maps to its class token; auto maps to no token (default)', () => {
    assert.equal(headlineClass('left'), 'head-left');
    assert.equal(headlineClass('auto'), '', 'auto is the default — no class, component keeps its alignment');
  });

  test('center / right are not (yet) recognized — deferred follow-up', () => {
    assert.equal(headlineClass('center'), '', 'center is deferred → no class (deck-lint flags it)');
    assert.equal(headlineClass('right'), '', 'right is deferred → no class');
    assert.ok(!isKnownHeadline('center'));
    assert.ok(!isKnownHeadline('right'));
  });

  test('omitted / unrecognized resolve to no class; case/whitespace-insensitive', () => {
    assert.equal(headlineClass(''), '');
    assert.equal(headlineClass('   '), '');
    assert.equal(headlineClass('lft'), '', 'typo → no class (deck-lint flags it)');
    assert.equal(headlineClass(undefined), '');
    assert.equal(headlineClass(null), '');
    assert.equal(headlineClass('  LEFT '), 'head-left');
  });

  test('isKnownHeadline recognizes the two names only', () => {
    for (const n of ['auto', 'left']) assert.ok(isKnownHeadline(n), n);
    assert.ok(!isKnownHeadline('centre'));
    assert.ok(!isKnownHeadline(''));
    assert.ok(!isKnownHeadline(undefined));
  });

  test('HEADLINE_NAMES / HEADLINE_TOKENS list the recognized set', () => {
    assert.deepEqual([...HEADLINE_NAMES], ['auto', 'left']);
    assert.deepEqual([...HEADLINE_TOKENS], ['head-left']);
  });

  test('readFrontMatterHeadline extracts from the front-matter block only; quotes + absence', () => {
    const md = '---\nmarp: true\nheadline: left\n---\n\n# H\n\n`headline: not-this` in body\n';
    assert.equal(readFrontMatterHeadline(md), 'left');
    assert.equal(headlineClassFromSource(md), 'head-left');
    assert.equal(readFrontMatterHeadline('---\nheadline: "left"\n---\n'), 'left');
    assert.equal(readFrontMatterHeadline('---\ntheme: carta\n---\n'), null);
    assert.equal(readFrontMatterHeadline(''), null);
  });

  test('CSS contract — the token drives the alignment seam; palette-blind, no margin', () => {
    const css = fs.readFileSync(path.join(__dirname, '../../../lib/base/base.accent-finish.css'), 'utf8');
    for (const cls of HEADLINE_TOKENS) {
      assert.ok(css.includes(`.${cls}`), `${cls} has no rule in base.accent-finish.css`);
    }
    // The register drives one inherited property, not a scattered set of text-aligns.
    assert.ok(css.includes('--headline-align'), 'the register must set the shared --headline-align seam');
    // center/right machinery is deferred — it must NOT ship (no head-center/right, no bay collapse).
    assert.ok(!css.includes('head-center') && !css.includes('head-right'), 'center/right are deferred — no head-center/head-right in shipped CSS');
    assert.ok(!css.includes(':empty'), 'the empty-bay collapse was center/right-only — deferred');
    // Alignment is text-align/align-*, never margin (HARD RULE #20).
    assert.ok(!/section\.head-[a-z]+[^{]*\{[^}]*margin/.test(css), 'headline alignment must not use margin');
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css), 'accent-finish CSS must be palette-blind (var(--token) only)');
  });

  // Rot-guard (2026-07-20 trio, Munger #1): the seam is opt-in by convention — a framing paint
  // site only follows `headline:` if it READS `var(--headline-align, …)` (and `--headline-justify`
  // for the flex-boxed pieces). There is no machine definition of "all framing text", so this
  // can't catch a NEW component that forgets to opt in (documented coverage boundary). What it
  // DOES catch: a regression that drops the seam read from a currently-covered site. Extend this
  // list when a new site is retrofitted. Under the auto+left scope, prose pieces align via
  // `--headline-align` (text-align); the flex-boxed pieces additionally read `--headline-justify`.
  test('rot-guard — every covered framing paint site reads the seam', () => {
    const read = (p) => fs.readFileSync(path.join(__dirname, '../../../', p), 'utf8');
    // Every covered site reads --headline-align (text-align).
    const ALIGN = [
      'lib/forms/cell/masthead-lede/masthead-lede.css',                        // eyebrow + heading
      'lib/base/base.modifiers.css',                                           // key insight + divider.light eyebrow
      'lib/components/comparison/compare-prose/compare-prose.styles.css',      // below-note
      'lib/components/chart/_chart-family/chart-family.css',                   // chart caption
      'lib/components/diagram/diagram/diagram.styles.css',                     // diagram dek + caption
      'lib/components/anchor/title/title.styles.css',
      'lib/components/anchor/closing/closing.styles.css',
      'lib/components/anchor/divider/divider.styles.css',
      'lib/components/evidence/stats/stats.styles.css',
      'lib/components/progression/list-steps/list-steps.styles.css',
    ];
    for (const file of ALIGN) {
      assert.ok(/--headline-align/.test(read(file)), `${file} no longer reads --headline-align — coverage regressed`);
    }
    // The flex-positioned pieces additionally read --headline-justify (align-items/self).
    const JUSTIFY = [
      ['lib/base/base.elements.css', /section hr[^}]*--headline-justify/],     // the free hr
      ['lib/components/chart/_chart-family/chart-family.css', /--headline-justify/], // chart caption align-items
      ['lib/components/anchor/title/title.styles.css', /--headline-justify/],
      ['lib/components/anchor/closing/closing.styles.css', /--headline-justify/],
      ['lib/components/anchor/divider/divider.styles.css', /--headline-justify/],
      ['lib/components/evidence/stats/stats.styles.css', /--headline-justify/],
      ['lib/components/progression/list-steps/list-steps.styles.css', /--headline-justify/],
    ];
    for (const [file, re] of JUSTIFY) {
      assert.ok(re.test(read(file)), `${file} no longer reads --headline-justify — coverage regressed`);
    }
  });
});
