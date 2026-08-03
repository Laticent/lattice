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
// The neutralizer cases carry the most weight. The set hides ONLY what no shipped repair closes,
// and it used to be a pair — the sweep hid `pagination` and `rail` because it could not repair
// them, which is what made breaking the repair a 0.0-point event. Both surfaces now supply the
// position and hide the same two residuals, so re-ADDING an entry silently re-blinds a surface to
// something that ships. That is the regression these pin.

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

// ── The supplied deck position ───────────────────────────────────────────────
// These three moved here from docs/src/lib/single-slide-render.ts, where they had NO direct unit
// coverage at all — they were exercised only through a browser render path and three Playwright
// specs. They are the shipped repair for the "1 of 1" bug, and the headless sweep now calls the
// same copy, so a change here moves `npm run equiv` as well as the Studio.

test('slideSeparatorRe is a FACTORY — two callers cannot share a lastIndex', () => {
  // The caller-side separator had four copies of its literal (lint.ts, positionIsTrustworthy,
  // deckSectionFor twice), and their entire job is to agree: when they don't, the rail, the
  // editor↔preview sync and the supplied page number are counting different things. One
  // definition now — but handed out as a factory, because a shared `/g` instance carries
  // `lastIndex` and two interleaved scans would silently skip matches.
  const a = core.slideSeparatorRe('g');
  const b = core.slideSeparatorRe('g');
  assert.notEqual(a, b);
  assert.equal(a.source, b.source);
  a.exec('x\n---\ny');
  assert.notEqual(a.lastIndex, 0);
  assert.equal(b.lastIndex, 0, 'a second instance must not inherit the first\'s scan position');
  assert.equal(core.slideSeparatorRe().flags, '', 'no flags unless asked — a global default is the footgun');
  assert.deepEqual('a\n---\nb\n-----\nc'.split(core.slideSeparatorRe()), ['a', 'b', 'c']);
});

test('positionIsTrustworthy needs a slide count it can compare against', () => {
  assert.equal(core.positionIsTrustworthy('# One', undefined), false);
  assert.equal(core.positionIsTrustworthy('# One', 0), false);
});

test('positionIsTrustworthy accepts a plain deck whose chunk count the caller agrees with', () => {
  assert.equal(core.positionIsTrustworthy('# One\n\n---\n\n# Two\n\n---\n\n# Three', 3), true);
});

test('positionIsTrustworthy refuses when the caller counts a different number of slides', () => {
  // The two splitters already disagree, so "slide k" does not identify section k.
  assert.equal(core.positionIsTrustworthy('# One\n\n---\n\n# Two', 3), false);
});

test('positionIsTrustworthy refuses a `_focusSteps` deck — one slide becomes one per step', () => {
  assert.equal(core.positionIsTrustworthy('<!-- _focusSteps: 3 -->\n# One', 1), false);
});

test('positionIsTrustworthy refuses every hr form the `\\n---\\n` splitter cannot see', () => {
  // markdown-it breaks on all of these; the caller's splitter breaks on none. Either side
  // miscounts, so the position must not be supplied.
  for (const rule of ['***', '___', '- - -', '--- ']) {
    assert.equal(core.positionIsTrustworthy(`# One\n\n${rule}\n\n# Two`, 1), false, rule);
  }
});

test('positionIsTrustworthy refuses a chunk carrying two top-level headings — heading split is the DEFAULT', () => {
  // The bug this pins: gating on a `split: headings` PROBE let this through, because heading
  // splitting needs no directive. The engine renders three sections; the caller counts two slides;
  // the preview printed "2 of 2" where the truth was "3 of 3".
  assert.equal(core.positionIsTrustworthy('# One\n\n## Also One\n\n---\n\n# Two', 2), false);
});

test('positionIsTrustworthy refuses a SETEXT heading — the hole that shipped a wrong page number', () => {
  // Found by the red team. `Interlude` over a row of `=` is an h1 to markdown-it and invisible to an
  // ATX-only `^#{1,2}` scan, so a 3-chunk deck rendered FOUR sections while this returned true — and
  // the preview painted "3" on the slide the deck numbers 4. Refusing is the answer rather than
  // counting them: whether an underline is a heading depends on the paragraph above it, which is a
  // parse, not a scan.
  assert.equal(core.positionIsTrustworthy('# One\n\n---\n\n# Two\n\ntext\n\nInterlude\n=========\n\nmore\n', 2), false);
  assert.equal(core.positionIsTrustworthy('# One\n\n---\n\n# Two\n\ntext\n\nInterlude\n=\n\nmore\n', 2), false);
  // The `-` underline is the worse half: `Text` over `---` is a setext h2 to markdown-it and a SLIDE
  // SEPARATOR to the caller — the two disagree about the same three characters.
  assert.equal(core.positionIsTrustworthy('# One\n\nParagraph\n---\n\nmore\n', 2), false);
});

