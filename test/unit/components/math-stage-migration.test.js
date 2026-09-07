/**
 * The per-variant lever for math's move off its sovereign frame
 * (lib/core/math-stage-migration.js).
 *
 * DELETE THIS FILE with the lever, in the commit that migrates the last variant.
 *
 * What it pins is the property the whole migration rests on: flipping ONE variant
 * moves that variant and nothing else. Without it, a stray edit to the predicate
 * would migrate seven layouts silently — and the failure would be a visual one,
 * which no other gate in this repo can see.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { MATH_VARIANTS, MIGRATED, NO_FAMILY_REFLOW, mathVariantOf, mathSectionMigrated } = require('../../../lib/core/math-stage-migration.js');
const { render } = require('../../../lib/engine');

const MANIFEST = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../../../lib/components/math/math/math.manifest.json'), 'utf8',
));

const FM = '---\ntheme: indaco\nheader: A\nfooter: B\npaginate: true\nmeta: M\n---\n\n'
  + '<!-- _class: divider -->\n\n# S\n\n---\n\n';
const renderHtml = (md) => {
  const out = render(FM + md);
  return typeof out === 'string' ? out : out.html;
};

test('the variant list matches the component manifest', () => {
  assert.deepEqual(
    [...MATH_VARIANTS].sort(),
    [...MANIFEST.variants].sort(),
    'a variant added to the manifest must be added to the lever, or it can never migrate',
  );
});

test('decompose resolves before matrix, because it is authored as a compound', () => {
  // `math matrix decompose` carries BOTH tokens. A first-match scan over the
  // variant list would call it `matrix` and migrate it one commit early.
  assert.equal(mathVariantOf('math matrix decompose'), 'decompose');
  assert.equal(mathVariantOf('math matrix'), 'matrix');
});

test('a bare math slide resolves to feature', () => {
  // math.docs.md: "the bare layout defaults to it".
  assert.equal(mathVariantOf('math'), 'feature');
  assert.equal(mathVariantOf('math feature'), 'feature');
});

test('a non-math section is never migrated', () => {
  for (const cls of ['content', 'diagram', 'chart bar', 'title', '', 'feature']) {
    assert.equal(mathVariantOf(cls), null, `${cls} is not a math section`);
    assert.equal(mathSectionMigrated(cls), false);
  }
});

test('ONLY the migrated variants wrap; every other variant keeps its own grid', () => {
  // Asserts SHAPE (does this variant build a `.cell-stage`?), which is the property
  // the lever controls. Byte-identity of the seven unmigrated variants was verified
  // separately, by rendering the manifest's committed samples on both sides of the
  // flip and comparing hashes; it is not re-asserted here because a hash fixture
  // would have to be re-blessed on every one of the eight migration commits, and a
  // fixture nobody re-derives is the failure this migration keeps finding.
  // The committed samples are the authored shape of each variant.
  const samples = { '(bare)': MANIFEST.sample };
  for (const [name, v] of Object.entries(MANIFEST.variantDocs)) samples[name] = v.sample;

  for (const [name, md] of Object.entries(samples)) {
    const variant = name === '(bare)' ? 'feature' : name;
    const html = renderHtml(md);
    const wrapped = /class="[^"]*\bform\b/.test(html) && html.includes('cell-stage');
    assert.equal(
      wrapped,
      MIGRATED.has(variant),
      `${name}: wrapped=${wrapped} but MIGRATED.has(${variant})=${MIGRATED.has(variant)} — `
      + 'the lever must move exactly the variants it names',
    );
  }
});

test('a migrated math slide gains the chrome cells a sovereign frame suppressed', () => {
  if (!MIGRATED.has('feature')) return; // nothing to assert until feature moves
  const html = renderHtml(MANIFEST.sample);
  for (const cell of ['cell-masthead', 'masthead-lede', 'cell-stage', 'tile-meta']) {
    assert.ok(html.includes(cell), `a migrated math slide should build .${cell}`);
  }
  // The equation and its legend must be INSIDE the stage, not loose siblings —
  // a section that takes `form` without wrapping would build chrome around a
  // body that never moved into it.
  const stage = html.slice(html.indexOf('cell-stage'));
  assert.ok(stage.includes('katex'), 'the equation must sit inside .cell-stage');
});

test('an UNmigrated math variant keeps its own grid and gets no chrome cells', () => {
  const unmigrated = MANIFEST.variants.find((v) => !MIGRATED.has(v) && MANIFEST.variantDocs[v]);
  if (!unmigrated) return; // every variant has migrated; the lever is ready to delete
  const html = renderHtml(MANIFEST.variantDocs[unmigrated].sample);
  assert.ok(!html.includes('cell-stage'), `${unmigrated} must not wrap until it migrates`);
  assert.ok(!html.includes('cell-masthead'), `${unmigrated} must keep suppressing the masthead`);
});

test('a migrated variant MUST have Form-arm CSS — the lever cannot certify a bare flip', () => {
  // THE HOLE THIS CLOSES, found by a red team and reproduced: adding a variant to
  // MIGRATED with no matching stylesheet arm passed every other test in this file
  // and rendered `compare` as a SINGLE COLUMN — the entire point of the variant
  // gone. Every other assertion here derives its expectation from MIGRATED itself
  // and asks only "did it wrap?", so none of them can see a variant that wraps into
  // a stage with no layout waiting for it.
  //
  // This is the one assertion that reaches OUTSIDE the lever, to the stylesheet, and
  // it is what makes the other seven migration commits safe to review.
  const css = fs.readFileSync(
    path.join(__dirname, '../../../lib/components/math/math/math.styles.css'), 'utf8',
  );
  // NEGATIONS ARE STRIPPED FIRST, and the gate was vacuous without it. The bare/feature
  // Form selector is
  //   `section.math.form:where(:not(.derivation):not(.theorem):not(.compare)…) > .cell-stage`
  // so a naive scan for `.compare` finds it INSIDE `:not(.compare)` — the negation that
  // explicitly excludes compare — and reads the exclusion as a declaration. Flipping
  // `compare` into MIGRATED with no CSS at all then passed this gate, which a mutation
  // test caught. Everything inside a `:not(…)` is removed before matching.
  const positive = css.replace(/:not\([^()]*\)/g, '');
  for (const variant of MIGRATED) {
    // The bare/feature pair share one selector chain; every other variant names itself.
    const needle = variant === 'feature'
      ? /section\.math\.form[^,{]*>\s*\.cell-stage/
      : new RegExp(`section\\.math\\.form[^,{]*\\.${variant}\\b[^,{]*>\\s*\\.cell-stage`);
    assert.ok(
      needle.test(positive),
      `${variant} is in MIGRATED but math.styles.css has no `
      + `\`section.math.form…${variant === 'feature' ? '' : `.${variant}`} > .cell-stage\` rule — `
      + 'it would wrap into a stage with no layout',
    );
  }
});

test('a migrated variant keeps its FAMILY reflow, or declares why it needs none', () => {
  // THE REGRESSION THIS MIGRATION ALREADY SHIPPED ONCE. `[data-family]` rules were
  // scoped to direct children of the section, so the wrap made every one of them
  // inert and a portrait math slide ran 64px off the slide edge. Measured, not
  // theorised.
  //
  // The check is POSITIVE, not comparative, and that matters: the migration deletes
  // each variant's sovereign arm as it lands, so "this variant had a family reflow"
  // stops being observable from the stylesheet. Absence would read identically to a
  // reflow someone forgot to carry across. So a migrated variant must either declare
  // a Form-arm family rule or name itself in NO_FAMILY_REFLOW with a reason.
  const css = fs.readFileSync(
    path.join(__dirname, '../../../lib/components/math/math/math.styles.css'), 'utf8',
  );
  // Split on rule blocks rather than one regex: a math selector legitimately contains
  // commas inside `:where(…)`, and a `[^,{]*` pattern fails on its own passing CSS.
  //
  // NEGATIONS ARE STRIPPED, for the same reason the gate above strips them — and
  // this gate SHIPPED WITHOUT IT. `sel.includes('.compare')` matches `:not(.compare)`
  // inside the bare/feature selector chain, so four feature rules satisfied the
  // compare check before any compare CSS was consulted. Verified by mutation: with
  // both of compare's family rules renamed so they cannot match, this file was still
  // 12/12 green. That is precisely the "certifies exactly the flip it was written to
  // catch" defect the sibling gate's comment describes, left in the tree by a commit
  // whose message claimed both gates were mutation-proved. Only one was.
  //
  // It matters beyond compare: the `:not()` chain names derivation, theorem, canvas,
  // matrix and stats too, so the next variant this would have silently certified is
  // `matrix` — the widest content, the one most likely to need a reflow.
  const positive = css.replace(/:not\([^()]*\)/g, '');
  const selectors = positive.split('}')
    .map((block) => (block.includes('{') ? block.slice(0, block.indexOf('{')) : ''))
    .map((sel) => sel.slice(sel.lastIndexOf('*/') + 2))
    .filter((sel) => sel.includes('section.math'));
  const formFamily = selectors.filter((sel) => sel.includes('data-family') && sel.includes('.cell-stage'));

  for (const variant of MIGRATED) {
    if (NO_FAMILY_REFLOW[variant]) continue;
    const declares = formFamily.some((sel) => (variant === 'feature'
      ? /section\.math\.form(?![\w-])/.test(sel)
      : sel.includes(`.${variant}`)));
    assert.ok(
      declares,
      `${variant} is migrated, is not in NO_FAMILY_REFLOW, and has no `
      + '`section.math.form … [data-family] … > .cell-stage` rule. The wrap moves the body '
      + 'into .cell-stage, so a sovereign-arm reflow would be inert — that is the 64px '
      + 'portrait overflow this migration shipped once already.',
    );
  }
});

