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
  // Measured before changing it: 0 of 182 `examples/*.md` render differently
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
  // An unterminated comment still swallows what follows it — that IS what a
  // browser does, so the two agree.
  assert.equal(readTopLevelH2Text('<!-- oops <h2>Real</h2>'), '');
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
