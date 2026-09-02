/**
 * The CSS-ONLY FALLBACK UNION must equal the catalog's below-note set.
 *
 * Two tiers render the trailing beats' chrome (lib/base/base.modifiers.css §
 * THE TRAILING BEATS' CHROME). Tier 1 keys on the `.below-note` WRAPPER and names
 * no component: the kernel only emits that wrapper where `rendersBeat` said yes, so
 * the class IS the permission and there is nothing left for CSS to decide. (It is
 * keyed on the wrapper rather than on `.cell-coda` because the cell is a DOM PATH —
 * a hand-authored `.below-note` that the Form transform folds into `.cell-stage` is
 * a real shape, and keying on the cell dropped the register for it.) Tier 2 is the
 * fallback for a Marp deck that
 * loads `lattice.css` WITHOUT the runtime: no coda cell, no Form structure, and
 * the layout's claim visible only in its class name. That tier has to enumerate,
 * and an enumeration is exactly what rotted before.
 *
 * WHAT ROTTED, MEASURED. The annotation register used to be a hand-written
 * OPT-IN union of seventeen layouts. Rendered through the real emulator, one
 * probe slide per component, measured in Chromium: 15 layouts got the spark and
 * 19 that render a below-note got an ordinary one instead. Two of the seventeen
 * — `timeline` and `principles` — are not components but VARIANT classes, so the
 * union was also reaching across an axis it never declared: `timeline` was its
 * only route into an `inventory timeline` slide. (An earlier revision of this
 * docstring said those arms "had never matched anything in any render." That was
 * wrong, and wrong in a way this file should record: the probe behind it rendered
 * one slide per component NAME and never composed a variant, so it could not have
 * seen a match if one existed.)
 *
 * THIS TEST DERIVES, IT DOES NOT MIRROR. The expected set comes from
 * `blocksFor()`, the same predicate the render and the published
 * `authoring.blocks` contract read (HARD RULE #1). So it fails in BOTH
 * directions — a layout that gains the note and is missing from the CSS, and a
 * name in the CSS that no longer renders one. That direction matters: this is
 * NOT the CSS-parsing drift test the coda change deleted, which mirrored a
 * `:not()` chain into a hand-kept JS array and could only ever confirm that two
 * hand-written lists still matched each other.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CATALOG = require('../../../lib/forms/cell/coda/coda-catalog.generated.js');
const { blocksFor } = require('../../../lib/core/authoring-blocks');

const CSS_PATH = path.join(__dirname, '..', '..', '..', 'lib', 'base', 'base.modifiers.css');
const css = fs.readFileSync(CSS_PATH, 'utf8');

/** Every layout the catalog says renders a below-note. */
function expectedSet() {
  return Object.keys(CATALOG).filter((name) => blocksFor(name).includes('below-note')).sort();
}

/**
 * The class names in each `section:is( … ):not(:has(.below-note))` head.
 *
 * Matched on the WHOLE head rather than by scraping every `.name` in the file:
 * a looser scan would happily pass on a union that had been split in half.
 */
function fallbackUnions() {
  const re = /section:is\(([^)]*)\):not\(\.no-note\):not\(:has\(\.below-note\)\)/g;
  const found = [];
  let m;
  while ((m = re.exec(css))) {
    found.push(m[1].split(',').map((s) => s.trim().replace(/^\./, '')).filter(Boolean).sort());
  }
  return found;
}

