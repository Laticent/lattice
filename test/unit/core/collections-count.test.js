/**
 * Unit: lib/core/collections.js countAxis — the render-EXACT capacity counter.
 *
 * The render-time authority behind the content-capacity contract
 * (engineering/decisions/2026-06-17-content-capacity-contract.md): given a
 * slide's resolved HTML it counts the primary collection along an axis, reusing
 * the same walkers the focus/build resolvers use so the count matches what
 * renders. lint-core's markdown counter is the live approximation; this is the
 * authority it must agree with.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { countAxis } = require('../../../lib/core/collections');

describe('collections: countAxis', () => {
  test('item counts top-level <li>, not nested ones', () => {
    const html = '<ul><li>A<ul><li>body</li></ul></li><li>B<ul><li>body</li></ul></li><li>C</li></ul>';
    assert.equal(countAxis(html, 'item'), 3);
  });
  test('item uses the first list only', () => {
    const html = '<ul><li>A</li><li>B</li></ul><ul><li>X</li></ul>';
    assert.equal(countAxis(html, 'item'), 2);
  });
  test('row counts tbody data rows (header in thead excluded)', () => {
    const html = '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr><tr><td>3</td><td>4</td></tr></tbody></table>';
    assert.equal(countAxis(html, 'row'), 2);
  });
  test('col counts the widest row cell count', () => {
    const html = '<table><thead><tr><th>A</th><th>B</th><th>C</th></tr></thead><tbody><tr><td>1</td><td>2</td><td>3</td></tr></tbody></table>';
    assert.equal(countAxis(html, 'col'), 3);
  });
  test('cell counts every tbody cell', () => {
    const html = '<table><tbody><tr><td>1</td><td>2</td></tr><tr><td>3</td><td>4</td></tr></tbody></table>';
    assert.equal(countAxis(html, 'cell'), 4);
  });
  test('line counts source lines, as lint does: a newline inside a span starts a line too', () => {
    const html = '<pre><code><span class="s">"a\nb"</span>\nx\ny\n</code></pre>';
    assert.equal(countAxis(html, 'line'), 4);
  });
  test('returns 0 when the axis collection is absent', () => {
    assert.equal(countAxis('<h2>Just a heading</h2>', 'item'), 0);
    assert.equal(countAxis('<ul><li>a</li></ul>', 'row'), 0);
    assert.equal(countAxis('', 'item'), 0);
  });
});
