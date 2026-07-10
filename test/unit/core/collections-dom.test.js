/**
 * Unit: lib/core/collections.js — domItemElements / domRowElements. Extracted
 * from lib/transformers/focus.js's resolveAxisDom (HARD RULE 15) and
 * generalized so callers can pass either a <section> or an arbitrary
 * descendant clip-cell as `root`. See test/unit/transformers/focus.test.js
 * for the original section-rooted coverage this mirrors.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { domItemElements, domRowElements } = require('../../../lib/core/collections');

describe('domItemElements', () => {
  test('finds top-level <li> under a direct <ul>', () => {
    const dom = new JSDOM('<section><ul><li>One</li><li>Two<ul><li>nested</li></ul></li></ul></section>');
    const items = domItemElements(dom.window.document.querySelector('section'));
    assert.equal(items.length, 2);
    assert.equal(items[0].textContent, 'One');
  });

  test('finds items nested under .cell-stage (masthead-lift fallback)', () => {
    const dom = new JSDOM('<section><div class="cell-stage"><ol><li>A</li><li>B</li></ol></div></section>');
    const items = domItemElements(dom.window.document.querySelector('section'));
    assert.equal(items.length, 2);
  });

  test('works when root IS the cell itself (a clip-cell caller, not a section)', () => {
    const dom = new JSDOM('<div class="cell-stage"><ul><li>X</li><li>Y</li><li>Z</li></ul></div>');
    const items = domItemElements(dom.window.document.querySelector('.cell-stage'));
    assert.equal(items.length, 3);
  });

  test('returns [] when no list is present', () => {
    const dom = new JSDOM('<section><p>no list here</p></section>');
    assert.deepEqual(domItemElements(dom.window.document.querySelector('section')), []);
  });

  test('returns [] for a null/undefined root without throwing', () => {
    assert.deepEqual(domItemElements(null), []);
    assert.deepEqual(domItemElements(undefined), []);
  });
});

describe('domRowElements', () => {
  test('finds <tr> under table tbody, any depth', () => {
    const dom = new JSDOM('<section><table><tbody><tr><td>r1</td></tr><tr><td>r2</td></tr></tbody></table></section>');
    const rows = domRowElements(dom.window.document.querySelector('section'));
    assert.equal(rows.length, 2);
  });

  test('returns [] when no table is present', () => {
    const dom = new JSDOM('<section><ul><li>not a table</li></ul></section>');
    assert.deepEqual(domRowElements(dom.window.document.querySelector('section')), []);
  });
});