describe('coda CSS-only fallback union', () => {
  // Tier 2 is FOUR rules and the count is pinned, because "every union agrees" is
  // satisfied by deleting one. Measured: removing the tier-2 spark rule outright left
  // three identical, catalog-matching unions and this suite stayed green — the exact
  // half-styled-note failure the register's three arms exist to prevent, passing.
  const TIER2_ARMS = 4; // below-note type · below-note hairline · annotation type+rule · annotation ✦

  test('the fallback tier exists, is complete, and every arm carries the same union', () => {
    const unions = fallbackUnions();
    assert.equal(unions.length, TIER2_ARMS,
      `tier 2 has ${unions.length} arms, expected ${TIER2_ARMS} (below-note type + hairline, annotation type + spark). ` +
      'An arm was deleted or added; a missing one is a half-styled note, not a visible failure.');
    const first = JSON.stringify(unions[0]);
    for (const u of unions) {
      assert.equal(JSON.stringify(u), first,
        'the fallback arms disagree; every arm must carry the identical union');
    }
  });

  // The kernel promotes a note only after a STRUCTURAL block, and tier 2 has to anchor
  // on the SAME element set or it promises a layout a treatment it cannot deliver. It
  // shipped missing `pre` and `div`, so `code`/`compare-code`/`diagram` — all three in
  // the name union — could never match on the CSS-only surface.
  test('the fallback anchor matches the kernel\'s STRUCTURAL set', () => {
    const kernel = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', 'lib', 'core', 'coda.js'), 'utf8');
    const m = kernel.match(/const STRUCTURAL = new Set\(\[([^\]]*)\]\)/);
    assert.ok(m, 'could not read STRUCTURAL out of lib/core/coda.js');
    const expected = m[1].match(/'([A-Z]+)'/g).map((x) => x.replace(/'/g, '').toLowerCase()).sort();

    // Scoped to the FALLBACK heads only. A bare `:is(…) + p` scan also catches the
    // eyebrow rule (`:is(h1, h2) + p`), which is a different feature entirely.
    const anchors = [...css.matchAll(
      /section:is\([^)]*\):not\(\.no-note\):not\(:has\(\.below-note\)\)\s*>\s*:is\(([^)]*)\) \+ p/g,
    )].map((a) => a[1].split(',').map((x) => x.trim()).sort());
    assert.equal(anchors.length, TIER2_ARMS,
      `found ${anchors.length} fallback anchors, expected ${TIER2_ARMS}`);
    for (const a of anchors) {
      assert.deepEqual(a, expected,
        `the fallback anchor is [${a}] but the kernel promotes after [${expected}] — ` +
        'a layout in the name union whose note trails a missing element can never match');
    }
  });

  test('the union equals the catalog\'s below-note set, in both directions', () => {
    const expected = expectedSet();
    const actual = fallbackUnions()[0];

    const missing = expected.filter((n) => !actual.includes(n));
    const stale = actual.filter((n) => !expected.includes(n));

    assert.deepEqual(missing, [],
      `these layouts render a below-note but are absent from the CSS-only fallback: ${missing.join(', ')}`);
    assert.deepEqual(stale, [],
      `these names are in the CSS-only fallback but render no below-note (or are not components at all): ${stale.join(', ')}`);
  });

  test('every name in the union is a real component', () => {
    const unknown = fallbackUnions()[0].filter((n) => !CATALOG[n]);
    assert.deepEqual(unknown, [],
      `the fallback names layouts that are not components: ${unknown.join(', ')}. NOTE a VARIANT class (\`timeline\`, \`principles\`) is also refused here and that is deliberate — the register is keyed on the wrapper, so a variant needs no arm of its own.`);
  });

  test('tier 1 names no component', () => {
    // Scoped to the register's OWN selector head (`section .below-note`, descendant
    // combinator), not to every line mentioning a note: the split envelope legitimately
    // carries `section.form.lat-split-native … > .cell-coda …` rules, and those are a
    // different feature keyed on a split marker, not on a layout.
    // INVERTED on purpose. Filtering for lines that CONTAIN `section .below-note` can
    // only inspect rules already written the right way — a reintroduced
    // `section.stats .below-note > p:has(> em:only-child)` does not contain that
    // substring, so the old form of this assertion never looked at it. Select every
    // annotation rule by its SHAPE, then require that none of them names a layout.
    // `lat-split-*` rules legitimately name `section.form` and carry an `em:only-child`
    // guard: they are the split envelope's compact-size feature, keyed on a split
    // MARKER, not on a layout, and they are not the annotation register.
    const annotationRules = css.split('\n').filter((l) =>
      l.includes('.below-note') && (l.includes('is-annotation') || l.includes('em:only-child'))
      && !l.trimStart().startsWith('*') && !l.includes('lat-split'));
    assert.ok(annotationRules.length >= 3,
      `tier 1 is incomplete — expected the hairline, type and spark rules, found ${annotationRules.length}`);
    for (const line of annotationRules) {
      // `section:is(.a, .b)` is tier 2's fallback head and legitimately enumerates;
      // a bare `section.<layout>` is the per-layout enumeration coming back.
      const perLayout = /section\.[a-z][\w-]*/.exec(line.replace(/section:is\([^)]*\)/g, ''));
      assert.equal(perLayout, null,
        `the annotation register must be component-blind, found \`${perLayout?.[0]}\` in: ${line.trim()}`);
    }
    // All three arms of the register must be present. Adding a layout to one or two
    // of them used to produce a half-styled note rather than a visible failure.
    for (const arm of [
      'section .below-note.is-annotation::before',      // dotted rule
      'section .below-note.is-annotation > p {',        // type + ink
      'section .below-note.is-annotation > p::before',  // the ✦ mask
    ]) {
      assert.ok(css.includes(arm), `the annotation register is missing its arm: ${arm}`);
    }
  });
});

