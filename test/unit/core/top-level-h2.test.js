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
