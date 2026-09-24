/**
 * top-level-h2 — the depth-aware element reader shared by the masthead kernel
 * and the topic-track kernel.
 *
 * Every case here is one a DEPTH-BLIND regex gets wrong, because that regex is
 * what this module exists to replace: it is still hand-rolled at five other
 * sites, and the one time it reached a component it lifted a QR card's in-card
 * title into the masthead band.
 */
const test = require('node:test');
const assert = require('node:assert');
const { findTopLevelH2, hasTopLevelTag, readTopLevelH2Text } = require('../../../lib/core/top-level-h2');

test('a nested h2 is not the section heading', () => {
  assert.equal(readTopLevelH2Text('<div class="card"><h2>Inner</h2></div><h2>Real</h2>'), 'Real');
});

test('a void tag does not open a depth level', () => {
  assert.equal(readTopLevelH2Text('<p><img src="x"></p><h2>Real</h2>'), 'Real');
  assert.equal(readTopLevelH2Text('<br><hr><h2>Real</h2>'), 'Real');
});

test('no top-level heading is a real answer, not a throw', () => {
  assert.equal(findTopLevelH2('<div><h2>Inner</h2></div>'), null);
  assert.equal(readTopLevelH2Text('<p>prose only</p>'), '');
});

test('entities are left ENCODED — the consumer re-emits into HTML', () => {
  // Decoding here would double-encode on the way out, and is what keeps the
  // string and DOM adapters agreeing on a heading like `R&D`.
  assert.equal(readTopLevelH2Text('<h2>R&amp;D</h2>'), 'R&amp;D');
});

test('inline markup inside the heading is stripped, whitespace collapsed', () => {
  assert.equal(readTopLevelH2Text('<h2>Cost <em>to</em>\n  win</h2>'), 'Cost to win');
});

test('hasTopLevelTag sees a direct child and not a nested one', () => {
  assert.equal(hasTopLevelTag('<h2>A</h2><ul><li>x</li></ul>', 'ul'), true);
  assert.equal(hasTopLevelTag('<blockquote><ul><li>x</li></ul></blockquote>', 'ul'), false);
  assert.equal(hasTopLevelTag('<div><div><ul><li>x</li></ul></div></div>', 'ul'), false);
});

test('an UPPERCASE <H2> is the heading, matching the DOM mirror', () => {
  // CASE-INSENSITIVE, deliberately, and this test used to pin the opposite.
  // The walk matched tag names case-insensitively and then extracted the
  // element case-SENSITIVELY, so `<H2>` was reported as a hit and could not be
  // read back. Skipping it split the engine from the runtime twice: the
  // masthead lifted a different heading than `:scope > h2` does, and
  // `topic-track` dropped that slide's name from every sibling's track on one
  // render path only (HARD RULE #1). `:scope > h2` picks the FIRST direct-child
  // heading whatever its case, so the engine now does too.
  //
  // Measured before changing it: 0 of 184 `examples/*.md` at 4999ea3 render differently
  // either way, so the committed corpus is indifferent and parity is free.
  assert.equal(readTopLevelH2Text('<H2>Deco</H2><h2>Real</h2>'), 'Deco');
  assert.equal(readTopLevelH2Text('<H2>Deco</H2>'), 'Deco');
  assert.equal(readTopLevelH2Text('<h2>Real</h2>'), 'Real');
});

test('a `<!--` a browser reads as TEXT does not blank the rest of the section', () => {
  // The mask form chained `.replace()` over comments FIRST, with an
  // end-of-string fallback, so a `<!--` inside an attribute value or inside
  // RAWTEXT blanked everything after it and the heading vanished. The masthead
  // gates its whole band on `Boolean(findTopLevelH2(...))`, so the band
  // disappeared silently, on every render path. A real parser reads neither
  // position as a comment, and neither does the tokenizer.
  assert.equal(
    readTopLevelH2Text('<div data-tip="type <!-- to open a note">P.</div><h2>Real</h2>'),
    'Real',
  );
  assert.equal(
    readTopLevelH2Text('<style>/* arrows <!-- and dashes */ section{}</style><h2>Real</h2>'),
    'Real',
  );
  // An UNTERMINATED comment is text here, though a browser reads it as a comment
  // to EOF: following the browser dropped every later slide from the export (see
  // the note at the comment branch of `scanTags`). A heading after one is read.
  assert.equal(readTopLevelH2Text('<!-- oops <h2>Real</h2>'), 'Real');
});