/**
 * THE ANNOTATION IS DECIDED BY THE KERNEL, NOT BY A SELECTOR.
 *
 * `p:has(> em:only-child)` reads as "a paragraph whose only content is an em" and is
 * not one: `:only-child` counts ELEMENTS, so a note that merely italicizes a phrase
 * mid-sentence matches it. Measured on a real render before this was moved, that note
 * came out at `--fs-meta` in secondary ink with a spark on it. CSS has no selector for
 * "no text nodes", so the decision lives in lib/core/coda.js and both arms stamp
 * `.is-annotation`.
 */
describe('the annotation predicate', () => {
  const { isAnnotationHtml } = require('../../../lib/core/coda');

  const CASES = [
    ['<p><em>Source: the pilot retrospective.</em></p>', true, 'an em-only note'],
    ['<p>  <em>padded</em>  </p>', true, 'whitespace around the em is not content'],
    ['<p>The figure excludes <em>pro forma</em> adjustments.</p>', false,
      'THE REGRESSION: prose with one italicized phrase is a below-note, not an annotation'],
    ['<p><em>Filed</em> and <em>amended</em></p>', false, 'two ems are prose'],
    ['<p><strong><em>x</em></strong></p>', false, 'the em is not the paragraph\'s own child'],
    ['<p><em>a</em><br>b</p>', false, 'a second element is content'],
    ['<p>Plain prose.</p>', false, 'no em at all'],
  ];

  for (const [html, want, why] of CASES) {
    test(why, () => { assert.equal(isAnnotationHtml(html), want); });
  }
});

/**
 * THE REGISTER IS A TRAILING BEAT, AND THE NARROWING IS DELIBERATE.
 *
 * The per-layout arms this change deleted matched `:is(ul, ol, blockquote, table) +
 * p:has(> em:only-child)` anywhere in the stage, so an italic aside in the MIDDLE of a
 * slide took the ✦ and `--fs-meta`. The kernel harvests only trailing beats, so nothing
 * mid-slide is ever wrapped, and an aside is body copy again. Pinned here because it is
 * a real behavior change with zero corpus hits — exactly the kind that gets rediscovered
 * as a bug two years later.
 */
describe('the annotation is trailing-only', () => {
  const { applyToHtml } = require('../../../lib/transformers/coda');

  test('a mid-slide italic aside is not wrapped, so it cannot be an annotation', () => {
    const html = applyToHtml(
      '<section class="list"><h2>H</h2><ul><li>a</li></ul>'
      + '<p><em>An aside that is not last.</em></p>'
      + '<p>A closing paragraph after it.</p></section>');
    assert.ok(!html.includes('is-annotation'),
      'a non-trailing italic paragraph must not be stamped as an annotation');
  });

  test('the same paragraph IS the annotation when it trails', () => {
    const html = applyToHtml(
      '<section class="list"><h2>H</h2><ul><li>a</li></ul>'
      + '<p><em>An aside that is last.</em></p></section>');
    assert.ok(html.includes('is-annotation'),
      'a trailing italic-only paragraph after a structural block is the annotation');
  });
});

/**
 * THE STAMP MUST NOT BREAK THE MODULES THAT RECOGNIZE THE WRAPPER.
 *
 * `.below-note` has three producers (coda.js, split-envelope.js, carousel.js) and several
 * consumers, and two of those consumers matched it by EXACT STRING —
 * `/^<div class="below-note"/` and `class="below-note">`. Stamping a second class
 * (`.is-annotation`) silently stopped all four from matching an annotation note: measured,
 * an annotation on a splitting slide was no longer recognized as a trailing note at all.
 * They now share `tagHasClass` with the kernel (HARD RULE #1). This pins that, because
 * the failure is invisible — nothing throws, the note just lands somewhere else.
 */