test('positionIsTrustworthy refuses ATX indented 1-3 spaces — markdown allows it, column 0 missed it', () => {
  assert.equal(core.positionIsTrustworthy('# One\n\n---\n\n# Two\n\n  ## Also\n\ntext\n', 2), false);
  assert.equal(core.positionIsTrustworthy('# One\n\n---\n\n# Two\n\n   # Also\n\ntext\n', 2), false);
});

test('positionIsTrustworthy refuses a `---` inside an HTML comment — the caller splits, the engine does not', () => {
  assert.equal(core.positionIsTrustworthy('# One\n\n<!-- a\n---\nb -->\n\ntext\n', 2), false);
});

test('the comment check does not span an intervening `-->` — it silently refused 126 of 128 decks', () => {
  // A lazy `[\s\S]*?` matched from the FIRST `<!--`, across a real separator, to a LATER `-->` — so
  // any deck with directive comments either side of a separator was refused and the whole
  // optimization switched off with every test still green. This is the shape that caught it.
  const deck = '<!-- _class: title -->\n# One\n\n---\n\n<!-- _class: content -->\n# Two\n';
  assert.equal(core.positionIsTrustworthy(deck, 2), true);
});

test('positionIsTrustworthy still accepts the ordinary shapes — an over-refusing guard is a dead optimization', () => {
  assert.equal(core.positionIsTrustworthy('# One\n\n- a\n- b\n\n---\n\n# Two\n', 2), true, 'a dash list is not a setext underline');
  assert.equal(core.positionIsTrustworthy('# One\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n---\n\n# Two\n', 2), true, 'a table delimiter row is not a setext underline');
  assert.equal(core.positionIsTrustworthy('# One\n\n```\n---\n```\n\n---\n\n# Two\n', 2), true, 'a fenced `---` is neither');
});

test('positionIsTrustworthy accepts that same deck once it opts OUT of heading splitting', () => {
  const deck = '---\nsplit: rule\n---\n\n# One\n\n## Also One\n\n---\n\n# Two';
  assert.equal(core.positionIsTrustworthy(deck, 2), true);
});

test('positionIsTrustworthy ignores a heading inside a fence', () => {
  assert.equal(core.positionIsTrustworthy('# One\n\n```md\n# Not a heading\n```\n', 1), true);
});

test('deckSectionFor is undefined for a deck with no dividers — no rail to supply', () => {
  assert.equal(core.deckSectionFor('# One\n\n---\n\n# Two', 1), undefined);
});

test('deckSectionFor counts dividers at or before the shown slide', () => {
  const deck = '<!-- _class: divider -->\n# A\n\n---\n\n# a1\n\n---\n\n<!-- _class: divider -->\n# B\n\n---\n\n# b1';
  assert.deepEqual(core.deckSectionFor(deck, 0), { index: 1, total: 2 });
  assert.deepEqual(core.deckSectionFor(deck, 1), { index: 1, total: 2 });
  assert.deepEqual(core.deckSectionFor(deck, 2), { index: 2, total: 2 });
  assert.deepEqual(core.deckSectionFor(deck, 3), { index: 2, total: 2 });
});

test('deckSectionFor bails when a divider appears inside code — FAIL SAFE, not fail wrong', () => {
  // As a probe, matching a divider in prose cost a wasted parse and produced correct output. As a
  // COUNTER the same match paints an extra dot and bumps the watermark glyph — wrong output.
  const deck = '<!-- _class: divider -->\n# A\n\n---\n\nWrite `<!-- _class: divider -->` to divide.';
  assert.equal(core.deckSectionFor(deck, 1), undefined);
});

