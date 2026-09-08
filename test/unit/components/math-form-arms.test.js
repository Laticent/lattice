/**
 * MATH'S FORM ARMS — what survives the migration lever.
 *
 * `lib/core/math-stage-migration.js` and its test carried three gates while math moved
 * off its sovereign frame one variant at a time. Two of them were about the migration
 * itself and went with it: "does this variant wrap?" is now `conformance: "strict"`
 * plus the frame-conformance gate, and "does a migrated variant have Form-arm CSS?"
 * cannot fail any more, because the sovereign arms are deleted and there is no second
 * shape to fall back to.
 *
 * The two below are NOT about the migration. They are about properties of the component
 * that no other gate can see, and both exist because the migration broke them once.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '../../..');
const STYLES = path.join(ROOT, 'lib/components/math/math/math.styles.css');
const MANIFEST = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'lib/components/math/math/math.manifest.json'), 'utf8',
));
const { render } = require('../../../lib/engine');

/**
 * Variants that legitimately need NO `[data-family]` reflow, with the reason MEASURED
 * rather than argued.
 *
 * THREE ENTRIES CAME OFF THIS LIST DURING THE MIGRATION — `derivation`, `theorem` and
 * `stats` — and that is more useful than the one left on it. All three said "already
 * single-column", which answers the wrong question: a family reflow is not only for
 * collapsing columns, it is for anything that has to give when the box changes shape.
 * Two of them were paying for the Form masthead, an in-flow band where the sovereign
 * arm's title was absolutely positioned and cost nothing (271px at portrait on a
 * wrapped title). The third was over for a reason its sovereign arm had always carried:
 * a `max-width` measure cap that helps on a 1920-wide slide and hurts in a 972-wide one.
 *
 * `theorem` is back, on a different and measured reason. MEASURE a variant at every
 * registered size before writing an entry here — an entry is a claim about a render,
 * not about a column count.
 */
const NO_FAMILY_REFLOW = Object.freeze({
  theorem: 'the card rhythm was re-tuned for the stage at EVERY size (--sp-xs vertical, was --sp-sm), '
    + 'which is 71px on the committed portrait sample against a 26px shortfall — a tall box needs nothing further',
});

test('every math variant keeps a FAMILY reflow, or declares why it needs none', () => {
  // THE REGRESSION THIS MIGRATION SHIPPED ONCE. `[data-family]` rules were scoped to
  // direct children of the section, so the wrap made every one of them inert and a
  // portrait math slide ran 64px off the slide edge. Measured, not theorised.
  //
  // The check is POSITIVE, not comparative, and that matters: the sovereign arms are
  // gone, so "this variant had a family reflow" is no longer observable from the
  // stylesheet, and absence reads identically to a reflow someone forgot to carry.
  const css = fs.readFileSync(STYLES, 'utf8');
  // NEGATIONS ARE STRIPPED FIRST, and the migration's version of this gate SHIPPED
  // WITHOUT IT. The bare/feature Form selector is a `:where(:not(.derivation):not(...))`
  // chain naming every other variant, so `sel.includes('.compare')` matched the
  // EXCLUSION of compare and four feature rules satisfied the compare check before any
  // compare CSS was consulted. Verified by mutation at the time: with both of compare's
  // family rules renamed so they could not match, the file was still fully green.
  const positive = css.replace(/:not\([^()]*\)/g, '');
  // Split on rule blocks rather than one regex: a math selector legitimately contains
  // commas inside `:where(…)`, so a `[^,{]*` pattern fails on its own passing CSS.
  const selectors = positive.split('}')
    .map((block) => (block.includes('{') ? block.slice(0, block.indexOf('{')) : ''))
    .map((sel) => sel.slice(sel.lastIndexOf('*/') + 2))
    .filter((sel) => sel.includes('section.math'));
  const formFamily = selectors.filter((sel) => sel.includes('data-family') && sel.includes('.cell-stage'));

  // WHICH VARIANT DOES A SELECTOR ACTUALLY DECLARE? Not "every variant token it
  // mentions" — `decompose` is authored as the COMPOUND `math matrix decompose`, so its
  // rules name `.matrix` too, and a naive `sel.includes('.matrix')` let decompose's
  // family rule satisfy MATRIX's requirement. Proved by mutation: with all four of
  // matrix's family rules renamed so they could not match, this gate was still green.
  // That is the same vacuity — a variant name matched inside a selector that is about a
  // different variant — that the migration's version of this gate shipped with, in the
  // other direction (`:not(.compare)` read as a declaration of compare). Two different
  // ways to match the right string in the wrong place, in one gate, on one component.
  //
  // A selector declares its MOST SPECIFIC variant: the compound wins over the token it
  // is built from, and a Form selector naming none of them is the bare/feature arm.
  const declaredVariant = (sel) => {
    const present = MANIFEST.variants.filter((v) => sel.includes(`.${v}`));
    if (present.includes('decompose')) return 'decompose';
    return present[0] || (/section\.math(\.math)?\.form(?![\w-])/.test(sel) ? 'feature' : null);
  };

  for (const variant of MANIFEST.variants) {
    if (NO_FAMILY_REFLOW[variant]) continue;
    const declares = formFamily.some((sel) => declaredVariant(sel) === variant);
    assert.ok(
      declares,
      `${variant} has no \`section.math…form…[data-family]…> .cell-stage\` rule and is not in `
      + 'NO_FAMILY_REFLOW. The body lives in .cell-stage, so a section-scoped reflow would be '
      + 'inert — that is the 64px portrait overflow this component shipped once already.',
    );
  }
});