test('NO_FAMILY_REFLOW names only real variants, with a reason', () => {
  for (const [variant, reason] of Object.entries(NO_FAMILY_REFLOW)) {
    assert.ok(MATH_VARIANTS.includes(variant), `${variant} is not a math variant`);
    assert.ok(reason && reason.length > 20, `${variant} needs a real reason, got ${JSON.stringify(reason)}`);
  }
});

test('a migrated compare keeps its eyebrow and heading OUT of the column flow', () => {
  // THIS REPLACES A GUARD THE MIGRATION RETIRED, and the replacement is the point.
  //
  // #1554: on a `math compare` slide real WebKit paints the first h3 twice — a ghost
  // above the `column-span: all` headline. `2026-08-10-compare-column-atoms.md`
  // measured which box actually fragments, and it is NOT the h3: it is the EYEBROW
  // paragraph, the in-flow content PRECEDING the spanner. `break-inside: avoid` on
  // the h3 alone left 12/32 shapes clean; the eyebrow arm alone made it 32/32.
  //
  // Migrated, the eyebrow and the h2 lift into `.cell-masthead` — out of the multicol
  // — and there is no spanner at all, so the ghost has nothing to fragment. That is a
  // structural fix, which is exactly why the old guard needs replacing rather than
  // trusting: `docs/e2e/math-compare-webkit.spec.ts` says "a fixture without one
  // cannot fail", so post-migration it passes without guarding anything.
  //
  // A spec that cannot fail is worse than no spec, because it reads as coverage. This
  // asserts the STRUCTURE the fix now rests on, runs on every PR rather than nightly,
  // and fails loudly if anyone puts either box back into the column flow.
  //
  // NOT a claim about WebKit. No WebKit is installed in this environment, so whether
  // the ghost is actually gone on the real surface is UNVERIFIED (HARD RULE #23); the
  // raster spec remains the only oracle for that and still runs in the nightly.
  if (!MIGRATED.has('compare')) return;
  const html = renderHtml(MANIFEST.variantDocs.compare.sample.replace(
    '<!-- _class: math compare -->',
    '<!-- _class: math compare -->\n\n`Estimators \u00b7 asymptotics`',
  ));
  // Slice BACKWARDS to the section's own opening tag: the first occurrence of
  // `math compare` is inside that tag's own `data-class`, so searching FORWARD for
  // `<section` from there finds the next section (or nothing) rather than this one.
  const at = html.indexOf('math compare');
  const section = html.slice(html.lastIndexOf('<section', at), html.indexOf('</section>', at));
  const stageAt = section.indexOf('cell-stage');
  const mastheadAt = section.indexOf('masthead-lede');
  assert.ok(mastheadAt !== -1, 'a migrated compare must build a masthead');
  assert.ok(stageAt !== -1, 'a migrated compare must build a stage');

  const lede = section.slice(mastheadAt, stageAt);
  const stage = section.slice(stageAt);
  // The heading and the eyebrow belong to the masthead, ahead of the column flow.
  assert.ok(/<h2\b/.test(lede), 'the h2 must sit in .masthead-lede, not the column flow');
  assert.ok(/<code>/.test(lede), 'the eyebrow must sit in .masthead-lede — it is the box #1554 fragments');
  // And they must NOT also appear inside the stage, which is the multicol now.
  assert.ok(!/<h2\b/.test(stage), 'the h2 must not be inside .cell-stage — that would restore the spanner');
  assert.ok(/<h3\b/.test(stage), 'the column labels DO belong in the stage');
});

test('the two call sites agree — form class and wrap are decided by one predicate', () => {
  // A section that takes `form` but does not wrap builds chrome cells around a
  // body still sitting loose in the section. Assert they move together.
  const samples = { feature: MANIFEST.sample };
  for (const [name, v] of Object.entries(MANIFEST.variantDocs)) samples[name] = v.sample;
  for (const [name, md] of Object.entries(samples)) {
    const html = renderHtml(md);
    const hasForm = /class="[^"]*\bform\b/.test(html);
    const hasStage = html.includes('cell-stage');
    assert.equal(hasForm, hasStage, `${name}: form=${hasForm} but stage=${hasStage} — the two call sites disagree`);
  }
});