test('deckSectionFor token-tests the class, exactly as the tiles do', () => {
  // `divider-lite` and `section-divider` are not `divider`; a substring match would count them.
  assert.equal(core.deckSectionFor('<!-- _class: divider-lite -->\n# A\n\n---\n\n# B', 1), undefined);
  assert.deepEqual(core.deckSectionFor('<!-- _class: cover divider -->\n# A\n\n---\n\n# B', 1), { index: 1, total: 1 });
});

test('supplyablePosition composes the three fields, or hands over nothing', () => {
  const deck = '<!-- _class: divider -->\n# A\n\n---\n\n# a1';
  assert.deepEqual(core.supplyablePosition(deck, 1, 2), { offset: 1, total: 2, deckSection: { index: 1, total: 1 } });
  assert.equal(core.supplyablePosition(deck, undefined, 2), undefined);
  assert.equal(core.supplyablePosition(deck, -1, 2), undefined);
  assert.equal(core.supplyablePosition(deck, 1, 5), undefined, 'an untrusted count supplies nothing at all');
});

// ── normalizeSection ─────────────────────────────────────────────────────────
const PAGED_A = '<section id="3" data-lattice-pagination="3"><span class="lat-pagination">3</span></section>';
const PAGED_B = '<section id="7" data-lattice-pagination="9"><span class="lat-pagination">9</span></section>';

test('normalizeSection hides nothing by default', () => {
  assert.notEqual(core.normalizeSection(PAGED_A), core.normalizeSection(PAGED_B));
  assert.match(core.normalizeSection(PAGED_A), /id="3"/);
});

test('the neutralizer set KEEPS a page-number difference — that is the finding, on both surfaces', () => {
  // THE PIN THAT MATTERS. `pagination` used to be neutralized for the headless sweep, back when the
  // sweep could not repair it: the supply functions lived in docs/src and the sweep rendered every
  // slice with no position. Hiding it there meant breaking `positionIsTrustworthy` outright moved
  // `equiv:check` by 0.0 points. Now both surfaces supply the position, so a page number that still
  // differs is a REAL failure of the repair — and this assertion is what keeps it visible. If this
  // ever equals, the sweep is back to measuring the pre-#1272 engine and the overlay has gone blind
  // to the single most likely thing it exists to catch.
  assert.notEqual(core.normalizeSection(PAGED_A, core.RESIDUAL_NEUTRALIZERS), core.normalizeSection(PAGED_B, core.RESIDUAL_NEUTRALIZERS));
});

test('the neutralizer set KEEPS the progress rail — same reason', () => {
  const withRail = '<section><div class="tile-progress"><i></i></div><p>x</p></section>';
  const without = '<section><p>x</p></section>';
  assert.notEqual(core.normalizeSection(withRail, core.RESIDUAL_NEUTRALIZERS), core.normalizeSection(without, core.RESIDUAL_NEUTRALIZERS));
});

test('the neutralizer set hides exactly the two residuals with no shipped repair', () => {
  // Named, and compared as a whole set rather than key-by-key: an ADDED key re-blinds a surface to
  // a repair that ships, which is the regression this pair of files is built to prevent. Removing
  // one is the good direction, so it is meant to fail
  // here and be re-pinned deliberately.
  assert.deepEqual(core.RESIDUAL_NEUTRALIZERS, { ids: true, whitespace: true });
  assert.equal(core.PROTOTYPE_NEUTRALIZERS, undefined, 'the prototype/shipped split is retired — one set, both surfaces');
  assert.equal(core.SHIPPED_NEUTRALIZERS, undefined, 'the prototype/shipped split is retired — one set, both surfaces');
});

test('the neutralizer set still drops the positional id — the one residual left unrepaired', () => {
  const a = '<section id="3"><p>x</p></section>';
  const b = '<section id="9"><p>x</p></section>';
  assert.equal(core.normalizeSection(a, core.RESIDUAL_NEUTRALIZERS), core.normalizeSection(b, core.RESIDUAL_NEUTRALIZERS));
});

test('whitespace between blocks is neutralized', () => {
  const a = '<section>\n\t<p>x</p>\n</section>';
  const b = '<section><p>x</p></section>';
  assert.equal(core.normalizeSection(a, core.RESIDUAL_NEUTRALIZERS), core.normalizeSection(b, core.RESIDUAL_NEUTRALIZERS));
});

