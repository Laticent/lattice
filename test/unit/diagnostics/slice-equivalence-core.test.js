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

// ── diffSections — naming what differs, instead of quoting raw markup ─────────
// The readout these feed is the whole point: an author cannot act on a window of HTML that lands
// mid-attribute. Each case pins that a real, recognizable difference comes back NAMED.

test('diffSections names a missing section attribute', () => {
  const got = '<section class="lattice"><p>x</p></section>';
  const want = '<section class="lattice" data-header="Q3 Board Review"><p>x</p></section>';
  const d = core.diffSections(got, want);
  assert.deepEqual(d, [{ kind: 'attribute', name: 'data-header', got: undefined, want: 'Q3 Board Review' }]);
});

test('diffSections names a changed attribute with both values', () => {
  const d = core.diffSections('<section data-lattice-pagination="1"></section>', '<section data-lattice-pagination="4"></section>');
  assert.deepEqual(d, [{ kind: 'attribute', name: 'data-lattice-pagination', got: '1', want: '4' }]);
});

test('diffSections compares class TOKENS, not the whole string', () => {
  // The cat-N case: one token differs, and reporting the whole class string would make it read as
  // a wholesale rewrite. Only the tokens each side uniquely carries come back.
  const d = core.diffSections('<section class="split-panel proof cat-1"></section>', '<section class="split-panel proof cat-3"></section>');
  assert.deepEqual(d, [{ kind: 'class', name: 'class', got: 'cat-1', want: 'cat-3' }]);
});

test('diffSections reports several attributes at once, name-sorted', () => {
  const got = '<section data-b="1"></section>';
  const want = '<section data-a="2" data-b="9"></section>';
  assert.deepEqual(
    core.diffSections(got, want).map((d) => d.name),
    ['data-a', 'data-b'],
  );
});

test('diffSections names a wording difference, tags stripped', () => {
  const d = core.diffSections('<section><p>Second slide</p></section>', '<section><p>Second   slide</p></section>');
  // Whitespace inside the words is collapsed — a re-wrap is not a copy change.
  assert.equal(d.length, 0);
  const d2 = core.diffSections('<section><h1>Opening</h1></section>', '<section><h1>Closing</h1></section>');
  assert.deepEqual(d2, [{ kind: 'text', name: 'text', got: 'Opening', want: 'Closing' }]);
});

test('diffSections falls back to a raw window only when nothing named explains it', () => {
  // Same words, same section tag — the difference is on a nested element.
  const got = '<section><p class="a">x</p></section>';
  const want = '<section><p class="b">x</p></section>';
  const d = core.diffSections(got, want);
  assert.equal(d.length, 1);
  assert.equal(d[0].kind, 'markup');
  assert.match(d[0].want, /class="b"/);
});

test('diffSections returns nothing for identical sections', () => {
  const s = '<section class="lattice" data-x="1"><p>same</p></section>';
  assert.deepEqual(core.diffSections(s, s), []);
});

test('sectionText strips tags and collapses whitespace', () => {
  assert.equal(core.sectionText('<section>\n  <h1>Hi</h1>\n  <p>there</p>\n</section>'), 'Hi there');
});

test('contrastValues shortens around the parting point, not the start', () => {
  // The `style` case: 40 shared characters before the difference. Head-truncation would show the
  // same string on both sides and tell the reader nothing.
  const a = '--paginate:true;--theme:indaco;--x:1';
  const b = '--paginate:true;--theme:indaco;--x:2';
  const c = core.contrastValues(a, b);
  assert.notEqual(c.got, c.want);
  assert.match(c.got, /1$/);
  assert.match(c.want, /2$/);
  assert.match(c.got, /^…/); // elision marked, so a shortened value is never read as the whole one
});

test('contrastValues does not elide when the difference is at the start', () => {
  const c = core.contrastValues('Opening', 'Closing');
  assert.equal(c.got, 'Opening');
  assert.equal(c.want, 'Closing');
});

// ── Parsing that must not produce a CONFIDENTLY WRONG row ─────────────────────
// The failure direction these pin is the expensive one: a naive tag regex does not merely miss a
// difference, it mislabels one — leaking attribute markup into a row titled "text", under a tap
// explanation that reads "the words on the slide differ".

test('diffSections survives a `>` inside an attribute value', () => {
  const d = core.diffSections('<section data-x="a>b" data-y="1"></section>', '<section data-x="a>c" data-y="2"></section>');
  assert.deepEqual(
    d.map((x) => [x.kind, x.name]),
    [
      ['attribute', 'data-x'],
      ['attribute', 'data-y'],
    ],
  );
});

test('diffSections reads single-quoted and unquoted attribute values', () => {
  // Single-quoted `class='a b'` once parsed as three EMPTY attributes (class, a, b), inventing
  // rows named after the class tokens themselves.
  assert.deepEqual(core.diffSections("<section class='a b'></section>", "<section class='a c'></section>"), [
    { kind: 'class', name: 'class', got: 'b', want: 'c' },
  ]);
  assert.deepEqual(core.diffSections('<section data-x=1></section>', '<section data-x=2></section>'), [
    { kind: 'attribute', name: 'data-x', got: '1', want: '2' },
  ]);
});

test('diffSections reports a boolean attribute as present/absent', () => {
  assert.deepEqual(core.diffSections('<section hidden></section>', '<section></section>'), [{ kind: 'attribute', name: 'hidden', got: '', want: undefined }]);
});

test('sectionText survives a `>` inside an attribute value', () => {
  assert.equal(core.sectionText('<section data-x="a>b">Hi</section>'), 'Hi');
});

test('a wording difference suppresses the raw-markup fallback', () => {
  // Deliberate precedence, not an accident: the words are the bigger signal, and 755 of the
  // corpus's 1076 real divergences carry a text row — appending a markup window under each
  // would be noise. Pinned so the choice cannot be silently reversed.
  const d = core.diffSections('<section><p class="a">x</p></section>', '<section><p class="b">y</p></section>');
  assert.deepEqual(d, [{ kind: 'text', name: 'text', got: 'x', want: 'y' }]);
});
