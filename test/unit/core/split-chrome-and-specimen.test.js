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
  const body = 'data-split-role="body" data-header="DECK HEADER" data-footer="DECK FOOTER"';

  test('the deck\'s own footer and header go', () => {
    const out = stripDeckChrome(section(body,
      '<header>DECK HEADER</header><div class="cell-footer"><footer>DECK FOOTER</footer></div>'));
    assert.ok(!/<footer>DECK FOOTER<\/footer>/.test(out), 'the deck footer survived');
    assert.ok(!/<header>DECK HEADER<\/header>/.test(out), 'the deck header survived');
  });

  test('an author\'s footer beside it stays — the case that shipped broken', () => {
    const out = stripDeckChrome(section(body,
      '<div class="cell-footer"><footer>AUTHOR-FOOTER</footer><footer>DECK FOOTER</footer></div>'));
    assert.match(out, /<footer>AUTHOR-FOOTER<\/footer>/, 'the author\'s footer was deleted');
    assert.ok(!/<footer>DECK FOOTER<\/footer>/.test(out), 'the deck footer survived');
  });

  test('a directive carrying markdown still matches — comparison is on visible text', () => {
    const out = stripDeckChrome(section(
      'data-split-role="body" data-footer="Q3 review"',
      '<div class="cell-footer"><footer><strong>Q3</strong> review</footer></div>'));
    assert.ok(!/<footer>/.test(out), 'a markdown-rendered deck footer was not recognized');
  });

  test('a section with NO footer directive keeps every footer it has', () => {
    const out = stripDeckChrome(section('data-split-role="body"',
      '<div class="cell-footer"><footer>AUTHOR-ONLY</footer></div>'));
    assert.match(out, /<footer>AUTHOR-ONLY<\/footer>/);
  });

  test('a slide the split did not emit is untouched', () => {
    const html = section('data-footer="DECK FOOTER"',
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
