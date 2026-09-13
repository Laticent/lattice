/**
 * `mdCell` in tools/jank-census.js — the census table's cell sanitiser.
 *
 * WHY THIS FILE EXISTS. The first cut escaped `|` and stopped there, which CodeQL flagged as
 * `js/incomplete-sanitization` (high) on PR #2163. The defect is not abstract: escaping a
 * delimiter without escaping the ESCAPE CHARACTER means an input that already contains `\|`
 * comes out as `\\|` — a literal backslash followed by a live, unescaped cell delimiter. The
 * sanitiser hands back exactly the character it was there to neutralise.
 *
 * The census writes a COMMITTED table (engineering/jank-census.md) from strings assembled out
 * of child-process stderr and CSS selectors, so a broken row is a broken artifact in the repo,
 * not a transient. And a sanitiser nobody has watched fail is a decoration — the same shape of
 * defect as the two inert gates the rest of that PR was about, which is why it is pinned here
 * rather than left to the reader of the regex.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { mdCell } = require('../../../tools/jank-census.js');

test('mdCell escapes the backslash before the pipe', () => {
  // THE REGRESSION ITSELF. Under the old `.replace(/\|/g, '\\|')` this returned `\\|`:
  // backslash-backslash-pipe, which GFM renders as one literal backslash and then ENDS THE
  // CELL. Escaping the escape first makes it `\\\|` — a literal backslash, then an escaped
  // pipe — and the row survives.
  assert.equal(mdCell('a\\|b'), 'a\\\\\\|b');

  // A lone backslash is doubled, so it renders as one backslash rather than escaping
  // whatever character the table put next to it.
  assert.equal(mdCell('trailing\\'), 'trailing\\\\');

  // And the ordinary case still works.
  assert.equal(mdCell('a|b'), 'a\\|b');
});

test('mdCell strips every line ending, including a LONE carriage return', () => {
  // Unlike a pipe, a newline has no escape in a GFM table — it ends the ROW. check-jank's
  // refusals are built from child stderr, which is free to contain one.
  assert.equal(mdCell('first\nsecond'), 'first second');
  assert.equal(mdCell('crlf\r\nsecond'), 'crlf second');

  // THE ONE THE FIRST CUT MISSED BY A CHARACTER. `\r?\n` does not match a bare `\r`, and a
  // lone CR is a line ending in GFM — so a progress spinner's output split the row anyway,
  // which is this function's own defect surviving inside its own fix. `reason` is assembled
  // with `.split('\n')`, which does not split on a lone `\r`, so one really reaches here.
  assert.equal(mdCell('spinner\rdone'), 'spinner done');
  assert.equal(mdCell('a\r\rb'), 'a b');
  assert.ok(!/[\r\n]/.test(mdCell('mixed\r\n\rtail\n')), 'no line ending may survive');
});

test('mdCell accepts a non-string without throwing', () => {
  // Cells are interpolated from a JSON payload; a null or a number reaching here should
  // degrade to text rather than take the whole render down.
  assert.equal(mdCell(42), '42');
  assert.equal(mdCell(null), 'null');
  assert.equal(mdCell(undefined), 'undefined');
});

test('a real check-jank refusal survives the round trip', () => {
  // The shape that actually reaches this function: the census joins each axis refusal with
  // ' | ', so an unmeasurable class carries pipes by construction. Every one must come back
  // escaped, and the result must contain no unescaped delimiter.
  const reason = "heading: check-jank: 'quote's skeleton has no heading line | count: no element builder";
  const cell = mdCell(reason);
  assert.ok(!/(^|[^\\])\|/.test(cell), `an unescaped pipe survived: ${cell}`);
  assert.equal(cell.match(/\\\|/g).length, 1);
});

test('requiring the module does not run the CLI', () => {
  // `main()` is behind `require.main === module`. Without that guard this very file would
  // have launched a 296-class Chromium sweep on import, so the guard is load-bearing for the
  // suite and not just tidiness.
  assert.equal(typeof mdCell, 'function');
});
