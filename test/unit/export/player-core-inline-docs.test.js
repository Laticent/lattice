// `assemblePlayer` takes either cap: the string `inlineAssets` (the browser host) or `inlineDocAssets` on the parsed tree (the
// Node host). The report must come out the same shape from both, including what the KaTeX step already pushed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const doc = '<!DOCTYPE html><html><head><link rel="stylesheet" href="file:///x/katex.min.css"></head><body><section data-lattice-slide="1"><span class="katex">x</span></section></body></html>';
const base = { sanitize: (h) => h, sha256: async () => 'h', katexCss: () => null, parseHtml: (h) => new JSDOM(h).window.document };

test('the DOM cap keeps what the KaTeX step reported, and adds its own', async () => {
  const { assemblePlayer } = await import('../../../lib/export/player-core.mjs');
  const viaDom = await assemblePlayer({ docHtml: doc, source: '' }, { ...base, inlineDocAssets: () => ({ count: 2, missing: ['a.png'] }) });
  const viaString = await assemblePlayer({ docHtml: doc, source: '' }, { ...base, inlineAssets: (h) => ({ html: h, count: 2, missing: ['a.png'] }) });
  assert.equal(viaDom.report.images, 2);
  assert.deepEqual(viaDom.report.missing.sort(), ['a.png', 'katex.min.css']);
  assert.equal(viaDom.report.images, viaString.report.images);
});

test('when both caps are supplied only the DOM one runs (no doubled report)', async () => {
  const { assemblePlayer } = await import('../../../lib/export/player-core.mjs');
  let stringCalled = false;
  const r = await assemblePlayer({ docHtml: doc, source: '' }, {
    ...base,
    inlineAssets: (h) => { stringCalled = true; return { html: h, count: 5, missing: ['x'] }; },
    inlineDocAssets: () => ({ count: 2, missing: [] }),
  });
  assert.equal(stringCalled, false);
  assert.equal(r.report.images, 2);
});
