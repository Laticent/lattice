const { test } = require('node:test');
const assert = require('node:assert/strict');

const { mapSections } = require('../../../lib/core/section-walk');

const TWO = '<section id="1" class="title">A</section><section id="2" class="stats dark">B</section>';

test('null/undefined from the callback passes a section through byte-identical', () => {
  assert.equal(mapSections(TWO, () => null), TWO);
  assert.equal(mapSections(TWO, () => undefined), TWO);
});

test('a string return replaces the inner, keeping open/close tags', () => {
  const out = mapSections(TWO, (_openTag, cls, inner) => (cls.includes('stats') ? `[${inner}]` : null));
  assert.equal(out, '<section id="1" class="title">A</section><section id="2" class="stats dark">[B]</section>');
});

test('an { openTag, inner } return replaces both', () => {
  const out = mapSections('<section class="chart">C</section>', () => ({
    openTag: '<section class="chart chart-frame">',
    inner: 'X',
  }));
  assert.equal(out, '<section class="chart chart-frame">X</section>');
});

test('the callback receives openTag verbatim, cls, and inner', () => {
  const calls = [];
  mapSections(TWO, (openTag, cls, inner) => { calls.push([openTag, cls, inner]); return null; });
  assert.deepEqual(calls, [
    ['<section id="1" class="title">', 'title', 'A'],
    ['<section id="2" class="stats dark">', 'stats dark', 'B'],
  ]);
});

test('a class-less section yields cls === ""', () => {
  let seen;
  mapSections('<section>plain</section>', (_o, cls) => { seen = cls; return null; });
  assert.equal(seen, '');
});

test('nested <section> in user content stays inside its parent (depth-aware)', () => {
  const html = '<section class="outer">pre<section class="inner">deep</section>post</section>';
  const seen = [];
  const out = mapSections(html, (_o, cls) => { seen.push(cls); return null; });
  assert.deepEqual(seen, ['outer'], 'only the top-level section is visited');
  assert.equal(out, html);
});

test('degenerate input passes through: no sections, unterminated open tag, missing close', () => {
  assert.equal(mapSections('no sections here', () => 'X'), 'no sections here');
  assert.equal(mapSections('<section class="a"', () => 'X'), '<section class="a"');
  assert.equal(mapSections('<section class="a">never closed', () => 'X'), '<section class="a">never closed');
});

test('content between and after sections is preserved', () => {
  const html = 'lead<section>A</section>mid<section>B</section>tail';
  assert.equal(mapSections(html, () => null), html);
  assert.equal(mapSections(html, (_o, _c, inner) => inner + '!'), 'lead<section>A!</section>mid<section>B!</section>tail');
});

// A `<section` that a browser reads as TEXT — quoted in a comment, in `<style>`
// or `<script>` text, or in an attribute value — must not open a section. The
// old `indexOf('<section')` scan opened one that never closed, stopped, and
// passed every later slide through untouched: no masthead band, no stage cell,
// for every kernel built on this walk.
test('a <section quoted as text neither opens a section nor stops the walk', () => {
  const quotes = [
    '<!-- quoting <section class="title"> -->',
    '<style>/* <section> */ h2 { letter-spacing: 0; }</style>',
    '<script>const s = "<section>";</script>',
    '<p title="<section>">x</p>',
  ];
  for (const q of quotes) {
    const html = `<section class="a">A</section><section class="b">B${q}</section><section class="c">C</section>`;
    const seen = [];
    const out = mapSections(html, (_o, cls, inner) => { seen.push(cls); return `${inner}!`; });
    assert.deepEqual(seen, ['a', 'b', 'c'], q);
    assert.equal(out, `<section class="a">A!</section><section class="b">B${q}!</section><section class="c">C!</section>`, q);
  }
});

test('an untouched section passes through byte-identical, including a malformed close tag', () => {
  // `null` promises byte-identity; the shared walker accepts `</section >` as a
  // close, so the pass-through writes the close tag it read, not a literal one.
  const html = '<section class="a">A</section >gap<section>B</SECTION>';
  assert.equal(mapSections(html, () => null), html);
});

test('an UNTERMINATED comment is text, so the walk goes on past it', () => {
  // A browser reads `<!--` with no `-->` as a comment to end of file. Matching
  // that dropped every later slide from the export (one `<div><!-- oops</div>`
  // in a raw HTML block took a four-slide deck to one page), so the tokenizer
  // reads it as text, the rule it already applies to an unclosed `<style>`.
  const html = '<section class="a">A<div><!-- oops</div></section><section class="b">B</section>';
  const seen = [];
  mapSections(html, (_o, cls) => { seen.push(cls); return null; });
  assert.deepEqual(seen, ['a', 'b']);
});

const { mapSectionHtml } = require('../../../lib/core/section-walk');

test('mapSectionHtml hands the callback the whole section and passes null through verbatim', () => {
  const seen = [];
  const out = mapSectionHtml(`x${TWO}y`, (sec, cls) => { seen.push([sec, cls]); return null; });
  assert.equal(out, `x${TWO}y`);
  assert.deepEqual(seen, [
    ['<section id="1" class="title">A</section>', 'title'],
    ['<section id="2" class="stats dark">B</section>', 'stats dark'],
  ]);
});

test('mapSectionHtml reads a </section> quoted in a comment as text, not the slide end', () => {
  const html = '<section class="a">x<!-- </section> -->y</section>';
  const out = mapSectionHtml(html, (sec) => sec.replace(/y<\/section>$/, 'Y</section>'));
  assert.equal(out, '<section class="a">x<!-- </section> -->Y</section>');
});
