/**
 * Unit: the `headline-align:` register resolver (lib/core/resolve-headline-align.js) — the HEADLINE
 * ALIGNMENT register. Maps the deck front-matter `headline-align:` value to the `head-<value>`
 * class token both render paths append to every section. `auto` is the default and carries
 * NO token (the component keeps its baked alignment); `left` and `center` carry tokens.
 * (`right` is a deferred follow-up — same box machinery as center, rarely wanted.)
 * Sibling of resolve-eyebrow / resolve-heading-rule / resolve-spectrum / resolve-card-lift.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  HEADLINE_ALIGN_NAMES,
  HEADLINE_ALIGN_TOKENS,
  readFrontMatterHeadlineAlign,
  isKnownHeadlineAlign,
  headlineAlignClass,
  headlineAlignClassFromSource,
} = require('../../../lib/core/resolve-headline-align');

describe('resolve-headline-align', () => {
  test('left / center / right map to their class tokens; auto maps to no token (default)', () => {
    assert.equal(headlineAlignClass('left'), 'headline-align-left');
    assert.equal(headlineAlignClass('center'), 'headline-align-center');
    assert.equal(headlineAlignClass('right'), 'headline-align-right');
    assert.equal(headlineAlignClass('auto'), '', 'auto is the default — no class, component keeps its alignment');
    assert.ok(isKnownHeadlineAlign('center'));
    assert.ok(isKnownHeadlineAlign('right'));
  });

  test('omitted / unrecognized resolve to no class; case/whitespace-insensitive', () => {
    assert.equal(headlineAlignClass(''), '');
    assert.equal(headlineAlignClass('   '), '');
    assert.equal(headlineAlignClass('lft'), '', 'typo → no class (deck-lint flags it)');
    assert.equal(headlineAlignClass(undefined), '');
    assert.equal(headlineAlignClass(null), '');
    assert.equal(headlineAlignClass('  LEFT '), 'headline-align-left');
  });

  test('isKnownHeadlineAlign recognizes the four names only', () => {
    for (const n of ['auto', 'left', 'center', 'right']) assert.ok(isKnownHeadlineAlign(n), n);
    // A near-miss that is NOT a name. This used to be the British `centre`; the
    // US-English sweep would have turned it into `center`, which IS one — so the
    // counter-example is now a form no spelling pass can collapse into a real name.
    assert.ok(!isKnownHeadlineAlign('centered'));
    assert.ok(!isKnownHeadlineAlign('middle'));
    assert.ok(!isKnownHeadlineAlign(''));
    assert.ok(!isKnownHeadlineAlign(undefined));
  });

  test('HEADLINE_ALIGN_NAMES / HEADLINE_ALIGN_TOKENS list the recognized set', () => {
    assert.deepEqual([...HEADLINE_ALIGN_NAMES], ['auto', 'left', 'center', 'right']);
    assert.deepEqual([...HEADLINE_ALIGN_TOKENS], ['headline-align-auto', 'headline-align-left', 'headline-align-center', 'headline-align-right']);
  });

  test('readFrontMatterHeadlineAlign extracts from the front-matter block only; quotes + absence', () => {
    const md = '---\nmarp: true\nheadline-align: left\n---\n\n# H\n\n`headline-align: not-this` in body\n';
    assert.equal(readFrontMatterHeadlineAlign(md), 'left');
    assert.equal(headlineAlignClassFromSource(md), 'headline-align-left');
    assert.equal(readFrontMatterHeadlineAlign('---\nheadline-align: "left"\n---\n'), 'left');
    assert.equal(readFrontMatterHeadlineAlign('---\ntheme: carta\n---\n'), null);
    assert.equal(readFrontMatterHeadlineAlign(''), null);
  });

  test('CSS contract — the token drives the alignment seam; palette-blind, no margin', () => {
    const css = fs.readFileSync(path.join(__dirname, '../../../lib/base/base.accent-finish.css'), 'utf8');
    // `headline-align-auto` is the restore token (a slide back on the default inside a deck that set another
    // value): it draws nothing of its own, so it has no rule, and must not grow one.
    for (const cls of HEADLINE_ALIGN_TOKENS.filter((t) => t !== 'headline-align-auto')) {
      assert.ok(css.includes(`.${cls}`), `${cls} has no rule in base.accent-finish.css`);
    }
    assert.ok(!css.includes('.headline-align-auto'), 'headline-align-auto is a restore token and draws nothing');
    // The register drives one inherited property, not a scattered set of text-aligns.
    assert.ok(css.includes('--headline-align'), 'the register must set the shared --headline-align seam');
    // center + right ship (box machinery via the flex lede + flexed framing containers).
    assert.ok(css.includes('headline-align-center'), 'headline-align-center must have a rule');
    assert.ok(css.includes('headline-align-right'), 'headline-align-right must have a rule (right ships)');
    // center anchors to the lede (spans-frame with no bay, beside-the-bay with one), so no
    // fragile `:has(:empty)` bay-collapse is needed — it must NOT ship.
    assert.ok(!css.includes(':empty'), 'center uses the lede anchor, not an empty-bay collapse');
    // Alignment is text-align/align-*, never margin (HARD RULE #20).
    assert.ok(!/section\.head-[a-z]+[^{]*\{[^}]*margin/.test(css), 'headline alignment must not use margin');
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css), 'accent-finish CSS must be palette-blind (var(--token) only)');
  });

  // Rot-guard (2026-07-20 trio, Munger #1): the seam is opt-in by convention — a framing paint
  // site only follows `headline-align:` if it READS `var(--headline-align, …)` (and `--headline-justify`
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
      'lib/plugins/chart-family/chart-family.styles.css',                   // chart caption
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
      ['lib/plugins/chart-family/chart-family.styles.css', /--headline-justify/], // chart caption align-items
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
