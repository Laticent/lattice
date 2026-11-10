/**
 * Unit: lib/core/reserved-attrs.mjs — author HTML may not carry the attributes the split and Fluid
 * stamp as their own (engineering/decisions/2026-10-27-fluid-layout-library.md §5.2, §11, §12).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { neutralizeReservedAttrs } = require('../../../lib/core/reserved-attrs.mjs');
const { createEngine } = require('../../../lib/engine');

const RESERVED = /data-(?:split|fluid)-/i;
const engine = createEngine();
const render = (body) => engine.render(`---\ntheme: indaco\n---\n\n${body}\n`, 'indaco', { preview: true }).html;
// The engine's own section stamps are not author HTML; look only inside the slide bodies.
const authored = (html) => html.replace(/<section\b[^>]*>/g, '<section>');

test('renames the prefix and keeps every other attribute', () => {
  const out = neutralizeReservedAttrs('<div data-split-role="body" class="x" DATA-Fluid-Budget=0 id=y>a</div>');
  assert.doesNotMatch(out, RESERVED);
  assert.equal(out, '<div data-x-split-role="body" class="x" data-x-fluid-Budget=0 id=y>a</div>');
});

test('input without a reserved prefix comes back as the same string', () => {
  const s = '<div class="a" data-splitter="ok"><span id=b>x</span></div>';
  assert.equal(neutralizeReservedAttrs(s), s);
});

// The five shapes that broke a per-token tag parser, each confirmed live in Chromium by the
// independent check. The browser carries comment, rawtext and quote state across tokens, which is
// why the rewrite does not parse at all.
const BYPASSES = {
  'empty comment <!-->': '<!--><div data-split-role="cover">x</div>',
  'empty comment <!--->': '<!---><div data-split-role="cover">x</div>',
  '--!> comment close': '<!-- a --!><div data-split-role="cover">x</div> -->',
  '<!-- inside <textarea>': '<textarea><!--</textarea><div data-split-role="cover">x</div>-->',
  '<!-- inside <style>': '<style><!--</style><div data-fluid-budget="0">x</div>-->',
  '<!-- inside <script>': '<script><!--</script><div data-split-role="cover">x</div>-->',
  '<!-- inside <title>': '<title><!--</title><div data-split-role="cover">x</div>-->',
  'a quote opened in one token and closed in the next': `</section><section title="\n\n<span title='"data-split-role=cover x'>y</span>`,
};

for (const [name, body] of Object.entries(BYPASSES)) {
  test(`the engine leaves no reserved name: ${name}`, () => {
    assert.doesNotMatch(neutralizeReservedAttrs(body), RESERVED);
    assert.doesNotMatch(authored(render(body)), RESERVED);
  });
}

test('the engine neutralizes raw HTML blocks and inline tags, and the rest of the tag survives', () => {
  const html = render('<div data-split-role="body" data-fluid-budget="0" class="k">hi <span data-split-label="<b>x</b>">y</span></div>');
  assert.doesNotMatch(authored(html), RESERVED);
  assert.match(html, /class="k"/);
});

test('code is escaped, so a fence that mentions the names is untouched text', () => {
  const html = render('```html\n<div data-split-role="cover">x</div>\n```');
  assert.match(html, /data-split-role/, 'a fence shows the author what they typed');
  assert.doesNotMatch(html, /<div data-split-role/);
});

// Raw HTML could forge the slide index the engine stamps on each top-level <section>
// (followups.d/2923-p8). The split, the rail and the Studio's page pick find slides by it.
test('a quote carried across tokens cannot forge a data-lattice-slide on a top-level section', () => {
  const body = `</section><section title="\n\n<span title='"data-lattice-slide=9 x'>y</span>`;
  assert.doesNotMatch(neutralizeReservedAttrs(body), /data-lattice-slide/i);
  const html = render(body);
  assert.doesNotMatch(html, /data-lattice-slide=["']?9/, 'no author-chosen slide index survives');
  for (const [, n] of html.matchAll(/<section\b[^>]*\bdata-lattice-slide="([^"]*)"/g)) {
    assert.match(n, /^\d+$/, 'every stamped index is the engine\'s own');
    assert.notEqual(n, '9');
  }
});

test('data-lattice-slide is renamed in any case; other data-lattice- names authors write survive', () => {
  assert.equal(neutralizeReservedAttrs('<i DATA-Lattice-Slide="2" data-lattice-motion="m1">'), '<i data-x-lattice-slide="2" data-lattice-motion="m1">');
  assert.match(render('<svg data-lattice-motion="m1"></svg>'), /data-lattice-motion="m1"/);
});

// The rename runs inside comments too, so a speaker note that SAYS a reserved name renders renamed.
// The note strip matches source comments against the rendered bodies, so it must rename the
// source the same way, or the note survives a `--strip-notes` (or default player) export.
test('a speaker note that names a reserved attribute is still stripped from the source', () => {
  const notes = require('../../../lib/authoring/notes-core.js');
  const src = '---\ntheme: indaco\n---\n\n# One\n\nBody\n\n<!-- Secret: check the data-lattice-slide index and data-split-role -->\n';
  const html = engine.render(src, 'indaco', { preview: true }).html;
  const bodies = notes.noteBodiesFromHtml(html);
  assert.ok(bodies.length, 'the note renders as a note');
  assert.doesNotMatch(notes.stripNotesFromSource(src, bodies), /Secret/);
  assert.doesNotMatch(notes.stripChannelsFromSource(src, { noteBodies: bodies }), /Secret/);
});

test('only the exact data-lattice-slide name is reserved, not a longer name that starts with it', () => {
  for (const s of ['<i data-lattice-slides="3">', '<i data-lattice-slide-bake="1">', '<i data-lattice-slide.x="1">']) {
    assert.equal(neutralizeReservedAttrs(s), s, s);
  }
  assert.equal(neutralizeReservedAttrs('<i data-lattice-slide="2">'), '<i data-x-lattice-slide="2">');
});

// Raw `</section><section>` closed the engine's slide and opened a new top-level one, which the engine
// wrapped in form chrome and numbered, so every later slide's number moved up by one
// (followups.d/3051-p10). A lone `<section>` did the opposite and swallowed the next slide. The
// section tag in raw HTML is renamed like the reserved attributes, so the deck keeps its own count.
const { splitTopLevelSections } = require('../../../lib/engine/structural-split.js');
const slideCount = (body) => splitTopLevelSections(render(`# One\n\n${body}\n\n---\n\n# Two\n\nEnd\n`)).length;

test('a raw section tag is renamed in any case, and a longer tag name is not', () => {
  assert.equal(neutralizeReservedAttrs('</section><SECTION class="a">x</Section >'), '</x-section><x-section class="a">x</x-section >');
  for (const s of ['<sections>', '<section-card>', '<section.x>', '<section_a>', 'a < section']) {
    assert.equal(neutralizeReservedAttrs(s), s, s);
  }
});

const SLIDE_FORGES = {
  'a raw </section><section> block': '</section><section>',
  'the same, inline in a paragraph': 'Text </section><section class="cover"> more',
  'a quote carried across tokens': `</section><section title="\n\n<span title='"x'>y</span>`,
  'a lone <section> that would swallow the next slide': '<section>\n\nstill one',
  'a lone </section> that would end the slide early': '</section>\n\nafter',
};
for (const [name, body] of Object.entries(SLIDE_FORGES)) {
  test(`author HTML cannot add or remove a slide: ${name}`, () => {
    assert.equal(slideCount(body), 2, 'the deck has two slides and renders two top-level sections');
    const stamps = [...render(`# One\n\n${body}\n\n---\n\n# Two\n`).matchAll(/<section\b[^>]*\bdata-lattice-slide="(\d+)"/g)].map((m) => m[1]);
    if (stamps.length) assert.deepEqual(stamps, ['1', '2'], 'the second slide keeps its number');
  });
}

test('the control: without raw section tags the deck renders its two slides', () => {
  assert.equal(slideCount('Plain body'), 2);
});

// The rename runs inside comments, and notes are read back from them: a note about HTML said
// `<x-section>` where its author wrote `<section>` (the independent checker). The readers undo it;
// the strip still matches, because it renames the source the same way.
test('a speaker note, a description and a say line that mention <section> read as written', () => {
  const notes = require('../../../lib/authoring/notes-core.js');
  const src = '---\ntheme: indaco\n---\n\n# One\n\n<!-- Explain why a <section> tag is a slide, and </section> too -->\n\n<!-- describe: A <section> diagram -->\n\n<!-- say: Every <section> is a slide -->\n';
  const html = engine.render(src, 'indaco', { preview: true }).html;
  assert.deepEqual(notes.extractSlideNotes([html]), ['Explain why a <section> tag is a slide, and </section> too']);
  assert.deepEqual(notes.extractSlideDescriptions([html]), ['A <section> diagram']);
  assert.deepEqual(notes.extractSlideSayLines([html]), ['Every <section> is a slide']);
  assert.equal(splitTopLevelSections(html).length, 1, 'and the rendered comment still adds no slide');
  assert.doesNotMatch(notes.stripNotesFromSource(src, notes.noteBodiesFromHtml(html)), /Explain why/, 'the strip still finds the note');
});
