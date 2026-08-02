const test = require('node:test');
const assert = require('node:assert/strict');

// ESM module under test — dynamic import from this CJS test (mirrors glossary-auto.test.js).
let core;
test.before(async () => {
  core = await import('../../../lib/diagnostics/slice-equivalence-core.mjs');
});

// The pure core behind BOTH halves of the preview-fidelity diagnostic: the headless sweep
// (`npm run equiv`) and the Studio's "Preview fidelity" overlay. Two surfaces, one definition of
// "the same" — these pin that definition, and every case below fails if the behavior moves.
//
// The neutralizer cases carry the most weight. The two surfaces deliberately hide DIFFERENT things
// (the sweep hides the shipped repairs to score the prototype in isolation; the overlay leaves them
// in because a wrong page number is exactly what an author turns it on to find), so a change that
// quietly made one set behave like the other would blind the overlay to its main finding without
// breaking anything visible.

test('splitSlides treats a `---` inside a fence as a rule, not a boundary', () => {
  const body = ['# One', '', '```', '---', '```', '', '---', '', '# Two'].join('\n');
  const slides = core.splitSlides(body);
  assert.equal(slides.length, 2);
  assert.match(slides[0], /# One/);
  assert.match(slides[1], /# Two/);
});

test('splitSlides pairs a `~~~` fence too', () => {
  const body = ['# One', '', '~~~', '---', '~~~'].join('\n');
  assert.equal(core.splitSlides(body).length, 1);
});

test('frontMatterOf returns the block verbatim, or empty', () => {
  assert.equal(core.frontMatterOf('---\ntheme: lattice\n---\n# Hi'), '---\ntheme: lattice\n---\n');
  assert.equal(core.frontMatterOf('# Hi'), '');
});

// ── synthesizePrelude ────────────────────────────────────────────────────────
const VOCAB = { known: new Set(['header', 'footer']), flags: new Set(['build']) };

test('synthesizePrelude carries a running global forward', () => {
  const slides = ['<!-- header: Q3 -->\n# One', '# Two'];
  assert.equal(core.synthesizePrelude(slides, 1, VOCAB), '<!-- header: Q3 -->');
});

test('synthesizePrelude ignores a spot directive — it applies to its own slide only', () => {
  const slides = ['<!-- _header: Q3 -->\n# One', '# Two'];
  assert.equal(core.synthesizePrelude(slides, 1, VOCAB), '');
});

test('synthesizePrelude ignores a key the engine does not know', () => {
  // The bug this pins: treating any `name: value` comment as a running global injected
  // slide-local `describe:` notes into every later slide — 32 mismatches the probe caused.
  const slides = ['<!-- describe: a note -->\n# One', '# Two'];
  assert.equal(core.synthesizePrelude(slides, 1, VOCAB), '');
});

test('synthesizePrelude carries a BARE flag directive', () => {
  // `<!-- build -->` is legal and means `build:` with an empty value. Missing it
  // under-synthesizes the prelude and reports a mismatch the synthesizer caused.
  const slides = ['<!-- build -->\n# One', '# Two'];
  assert.equal(core.synthesizePrelude(slides, 1, VOCAB), '<!-- build -->');
});

test('synthesizePrelude keeps the LAST value of a re-set global', () => {
  const slides = ['<!-- header: A -->', '<!-- header: B -->', '# Three'];
  assert.equal(core.synthesizePrelude(slides, 2, VOCAB), '<!-- header: B -->');
});

test('synthesizePrelude THROWS without a vocabulary — the one failure that must be loud', () => {
  // Defaulting to empty sets would synthesize an empty prelude for every slide, which reads as a
  // plausible equivalence rate and moves the sweep's baseline band by 0.0 points. Nothing anywhere
  // would catch a caller that dropped the argument, so the only detectable failure is a throw.
  assert.throws(() => core.synthesizePrelude(['<!-- header: Q3 -->', '# Two'], 1), TypeError);
  assert.throws(() => core.synthesizePrelude(['<!-- header: Q3 -->', '# Two'], 1, { known: new Set() }), TypeError);
});

test('synthesizePrelude at slide 0 is empty — nothing precedes it', () => {
  assert.equal(core.synthesizePrelude(['<!-- header: Q3 -->'], 0, VOCAB), '');
});

// ── normalizeSection ─────────────────────────────────────────────────────────
const PAGED_A = '<section id="3" data-lattice-pagination="3"><span class="lat-pagination">3</span></section>';
const PAGED_B = '<section id="7" data-lattice-pagination="9"><span class="lat-pagination">9</span></section>';

test('normalizeSection hides nothing by default', () => {
  assert.notEqual(core.normalizeSection(PAGED_A), core.normalizeSection(PAGED_B));
  assert.match(core.normalizeSection(PAGED_A), /id="3"/);
});

test('the sweep neutralizers collapse a page-number difference — that is their job', () => {
  assert.equal(core.normalizeSection(PAGED_A, core.PROTOTYPE_NEUTRALIZERS), core.normalizeSection(PAGED_B, core.PROTOTYPE_NEUTRALIZERS));
});

test('the overlay neutralizers KEEP a page-number difference — that is the finding', () => {
  // The load-bearing asymmetry. If this ever equals, the author-facing overlay has gone blind to
  // a wrong page number, which is the single most likely thing it exists to catch.
  assert.notEqual(core.normalizeSection(PAGED_A, core.SHIPPED_NEUTRALIZERS), core.normalizeSection(PAGED_B, core.SHIPPED_NEUTRALIZERS));
});

test('the overlay neutralizers still drop the positional id — the one unshipped residual', () => {
  const a = '<section id="3"><p>x</p></section>';
  const b = '<section id="9"><p>x</p></section>';
  assert.equal(core.normalizeSection(a, core.SHIPPED_NEUTRALIZERS), core.normalizeSection(b, core.SHIPPED_NEUTRALIZERS));
});

test('the sweep neutralizers drop the progress rail; the overlay keeps it', () => {
  const withRail = '<section><div class="tile-progress"><i></i></div><p>x</p></section>';
  const without = '<section><p>x</p></section>';
  assert.equal(core.normalizeSection(withRail, core.PROTOTYPE_NEUTRALIZERS), core.normalizeSection(without, core.PROTOTYPE_NEUTRALIZERS));
  assert.notEqual(core.normalizeSection(withRail, core.SHIPPED_NEUTRALIZERS), core.normalizeSection(without, core.SHIPPED_NEUTRALIZERS));
});

test('whitespace between blocks is neutralized on both surfaces', () => {
  const a = '<section>\n\t<p>x</p>\n</section>';
  const b = '<section><p>x</p></section>';
  for (const set of [core.PROTOTYPE_NEUTRALIZERS, core.SHIPPED_NEUTRALIZERS]) {
    assert.equal(core.normalizeSection(a, set), core.normalizeSection(b, set));
  }
});

// ── sectionsOf / classifyDivergence / firstDivergence ────────────────────────
test('sectionsOf returns each section in order, and [] for none', () => {
  assert.deepEqual(core.sectionsOf('<section>a</section><section>b</section>'), ['<section>a</section>', '<section>b</section>']);
  assert.deepEqual(core.sectionsOf('<p>no sections</p>'), []);
});

test('classifyDivergence names a generated-id / cat-N difference', () => {
  const got = '<section class="cat-1"><svg aria-labelledby="lat-svgt-1"></svg></section>';
  const want = '<section class="cat-3"><svg aria-labelledby="lat-svgt-2"></svg></section>';
  assert.equal(core.classifyDivergence(got, want), 'generated ids / cat-N (seedRenderIds row)');
});

test('classifyDivergence names a watermark-glyph difference', () => {
  assert.equal(core.classifyDivergence('<section><div class="tile-watermark">1</div></section>', '<section></section>'), 'watermark glyph');
});

test('classifyDivergence admits when it does not know', () => {
  assert.equal(core.classifyDivergence('<section><p>a</p></section>', '<section><p>b</p></section>'), 'unclassified');
});

test('firstDivergence is undefined for identical input', () => {
  assert.equal(core.firstDivergence('same', 'same'), undefined);
});

test('firstDivergence points at the first differing character with context on both sides', () => {
  const d = core.firstDivergence('<section data-x="a">', '<section data-x="b">');
  assert.equal(d.at, 17);
  assert.match(d.got, /"a"/);
  assert.match(d.want, /"b"/);
});

test('firstDivergence reports a pure truncation', () => {
  const d = core.firstDivergence('<section>', '<section><p>more</p>');
  assert.equal(d.at, 9);
  assert.equal(d.got, '<section>'.slice(-12));
  assert.match(d.want, /<p>more<\/p>/);
});