test('a `>` inside a quoted attribute value does not end the tag', () => {
  // The mask form could not see attribute quoting, so `<div title="a > b">`
  // ended early and desynchronized the depth count — the nested heading then
  // read as top-level.
  assert.equal(readTopLevelH2Text('<div title="a > b"><h2>Nested</h2></div><h2>Top</h2>'), 'Top');
  assert.equal(hasTopLevelTag('<div data-x="/><ul>"><ul><li>x</li></ul></div>', 'ul'), false);
});

test('tag-like text inside a comment is not markup', () => {
  assert.equal(hasTopLevelTag('<h2>A</h2><!-- <ul><li>x</li></ul> -->', 'ul'), false);
  // An unclosed tag inside a comment must not shift depth for what follows.
  assert.equal(hasTopLevelTag('<!-- <div> --><ul><li>x</li></ul>', 'ul'), true);
  assert.equal(readTopLevelH2Text('<!-- <div> --><h2>Real</h2>'), 'Real');
});

test('RAWTEXT element contents are not markup', () => {
  assert.equal(hasTopLevelTag('<script>var s = "<ul>";</script>', 'ul'), false);
  assert.equal(hasTopLevelTag('<style>/* <ul> */</style><ul><li>x</li></ul>', 'ul'), true);
});

test('an unmatched end tag does not walk a nested element up to top level', () => {
  // Depth was a COUNTER, so any close tag closed something: `<div></aside><ul>`
  // walked back to 0 and reported the list as a direct child. It is an open-
  // element STACK now, and it splits the way the spec does — which matters in
  // both directions, since getting the split backwards flipped the error rather
  // than fixing it.
  //
  // `</aside>` was never opened, so a parser drops it and the `<ul>` stays in
  // the `<div>`.
  assert.equal(hasTopLevelTag('<div></aside><ul><li>x</li></ul></div>', 'ul'), false);
  // `</span>` falls to "any other end tag", which stops at the first SPECIAL
  // element above it — the `<div>` is still open, so the end tag is dropped.
  assert.equal(readTopLevelH2Text('<span><div></span><h2>Real</h2>'), '');
  // `</blockquote>` is on the explicit list: it pops to its match unconditionally,
  // closing the `<div>` above it, so the heading IS a direct child.
  assert.equal(readTopLevelH2Text('<blockquote><div></blockquote><h2>Real</h2>'), 'Real');
  // Same branch, closing the inline element between.
  assert.equal(readTopLevelH2Text('<div><span></div><h2>Real</h2>'), 'Real');
});

/* ── DIFFERENTIAL AGAINST A REAL PARSER ──────────────────────────────────────
 *
 * The kernel's whole job is to answer, from a string, the question the runtime
 * answers with `:scope > h2` and `:scope > ul` off a real parse. So the test is
 * not "does it match a regex I wrote" — it is "does it agree with a parser".
 *
 * DETERMINISTIC, deliberately. An earlier revision of this work quoted a
 * randomized figure ("60,000 documents, 0 divergences") in a docblock with no
 * committed generator, which made it unfalsifiable — a checker built its own
 * and got a different number. Every shape below is one that a randomized run
 * actually surfaced, so the corpus IS the finding list, and a regression names
 * the rule it broke instead of a seed.
 */
const { JSDOM: JSD } = require('jsdom');