test('NO_FAMILY_REFLOW names only real variants, with a real reason', () => {
  for (const [variant, reason] of Object.entries(NO_FAMILY_REFLOW)) {
    assert.ok(MANIFEST.variants.includes(variant), `${variant} is not a math variant`);
    assert.ok(reason && reason.length > 40, `${variant} needs a measured reason, got ${JSON.stringify(reason)}`);
  }
});

test('a compare slide keeps its eyebrow and heading OUT of the column flow', () => {
  // THIS REPLACED A GUARD THE MIGRATION RETIRED, and the replacement is the point.
  //
  // #1554: on a `math compare` slide real WebKit paints the first h3 twice — a ghost
  // above the `column-span: all` headline. `2026-08-10-compare-column-atoms.md` measured
  // which box actually fragments, and it is NOT the h3: it is the EYEBROW paragraph, the
  // in-flow content PRECEDING the spanner. `break-inside: avoid` on the h3 alone left
  // 12/32 shapes clean; the eyebrow arm alone made it 32/32.
  //
  // On the Form frame the eyebrow and the h2 lift into `.cell-masthead` — out of the
  // multicol — and there is no spanner at all, so the ghost has nothing to fragment.
  // That is a structural fix, which is exactly why the old guard needed replacing rather
  // than trusting: `docs/e2e/math-compare-webkit.spec.ts` says "a fixture without one
  // cannot fail", so post-migration it passes without guarding anything. A spec that
  // cannot fail is worse than no spec, because it reads as coverage.
  //
  // NOT a claim about WebKit. This asserts the STRUCTURE the fix rests on and runs on
  // every PR; the raster spec remains the only oracle for the browser behavior itself.
  const fm = '---\ntheme: indaco\nheader: A\nfooter: B\npaginate: true\nmeta: M\n---\n\n'
    + '<!-- _class: divider -->\n\n# S\n\n---\n\n';
  const md = MANIFEST.variantDocs.compare.sample.replace(
    '<!-- _class: math compare -->',
    '<!-- _class: math compare -->\n\n`Estimators · asymptotics`',
  );
  const out = render(fm + md);
  const html = typeof out === 'string' ? out : out.html;
  // Slice BACKWARDS to the section's own opening tag: the first occurrence of
  // `math compare` is inside that tag's own `data-class`, so searching FORWARD for
  // `<section` from there finds the next section (or nothing) rather than this one.
  const at = html.indexOf('math compare');
  const section = html.slice(html.lastIndexOf('<section', at), html.indexOf('</section>', at));
  const stageAt = section.indexOf('cell-stage');
  const mastheadAt = section.indexOf('masthead-lede');
  assert.ok(mastheadAt !== -1, 'a compare slide must build a masthead');
  assert.ok(stageAt !== -1, 'a compare slide must build a stage');

  const lede = section.slice(mastheadAt, stageAt);
  const stage = section.slice(stageAt);
  assert.ok(/<h2\b/.test(lede), 'the h2 must sit in .masthead-lede, not the column flow');
  assert.ok(/<code>/.test(lede), 'the eyebrow must sit in .masthead-lede — it is the box #1554 fragments');
  assert.ok(!/<h2\b/.test(stage), 'the h2 must not be inside .cell-stage — that would restore the spanner');
  assert.ok(/<h3\b/.test(stage), 'the column labels DO belong in the stage');
});