describe('the annotation stamp and the wrapper consumers', () => {
  const { tagHasClass } = require('../../../lib/core/coda');
  const PLAIN = '<div class="below-note"><p>x</p></div>';
  const ANNOTATED = '<div class="below-note is-annotation"><p><em>x</em></p></div>';

  test('tagHasClass matches a stamped wrapper and rejects a lookalike', () => {
    assert.equal(tagHasClass(PLAIN, 'below-note'), true);
    assert.equal(tagHasClass(ANNOTATED, 'below-note'), true, 'the stamp must not hide the wrapper');
    assert.equal(tagHasClass('<div class="below-note-inner"><p>x</p></div>', 'below-note'), false,
      'a hyphenated lookalike must not match — `-` is a regex word boundary');
  });

  /**
   * BEHAVIORAL, not a source grep. The first cut of this test grepped two files for two
   * literal spellings — and an independent checker showed that a mutation restoring the
   * exact-string matcher passed it 16/16, as did the correct fix. A test that green-lights
   * both the defect and its repair pins nothing. These call the real functions instead.
   */
  test('a STAMPED wrapper is still found as a trailing note', () => {
    const { trailingMaterialOf } = require('../../../lib/core/split-envelope');
    const inner = '<h2>T</h2><ul><li>a</li></ul>'
      + '<div class="below-note is-annotation"><p><em>note</em></p></div>';
    const note = trailingMaterialOf(inner).note;
    assert.equal(note.length, 1, 'the `.is-annotation` stamp must not hide the wrapper');
  });

  test('a wrapper NESTED in a slot does not make the whole slot the note', () => {
    // `el.outer` is the element INCLUDING descendants. Testing it made any block that
    // merely CONTAINS a `.below-note` count as the note — a `.panel-right` slot came back
    // as the note in full. The predicate must read the OPEN TAG.
    const { trailingMaterialOf } = require('../../../lib/core/split-envelope');
    const inner = '<h2>T</h2><div class="panel-left"><p>l</p></div>'
      + '<div class="panel-right"><ul><li>a</li></ul>'
      + '<div class="below-note"><p>note</p></div></div>';
    const note = trailingMaterialOf(inner).note;
    assert.equal(note.length, 0,
      `a slot containing a note is not itself the note; got ${JSON.stringify(note.map((n) => n.outer.slice(0, 40)))}`);
  });

  // BEHAVIORAL, on purpose. An earlier version of this arm asserted only on
  // `tagHasClass` with literal tag strings, so it never loaded carousel.js — and an
  // independent checker showed that restoring the exact-string matcher there left 269
  // tests green. `cover-sides` is the observable path: a matcher that misses the wrapper
  // finds no trailing note, and a whole page of the run disappears with it.
  //
  // The page it observes changed on 2026-09-01 and the arm is deliberately kept pointed at
  // the same question. It used to be this strategy's own `compare-split-verdict` frame, which
  // re-authored the note as a `.split-pullq`; the note now rides the run's shared CLOSING page
  // in its own `.below-note` wrapper inside the coda cell. Either way the note is the ONLY
  // reason that last page exists on this fixture, so its presence still answers "was the
  // wrapper recognized".
  test('the carousel finds its trailing note whatever the wrapper carries', () => {
    const fs2 = require('node:fs');
    const path2 = require('node:path');
    const { carouselize } = require('../../../lib/core/carousel');
    const { splitSections } = require('../../../lib/core/split-sections');
    const fixture = fs2.readFileSync(
      path2.join(__dirname, '../core/fixtures/compare-prose.rendered.html'), 'utf8');
    const [sec] = splitSections(fixture).filter((p) => p.type === 'section');
    const PLAIN = '<div class="below-note">';
    assert.ok(sec.inner.includes(PLAIN), 'fixture no longer carries a plain below-note wrapper');
    const closingOf = (openTag) => {
      const parts = carouselize(sec.openTag, sec.inner.replace(PLAIN, openTag), { strategy: 'cover-sides' });
      const last = parts?.[parts.length - 1];
      return last && /\sdata-split-role="closing"/.test(last) ? last : null;
    };
    // The stamp the coda kernel adds, and the two attribute orders the old `">`-anchored
    // regex could not both accept.
    for (const tag of [PLAIN, '<div class="below-note is-annotation">',
      '<div id="x" class="below-note">', '<div class="below-note" data-k="1">']) {
      const v = closingOf(tag);
      assert.ok(v, `no closing page for ${tag} — the note was not found`);
      assert.match(v, /two retrospective cycles/, `the closing page lost its text for ${tag}`);
    }
    // Not vacuous: strip the wrapper's class and the closing page must disappear.
    assert.equal(closingOf('<div class="below-note-inner">'), null,
      'a look-alike class still produced a closing page — the assertion above proves nothing');
    assert.equal(closingOf('<section data-class="below-note">'), null,
      'data-class carries the RAW _class: payload, not the resolved list (#1358)');
  });
});
