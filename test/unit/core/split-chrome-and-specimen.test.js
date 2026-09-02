/**
 * Unit: two ways a split run silently took something that was not the deck's.
 *
 * Both were found by the HARD RULE #25 red team on a real render, and both are the same shape —
 * a pattern that looked like it identified the engine's own output and actually matched an
 * author's.
 *
 * 1. `stripDeckChrome` removed `<header>`/`<footer>` BY TAG from every page of a run. But an
 *    author may write a literal `<footer>` in markdown, and the engine hoists it into the very
 *    same `.cell-footer` as the deck's own — they are siblings, indistinguishable by tag, depth
 *    or position. So the strip deleted authored content from every page of a run while leaving
 *    it untouched on an unsplit slide.
 *
 *    The fix keyed the strip on the section's `data-header` / `data-footer`, and that was the
 *    SAME MISTAKE ONE LEVEL DOWN (2026-09-02): Marp writes a per-slide `_footer:` override into
 *    that attribute too, so it identifies "this slide's caption" exactly as readily as "the
 *    deck's band" — and the strip went on deleting the author's words, now from any slide that
 *    set its own footer. Shipped live on `examples/portrait-roadmap.pdf`, and reproduced on
 *    `examples/portrait-journey.md`, whose front matter declares NO footer at all while all
 *    three of its journey slides set one. The deck's strings now come from the DECK — parsed
 *    from its front matter by the caller and passed in — and no section attribute is consulted.
 *
 * 2. `SPECIMEN_RE` tested the section's inner HTML for `<!-- stress-slide -->`. That marker is
 *    not a Marp directive, so Marp consumes it as a SPEAKER NOTE and the comment never reaches
 *    the DOM — the section carries `<aside class="lattice-notes">stress-slide</aside>` instead.
 *    The only per-slide opt-out an author has therefore never worked, on any deck. It went
 *    unnoticed while the trigger was measured (a specimen that fit was not split anyway); the
 *    structural trigger is what turned it into a live failure, on 53 gallery specimen files.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { stripDeckChrome, splitDoc } = require('../../../lib/core/auto-split');

const section = (attrs, inner) =>
  `<main><section data-lattice-slide="1" ${attrs} class="content">${inner}</section></main>`;

describe('stripDeckChrome removes the DECK\'s chrome, not an author\'s', () => {
  const body = 'data-split-role="body"';
  const DECK = { header: 'DECK HEADER', footer: 'DECK FOOTER' };

  test('the deck\'s own footer and header go', () => {
    const out = stripDeckChrome(section(body,
      '<header>DECK HEADER</header><div class="cell-footer"><footer>DECK FOOTER</footer></div>'), DECK);
    assert.ok(!/<footer>DECK FOOTER<\/footer>/.test(out), 'the deck footer survived');
    assert.ok(!/<header>DECK HEADER<\/header>/.test(out), 'the deck header survived');
  });

  test('an author\'s footer beside it stays — the case that shipped broken', () => {
    const out = stripDeckChrome(section(body,
      '<div class="cell-footer"><footer>AUTHOR-FOOTER</footer><footer>DECK FOOTER</footer></div>'), DECK);
    assert.match(out, /<footer>AUTHOR-FOOTER<\/footer>/, 'the author\'s footer was deleted');
    assert.ok(!/<footer>DECK FOOTER<\/footer>/.test(out), 'the deck footer survived');
  });

  test('a directive carrying markdown still matches — comparison is on visible text', () => {
    const out = stripDeckChrome(
      section(body, '<div class="cell-footer"><footer><strong>Q3</strong> review</footer></div>'),
      { footer: 'Q3 review' });
    assert.ok(!/<footer>/.test(out), 'a markdown-rendered deck footer was not recognized');
  });

  test('a DECK that declares no footer keeps every footer its slides have', () => {
    const out = stripDeckChrome(section(body,
      '<div class="cell-footer"><footer>AUTHOR-ONLY</footer></div>'), { header: 'DECK HEADER' });
    assert.match(out, /<footer>AUTHOR-ONLY<\/footer>/);
  });

  // THE REGRESSION THIS FILE EXISTS TO HOLD, in its second costume. A per-slide `_footer:`
  // lands in `data-footer` exactly as a deck-level one does, so a strip that reads the section
  // deletes the author's caption from every page of the run — and prints it nowhere else.
  // Keyed on a footer the SECTION advertises and the DECK never declared: the old
  // implementation removed it, this one must not.
  test('a per-slide _footer: override is NOT the deck\'s chrome', () => {
    const out = stripDeckChrome(section(
      'data-split-role="body" data-header="DECK HEADER" data-footer="Vertical board · the dip reads twice"',
      '<header>DECK HEADER</header>' +
      '<div class="cell-footer"><footer>Vertical board · the dip reads twice</footer></div>'),
      { header: 'DECK HEADER' });
    assert.match(out, /<footer>Vertical board · the dip reads twice<\/footer>/,
      'the slide\'s own _footer: was stripped as if the deck had written it — the words reach no page at all');
    assert.ok(!/<header>DECK HEADER<\/header>/.test(out), 'the deck header should still go');
  });

  test('a slide the split did not emit is untouched', () => {
    const html = section('', '<div class="cell-footer"><footer>DECK FOOTER</footer></div>');
    assert.equal(stripDeckChrome(html, DECK), html);
  });

  test('no deck argument strips nothing — forgetting it costs de-duplication, never words', () => {
    const html = section(body, '<header>DECK HEADER</header>' +
      '<div class="cell-footer"><footer>DECK FOOTER</footer></div>');
    assert.equal(stripDeckChrome(html), html);
  });
});

describe('the stress-slide specimen marker keeps a slide whole', () => {
  // Driven through `splitDoc` rather than by matching the regex, because the defect was NOT in
  // the pattern's shape — it was that the pattern was tested against markup that never contains
  // what it looked for. Only running the split can tell those apart.
  const CAP = { checklist: { axis: 'item', sweet: 4, soft: 5, hard: 6 } };
  const slide = (marker) => '<main>'
    + '<section data-lattice-slide="1" id="1" data-class="checklist" class="checklist form" '
    + 'data-orientation="portrait" data-family="tall" data-lattice-pagination="1" '
    + 'data-lattice-pagination-total="1">'
    + '<div class="cell-masthead"><div class="masthead-lede"><h2>Specimen</h2></div></div>'
    + `<div class="cell-stage"><ul><li>One</li><li>Two</li><li>Three</li></ul></div>${marker}`
    + '</section></main>';
  const pages = (html) => (html.match(/<section\b/g) || []).length;

  test('an unmarked slide splits — the control', () => {
    const r = splitDoc(slide(''), CAP);
    assert.ok(r.changed >= 1, 'the control did not split, so this suite proves nothing');
    assert.ok(pages(r.html) > 1, `expected a run, got ${pages(r.html)} page(s)`);
  });

  test('the SPEAKER-NOTE form Marp actually emits keeps it whole', () => {
    const note = '<aside class="lattice-notes" hidden data-slide="1">stress-slide</aside>';
    const r = splitDoc(slide(note), CAP);
    assert.equal(pages(r.html), 1,
      'the specimen split — the only per-slide opt-out an author has is dead again');
  });

  test('the comment form an author types keeps it whole', () => {
    const r = splitDoc(slide('<!-- stress-slide -->'), CAP);
    assert.equal(pages(r.html), 1);
  });

  test('a slide that merely MENTIONS the marker in its prose still splits', () => {
    const prose = '<p>Mark a specimen with the stress-slide comment.</p>';
    const r = splitDoc(slide(prose), CAP);
    assert.ok(pages(r.html) > 1,
      'an ordinary slide discussing the marker became exempt — the pattern over-matches');
  });
});

// ── the DECK's chrome has TWO declaration sites, and one reader has to know both ──
//
// FOUND BY THE INDEPENDENT CHECKER, both arms. `stripDeckChrome` takes the deck's header/footer
// from its caller; how the caller finds them is where this went wrong twice:
//
//   · `frontMatterValue` anchors `^[ \t]*key:`, which also matches an INDENTED line inside a
//     block scalar. A deck carrying `style: |` / `  header:hover { … }` read its "deck header"
//     as `hover { … }` and stripped nothing. `front-matter-key.js` already exports
//     `topLevelFrontMatterValue` for exactly this hazard — `class:` and `color-mode:` use it.
//   · A RUNNING-GLOBAL comment directive is the other declaration site Lattice supports, and it
//     is deck chrome as much as the front-matter form. Reading front matter alone left the deck
//     band repeating on every page of every run — the thing the strip exists to remove.
//
// The underscore is the whole discriminator, and it is the same conflation that made reading the
// section's `data-footer` wrong: a running-global `header:` is the deck's, a spot `_header:` is
// this slide's. `deckChromeFrom` asks the shared grammar rather than re-spelling it.
describe('deckChromeFrom finds the deck\'s own chrome, at either declaration site', () => {
  const { deckChromeFrom } = require('../../../lib/core/auto-split');
  const fm = (body) => `---\n${body}\n---\n\n# slide`;

  test('top-level front matter', () => {
    assert.deepEqual(deckChromeFrom(fm('header: "Deck H"\nfooter: "Deck F"')),
      { header: 'Deck H', footer: 'Deck F' });
  });

  test('a `style:` block cannot hijack it — the indented line is not the directive', () => {
    assert.deepEqual(deckChromeFrom(fm('style: |\n  header:hover { opacity: 1 }\nheader: "Real H"')).header,
      'Real H',
      'an indented `header:` inside a block scalar was read as the deck header');
  });

  test('a running-global comment directive is the deck\'s chrome', () => {
    const md = `${fm('theme: indaco')}\n\n<!-- header: "Global H" -->\n<!-- footer: "Global F" -->\n\n# x`;
    assert.deepEqual(deckChromeFrom(md), { header: 'Global H', footer: 'Global F' });
  });

  test('a per-slide `_footer:` override is NOT the deck\'s chrome', () => {
    const md = `${fm('theme: indaco')}\n\n<!-- _footer: "Slide caption" -->\n\n# x`;
    assert.equal(deckChromeFrom(md).footer, null,
      'a spot directive was taken as the deck band — the strip would delete the slide\'s caption');
  });

  test('a global carries forward and a later spot does not replace it', () => {
    const md = `${fm('theme: indaco')}\n\n<!-- footer: "Global F" -->\n\n# a\n\n---\n\n<!-- _footer: "Caption" -->\n\n# b`;
    assert.equal(deckChromeFrom(md).footer, 'Global F');
  });

  test('a prose comment mentioning a directive word is not a directive', () => {
    const md = `${fm('theme: indaco')}\n\n<!-- just a note about the header -->\n\n# x`;
    assert.equal(deckChromeFrom(md).header, null);
  });

  test('a deck declaring neither has no chrome to strip', () => {
    assert.deepEqual(deckChromeFrom(fm('theme: indaco')), { header: null, footer: null });
  });
});
