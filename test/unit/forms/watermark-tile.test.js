/**
 * Unit: the self-contained watermark Tile kernel
 * (lib/forms/tile/watermark/watermark.transform.js).
 *
 * The watermark Tile owns BOTH render adapters in one file (issue #356), so
 * this single test exercises both and PINS their parity — replacing the split
 * coverage that previously lived across separate render-path test files
 * (retired in the same consolidation). Three render paths, one source.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const wm = require('../../../lib/forms/tile/watermark/watermark.transform');

const sec = (cls, inner = '') => `<section class="${cls}" data-lattice-slide="x">${inner}</section>`;
const deck = (sections) => sections.join('');
const doc = (html) => new JSDOM(`<!DOCTYPE html><body>${html}</body>`).window.document;
const glyphsHtml = (html) => [...html.matchAll(/<div class="tile-watermark"[^>]*>(\d+)<\/div>/g)].map((m) => m[1]);
const tilesIn = (html) => [...doc(html).querySelectorAll('.tile-watermark')].map((n) => n.outerHTML).sort();
const domTilesIn = (d) => [...d.querySelectorAll('.tile-watermark')].map((n) => n.outerHTML).sort();

describe('watermark Tile — applyToHtml (HTML-string path)', () => {
  test('injects the 2-digit section number on form+watermark slides', () => {
    const html = deck([
      sec('divider', '<h2>One</h2>'),
      sec('content form watermark'),
      sec('divider', '<h2>Two</h2>'),
      sec('content form watermark'),
    ]);
    assert.deepEqual(glyphsHtml(wm.applyToHtml(html)), ['01', '02']);
  });

  test('only fires with BOTH form and watermark', () => {
    const html = deck([sec('divider', '<h2>S</h2>'), sec('content form'), sec('content watermark')]);
    assert.ok(!/tile-watermark/.test(wm.applyToHtml(html)));
  });

  test('no dividers → no-op', () => {
    const html = deck([sec('content form watermark')]);
    assert.equal(wm.applyToHtml(html), html);
  });

  test('idempotent', () => {
    const html = deck([sec('divider', '<h2>S</h2>'), sec('content form watermark')]);
    const once = wm.applyToHtml(html);
    assert.equal(wm.applyToHtml(once), once);
  });

  test('non-string input passes through', () => {
    assert.equal(wm.applyToHtml(undefined), undefined);
  });
});

describe('watermark Tile — applyToDom (live-DOM path)', () => {
  const deckHtml = sec('divider', '<h2>One</h2>') + sec('content form watermark') +
                   sec('divider', '<h2>Two</h2>') + sec('content form watermark') +
                   sec('content form'); // no watermark token → skipped

  test('2-digit section number on form+watermark slides only', () => {
    const d = doc(deckHtml);
    wm.applyToDom(d);
    assert.deepEqual([...d.querySelectorAll('.tile-watermark')].map((n) => n.textContent), ['01', '02']);
  });

  test('no dividers → no-op; idempotent', () => {
    const d = doc(sec('content form watermark'));
    wm.applyToDom(d);
    assert.equal(d.querySelector('.tile-watermark'), null);
    const d2 = doc(sec('divider', '<h2>S</h2>') + sec('content form watermark') + sec('content form watermark'));
    wm.applyToDom(d2);
    wm.applyToDom(d2);
    assert.equal(d2.querySelectorAll('.tile-watermark').length, 2);
  });

  test('null document → no throw', () => {
    assert.doesNotThrow(() => wm.applyToDom(null));
  });
});

describe('watermark Tile — cross-path parity', () => {
  test('applyToDom and applyToHtml inject byte-identical Tile markup', () => {
    const deckHtml = sec('divider', '<h2>One</h2>') + sec('content form watermark') +
                     sec('divider', '<h2>Two</h2>') + sec('content form watermark');
    const d = doc(deckHtml);
    wm.applyToDom(d);
    assert.deepEqual(domTilesIn(d), tilesIn(wm.applyToHtml(deckHtml)));
  });
});