// ── sectionsOf / classifyDivergence / firstDivergence ────────────────────────
test('sectionsOf returns each section in order, and [] for none', () => {
  assert.deepEqual(core.sectionsOf('<section>a</section><section>b</section>'), ['<section>a</section>', '<section>b</section>']);
  assert.deepEqual(core.sectionsOf('<p>no sections</p>'), []);
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

test('the section parsers do not backtrack exponentially (js/redos)', () => {
  // CodeQL flagged both quote-aware patterns high: with a `[^>]` catch-all a quote is matchable by
  // BOTH the quoted branch and the catch-all, so a run of `""` decomposes exponentially many ways.
  // The catch-all is now `[^>"']`, leaving exactly one parse. This input hangs the ambiguous form.
  const evil = `<section ${'""'.repeat(600)}`;
  const t0 = process.hrtime.bigint();
  core.sectionText(evil);
  core.diffSections(evil, `${evil}x`);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(ms < 500, `parsing took ${ms.toFixed(1)}ms — the alternatives are ambiguous again`);
});

// ── The cause buckets, split ─────────────────────────────────────────────────
// These were ONE bucket named "generated ids / cat-N". On the corpus that fused 44 invisible id
// counters with 5 `cat-N` — and `cat-N` is the VISIBLE bug this whole feature line exists to catch
// (a proof panel showing the wrong hue), presented to the author under the id bucket's reassuring
// "a known repair is still owed". Most-visible-first ordering is the property; these pin it.

test('classifyDivergence names a cat-N hue difference on its own', () => {
  assert.equal(core.classifyDivergence('<section class="proof cat-1"></section>', '<section class="proof cat-3"></section>'), 'cat-N (categorical hue)');
});

test('classifyDivergence names a generated-id difference on its own', () => {
  assert.equal(
    core.classifyDivergence('<section><svg aria-labelledby="lat-svgt-1"></svg></section>', '<section><svg aria-labelledby="lat-svgt-2"></svg></section>'),
    'generated ids (unscoped counter)',
  );
});

test('a visible hue difference is NOT hidden behind an invisible id difference', () => {
  // The regression that matters: when both move, the bucket must not read as the benign one.
  const got = '<section class="cat-1"><svg aria-labelledby="lat-svgt-1"></svg></section>';
  const want = '<section class="cat-3"><svg aria-labelledby="lat-svgt-2"></svg></section>';
  assert.equal(core.classifyDivergence(got, want), 'cat-N + generated ids');
  assert.match(core.classifyDivergence(got, want), /cat-N/);
});

test('classifyDivergence names the chart `<defs>` id family too, not just the a11y one', () => {
  // 51 corpus slides read `unclassified` while their ENTIRE difference was a counter offset,
  // because the bucket knew only `lat-svgt`/`lat-svgd` and not the five chart `<defs>` families.
  // `gantt-fill-pass-N` is the shape that proves the point: the family name is a PREFIX of the id,
  // so a pattern anchoring `-\d+` straight to it matches nothing.
  for (const [a, b] of [
    ['pie-wedge-1', 'pie-wedge-6'],
    ['radar-area-1', 'radar-area-4'],
    ['chart-spine-1', 'chart-spine-2'],
    ['gantt-fill-pass-1', 'gantt-fill-pass-5'],
    ['q-tint-1', 'q-tint-3'],
  ]) {
    assert.equal(
      core.classifyDivergence(`<section><defs><linearGradient id="${a}"/></defs></section>`, `<section><defs><linearGradient id="${b}"/></defs></section>`),
      'generated ids (unscoped counter)',
      a,
    );
  }
});

test('the generated-id family list matches render-ids.js — the duplicate cannot rot', () => {
  // The core takes NO imports (its header says why) and render-ids.js is CommonJS, so its FAMILIES
  // list is duplicated rather than shared. Read BOTH sources and require the same family names, so
  // a sixth family added there fails here instead of quietly landing corpus slides in
  // `unclassified` — which is exactly how the five above went unnamed.
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '../../..');
  const families = (src, name) => {
    const m = new RegExp(`${name}\\s*=\\s*/(?:\\\\b)?(?:\\(\\?:)?([^/]*?)(?:\\)(?:\\[\\\\w-\\]\\*)?(?:-\\\\d\\+)?(?:\\\\b)?)?/g?`).exec(src);
    assert.ok(m, `could not read ${name}`);
    return new Set(m[1].split('|').filter((f) => /^[a-z]/.test(f)));
  };
  const mint = families(fs.readFileSync(path.join(root, 'lib/core/render-ids.js'), 'utf8'), 'const FAMILIES');
  const known = families(fs.readFileSync(path.join(root, 'lib/diagnostics/slice-equivalence-core.mjs'), 'utf8'), 'const GENERATED_ID');
  assert.deepEqual([...mint].sort(), [...known].filter((f) => f !== 'lat-svg[td]').sort());
});

test('classifyDivergence names a missing progress rail rather than shrugging', () => {
  // `unclassified` is useless to an author. A rail on one side and not the other has a specific
  // meaning: no section position was supplied, because the deck's divider count was ambiguous.
  const withRail = '<section><div class="tile-progress"><span class="dot on"></span></div></section>';
  const without = '<section></section>';
  assert.equal(core.classifyDivergence(without, withRail), 'progress rail absent');
});

// ── alignmentFailure — the guard the compare closure depends on ───────────────
// Extracted from the compare because nothing at any tier executed it: not the unit suite, not the
// PR gate, not even the nightly e2e. It is the check that stops an index-based lookup from quoting
// a slide the author did not select (examples/focus.md: 11 authored slides, 14 engine sections).

const SECT = (n) => Array.from({ length: n }, (_, i) => `<section>${i}</section>`);

test('alignmentFailure passes when the counts agree and the index is in range', () => {
  const html = SECT(3).join('');
  assert.equal(core.alignmentFailure(html, core.sectionsOf(html), 3, 1), undefined);
});

test('alignmentFailure catches a 1→N expansion', () => {
  const html = SECT(14).join('');
  assert.match(core.alignmentFailure(html, core.sectionsOf(html), 11, 10), /renders 14 slides where the editor counts 11/);
});

test('alignmentFailure catches nested `<section>` markup the flat split mis-pairs', () => {
  // Two opens, one non-greedy match — the count check alone would not see this.
  const html = '<section><section>inner</section></section>';
  const sections = core.sectionsOf(html);
  assert.equal(sections.length, 1);
  assert.match(core.alignmentFailure(html, sections, 1, 0), /nested or unbalanced/);
});

test('alignmentFailure refuses when the caller does not know the slide count', () => {
  const html = SECT(3).join('');
  assert.match(core.alignmentFailure(html, core.sectionsOf(html), undefined, 0), /does not know how many slides/);
});

test('alignmentFailure refuses an out-of-range or fractional index', () => {
  const html = SECT(3).join('');
  for (const i of [3, -1, 1.5, Number.NaN]) assert.match(core.alignmentFailure(html, core.sectionsOf(html), 3, i), /no slide at this index/);
});

// ── The core fixes a hostile read turned up ──────────────────────────────────

test('splitSlides handles CRLF decks', () => {
  // Without `\r?` on the boundary a CRLF deck collapses to one chunk, misaligns, and is dropped
  // from the sweep with no output — a corpus can shrink invisibly.
  assert.equal(core.splitSlides('# One\r\n\r\n---\r\n\r\n# Two\r\n').length, 2);
});

test('the rail neutralizer survives a nested <div> inside the rail', () => {
  // lib/core/split-envelope.js documents and refuses the non-greedy form for exactly this. No
  // caller passes `rail: true` today — both surfaces keep the rail visible — but the option is the
  // depth-aware one, and the day something needs it again the trap must not have been re-laid.
  const withRail = '<section><div class="tile-progress"><div><i></i></div></div><p>x</p></section>';
  const without = '<section><p>x</p></section>';
  assert.equal(core.normalizeSection(withRail, { rail: true }), core.normalizeSection(without, { rail: true }));
});

test('synthesizePrelude ignores a directive shown inside a fenced code block', () => {
  const slides = ['# Teaching\n\n```md\n<!-- header: Example -->\n```\n', '# Two'];
  assert.equal(core.synthesizePrelude(slides, 1, VOCAB), '');
});

test('a page-number difference is an attribute row, not a "the words differ" row', () => {
  const got = '<section data-lattice-pagination="1"><p>Same words</p><span class="lat-pagination">1</span></section>';
  const want = '<section data-lattice-pagination="3"><p>Same words</p><span class="lat-pagination">3</span></section>';
  const kinds = core.diffSections(got, want).map((d) => d.kind);
  assert.ok(kinds.includes('attribute'), 'the pagination attribute must be named');
  assert.ok(!kinds.includes('text'), 'the words are identical — reporting "text" tells the author these are different slides');
});
