/**
 * The masthead lift leaves a COMPOSED frame alone: a section whose footer cell is already a direct
 * child (the split envelope's cover and closing pages). The string kernel must answer exactly as
 * the runtime's DOM mirror does (`:scope > .cell-footer`, lib/transformers/masthead-lift.js), or a
 * live preview and the export disagree about the same section.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { transformMastheadSection } = require('../../../lib/forms/cell/masthead/masthead.transform');

const skipped = (inner) => transformMastheadSection(inner, 'content form') === inner;

test('a direct-child footer cell marks a composed frame, in either quote style or class position', () => {
  assert.equal(skipped('<h2>T</h2><p>x</p><div class="cell-footer">1</div>'), true);
  assert.equal(skipped("<h2>T</h2><div class='cell-footer'>1</div>"), true);
  assert.equal(skipped('<h2>T</h2><div class="x cell-footer">1</div>'), true);
  assert.equal(skipped('<h2>T</h2><img src="a.png"><div class="cell-footer">1</div>'), true, 'a void element opens no level');
});

test('anything the DOM selector would not match is still lifted', () => {
  assert.equal(skipped('<h2>T</h2><ul><li><div class="cell-footer">1</div></li></ul>'), false, 'nested, not a direct child');
  assert.equal(skipped('<h2>T</h2><div class="cell-footer-x">1</div>'), false, 'a different class token');
  assert.equal(skipped('<h2>T</h2><!-- <div class="cell-footer"> --><p>x</p>'), false, 'a comment is text');
  assert.equal(skipped('<h2>T</h2><p>x</p>'), false);
});
