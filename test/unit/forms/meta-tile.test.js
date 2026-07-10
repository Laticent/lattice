/**
 * Unit: the self-contained meta Tile kernel
 * (lib/forms/tile/meta/meta.transform.js).
 *
 * The meta Tile owns both render adapters + the `meta:` front-matter reader in
 * one file (issue #356), so this single test exercises all three and PINS the
 * cross-path parity that previously lived split across separate render-path
 * test files (retired in the same consolidation).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const meta = require('../../../lib/forms/tile/meta/meta.transform');

const sec = (cls, inner = '') => `<section class="${cls}" data-lattice-slide="x">${inner}</section>`;
const bay = (cls = 'content form') =>
  sec(cls, '<div class="cell-masthead"><div class="masthead-lede"><h2>T</h2></div><div class="masthead-bay"></div></div>');
const doc = (html) => new JSDOM(`<!DOCTYPE html><body>${html}</body>`).window.document;
const tilesIn = (html) => [...doc(html).querySelectorAll('.tile-meta')].map((n) => n.outerHTML).sort();
const domTilesIn = (d) => [...d.querySelectorAll('.tile-meta')].map((n) => n.outerHTML).sort();

describe('meta Tile — readFrontMatter', () => {
  test('reads `meta:`, trims quotes, null when unset / no front matter', () => {
    assert.equal(meta.readFrontMatter('---\nmeta: "Q2 · Board"\n---\n'), 'Q2 · Board');
    assert.equal(meta.readFrontMatter('---\ntheme: cuoio\n---\n'), null);
    assert.equal(meta.readFrontMatter('no front matter'), null);
    assert.equal(meta.readFrontMatter(''), null);
  });
});

describe('meta Tile — applyToHtml (HTML-string path)', () => {
  test('fills the reserved .masthead-bay of form sections', () => {
    const out = meta.applyToHtml(bay(), '---\nmeta: "Q2 FY26 · Board pack"\n---\n');
    assert.match(out, /<div class="masthead-bay"><div class="tile-meta">Q2 FY26 · Board pack<\/div><\/div>/);
  });

  test('a `|` splits into stacked lines', () => {
    const out = meta.applyToHtml(bay(), '---\nmeta: "A | B"\n---\n');
    assert.match(out, /<div class="tile-meta">A<br>B<\/div>/);
  });

  test('no-op without `meta:` front matter', () => {
    const html = bay();
    assert.equal(meta.applyToHtml(html, '---\ntheme: cuoio\n---\n'), html);
  });

  test('idempotent — only an EMPTY bay matches', () => {
    const md = '---\nmeta: "X"\n---\n';
    const once = meta.applyToHtml(bay(), md);
    assert.equal(meta.applyToHtml(once, md), once);
  });

  test('escapes HTML in the meta value', () => {
    const out = meta.applyToHtml(bay(), '---\nmeta: "<b> & x"\n---\n');
    assert.match(out, /<div class="tile-meta">&lt;b&gt; &amp; x<\/div>/);
  });
});

describe('meta Tile — applyToDom (live-DOM path)', () => {
  test('fills the empty bay; `|` → stacked lines; escapes HTML', () => {
    const d = doc(bay());
    meta.applyToDom(d, 'Q2 <b> | Owner & Co');
    const el = d.querySelector('.masthead-bay > .tile-meta');
    assert.ok(el, 'meta Tile injected');
    assert.equal(el.innerHTML, 'Q2 &lt;b&gt;<br>Owner &amp; Co');
  });

  test('no-op without a value, and idempotent', () => {
    const d = doc(bay());
    meta.applyToDom(d, '');
    assert.equal(d.querySelector('.tile-meta'), null);
    meta.applyToDom(d, 'X');
    meta.applyToDom(d, 'X');
    assert.equal(d.querySelectorAll('.tile-meta').length, 1);
  });

  test('null document → no throw', () => {
    assert.doesNotThrow(() => meta.applyToDom(null, 'X'));
  });
});

describe('meta Tile — cross-path parity', () => {
  test('applyToDom and applyToHtml inject byte-identical Tile markup', () => {
    const value = 'Q2 FY26 · Board | Owner';
    const d = doc(bay());
    meta.applyToDom(d, value);
    const kernelHtml = meta.applyToHtml(bay(), `---\nmeta: "${value}"\n---\n`);
    assert.deepEqual(domTilesIn(d), tilesIn(kernelHtml));
  });
});
