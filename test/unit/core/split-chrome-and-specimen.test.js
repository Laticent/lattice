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
  //
  // SCOPE, since the run-footer rule below narrowed it: the caption must reach A page. Which
  // pages it reaches is `stripRunFooter`'s business (the run's opener, once) — this arm carries
  // no `data-split-run`, so it is a page the run-footer rule cannot touch, and it keeps asking
  // the only question it ever asked: is a per-slide caption mistaken for the deck's band.
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

// ── the run's own footer rides the run's OPENING page, once ───────────────────────────────
//
// A split run is one slide unfolded, so the slide's `_footer:` caption belongs to the run and
// not to each of its pages. Repeating it is the repetition the 2026-09-01 chrome ruling removed
// from the DECK frame, one level down — and it is what clips: the caption lands in the shared
// Form footer band, whose budget is one line. Measured on `split-panel cat-1` at portrait, the
// authored slide fits unsplit and all three of its split pages clipped; 28 pages of the shipped
// split-panel gallery clipped the same way, and the gallery now clips 11.
//
// EVERY ARM HERE IS MUTATION-CHECKED against the obvious way to get it wrong: keying on
// `data-split-role="cover"` instead of on the run's first page. That passes arms 1-2 and fails
// arm 3, which is the shape the four native-slice strategies had before they gained a cover.
describe("a split run's own footer is said once, on the page that opens the run", () => {
  const run = (n, id, role, inner) =>
    `<section data-split-run="${n}" data-split-role="${role}" data-lattice-slide="${id}" class="content">${inner}</section>`;
  const cap = (t) => `<div class="cell-footer"><footer>${t}</footer><span class="lat-pagination">x</span></div>`;

  test('the opening page keeps it and the body pages lose it', () => {
    const html = `<main>${run(2, '2', 'cover', cap('CAPTION'))}${run(2, '2.2', 'body', cap('CAPTION'))}${run(2, '2.3', 'body', cap('CAPTION'))}</main>`;
    const out = stripDeckChrome(html, {});
    assert.equal((out.match(/<footer>CAPTION<\/footer>/g) || []).length, 1,
      'the caption should reach exactly one page of the run');
    assert.match(out.slice(0, out.indexOf('2.2')), /<footer>CAPTION<\/footer>/,
      'the page it reaches must be the one that opens the run');
  });

  test('the page number and the k-of-N rail still ride every page', () => {
    const rail = '<div class="lat-split-rail"><span class="seg on"></span></div>';
    const html = `<main>${run(2, '2', 'cover', cap('C') + rail)}${run(2, '2.2', 'body', cap('C') + rail)}</main>`;
    const out = stripDeckChrome(html, {});
    assert.equal((out.match(/lat-pagination/g) || []).length, 2, 'a page number was stripped');
    assert.equal((out.match(/lat-split-rail/g) || []).length, 2, 'the k-of-N rail was stripped');
  });

  // The native-slice shape: a run of `body` pages and no cover at all. Keying on the COVER role
  // would strip the caption from every page here and print it nowhere — the outright loss
  // `deckChromeFrom` exists to prevent, re-introduced one level down.
  test('a run with no cover keeps the caption on its FIRST body page', () => {
    const html = `<main>${run(5, '5', 'body', cap('KEEP'))}${run(5, '5.2', 'body', cap('KEEP'))}</main>`;
    const out = stripDeckChrome(html, {});
    assert.equal((out.match(/<footer>KEEP<\/footer>/g) || []).length, 1,
      'a cover-less run lost its caption entirely');
    assert.match(out.slice(0, out.indexOf('5.2')), /<footer>KEEP<\/footer>/);
  });

  test('two runs on one page do not borrow each other\'s opener', () => {
    const html = `<main>${run(2, '2', 'cover', cap('A'))}${run(2, '2.2', 'body', cap('A'))}`
      + `${run(7, '7', 'cover', cap('B'))}${run(7, '7.2', 'body', cap('B'))}</main>`;
    const out = stripDeckChrome(html, {});
    assert.equal((out.match(/<footer>A<\/footer>/g) || []).length, 1);
    assert.equal((out.match(/<footer>B<\/footer>/g) || []).length, 1);
  });

  test('an UNSPLIT slide keeps its caption — the rule is scoped to a run', () => {
    const html = `<main><section data-lattice-slide="3" class="content">${cap('SOLO')}</section></main>`;
    assert.equal(stripDeckChrome(html, {}), html);
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
