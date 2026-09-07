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

const { MATH_VARIANTS, MIGRATED, mathVariantOf, mathSectionMigrated } = require('../../../lib/core/math-stage-migration.js');
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