test('agrees with a real HTML parser on every shape that has bitten this walk', () => {
  const CASES = [
    // Inert spans holding tag-like text.
    '<!-- <ul><li>c</li></ul> --><h2>Real</h2>',
    '<!-- <div> --><ul><li>x</li></ul>',
    '<style>/* <!-- */ a{}</style><h2>Real</h2>',
    '<script>var a = "</div>";</script><ul><li>x</li></ul>',
    '<div data-tip="type <!-- to open">P.</div><h2>Real</h2>',
    // Attribute values that look like structure.
    '<div title="a > b"><h2>Nested</h2></div><h2>Top</h2>',
    '<h2 class="x>y">Q</h2>',
    '<h2>Alpha <span title="a > b">x</span></h2>',
    // End tags the parser honors, ignores, or redirects.
    '<div></aside><ul><li>x</li></ul></div>',
    '<span><div></span><h2>Real</h2>',
    '<blockquote><div></blockquote><h2>Real</h2>',
    '<div><span></div><h2>Real</h2>',
    // `<div/>` is not self-closing in HTML.
    '<div/><h2>Title</h2>',
    '<div/><ul><li>x</li></ul>',
    // A block element closes an open paragraph — in SCOPE, not just at the top.
    '<p>A claim: <ul><li>inline list</li></ul></p>',
    '<p><em><ul><li>x</li></ul>',
    '<p><b><h2 class="x>y">Q</h2>',
    // Table structure outside a table is dropped.
    '<caption><ul><li>x</li></ul>',
    '<tr><td><h2>Real</h2>',
    '<table><tr><td>c</td></tr></table><h2>Real</h2>',
    // `<template>` content is a separate fragment.
    '<template><div></template><h2>Real</h2>',
    '<template><h2>Inner</h2></template><h2>Real</h2>',
    '<template><ul><li>x</li></ul></template>',
    // Scope barriers.
    '<button><div></button><h2>Real</h2>',
    // A SIBLING start tag closes the one it follows — the rule CLOSED_BY_SIBLING
    // models. The heading rows are the load-bearing ones: without them
    // `<h3>a<h2>Real</h2>` reports no top-level heading at all, which is the
    // masthead's whole band. The list / table / definition rows change no answer
    // here (an explicit end tag pops the stack to its match anyway) and are kept
    // because the walk is a parser model, not a list of today's questions.
    '<h3>a<h2>Real</h2>',
    '<h2>Outer<h2>Inner</h2>',
    '<ul><li>a<li>b</ul><h2>Real</h2>',
    '<dl><dt>a<dd>b</dl><h2>Real</h2>',
    '<table><tr><td>a<td>b</table><h2>Real</h2>',
    // Case.
    '<H2>Deco</H2><h2>Real</h2>',
    '<H2>Up</H2>',
    // Ordinary shapes, as controls.
    '<h2>A</h2><ul><li>x</li></ul>',
    '<blockquote><ul><li>x</li></ul></blockquote>',
    '<div><div><ul><li>x</li></ul></div></div>',
    '<div><ul><li>x</li></ul>',
    '<h2>A</h2><p>b</p>',
    '',
  ];
  const dom = new JSD('<body><section id="s"></section></body>');
  const sec = dom.window.document.getElementById('s');
  const misses = [];
  for (const html of CASES) {
    sec.innerHTML = html;
    const h = sec.querySelector(':scope > h2');
    const wantH2 = h ? h.textContent.replace(/\s+/g, ' ').trim() : '';
    const wantUl = Boolean(sec.querySelector(':scope > ul'));
    const gotH2 = readTopLevelH2Text(html);
    const gotUl = hasTopLevelTag(html, 'ul');
    if (gotH2 !== wantH2) misses.push(`h2 ${JSON.stringify(html)}: ${JSON.stringify(gotH2)} != ${JSON.stringify(wantH2)}`);
    if (gotUl !== wantUl) misses.push(`ul ${JSON.stringify(html)}: ${gotUl} != ${wantUl}`);
  }
  assert.deepEqual(misses, []);
});

test('`<!-->` and `<!--->` are complete, empty comments', () => {
  // Searching for `-->` after the opener read them as a comment that ran to the next `-->`,
  // swallowing every heading in between.
  assert.equal(readTopLevelH2Text('<p>a <!--> b</p><h2>Real</h2><!-- note -->'), 'Real');
  assert.equal(readTopLevelH2Text('<p>a <!---> b</p><h2>Real</h2><!-- note -->'), 'Real');
});
