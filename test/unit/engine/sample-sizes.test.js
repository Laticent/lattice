/**
 * The engine's table of sample-art sizes (lib/integrations/markdown-it/sample-sizes.js) is the folder's own: every picture in lib/samples/ has a
 * row, each row is the file's header size, and no row names a file that is gone. With it, a `sample:` picture's box is known
 * before its bytes on every host, not only in the CLI (media note §4.11).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { readDimensions } = require('../../../lib/core/image-dimensions.js');
const { SAMPLE_SIZES, sampleSize } = require('../../../lib/integrations/markdown-it/sample-sizes.js');

const DIR = path.resolve(__dirname, '../../../lib/samples');
const PICTURES = fs.readdirSync(DIR).filter((f) => /\.(?:jpe?g|png|gif|webp|svg)$/i.test(f)).sort();

test('every sample picture has a row, and each row is the file\'s own size', () => {
  assert.deepEqual(Object.keys(SAMPLE_SIZES).sort(), PICTURES);
  for (const f of PICTURES) {
    const d = readDimensions(path.join(DIR, f));
    assert.deepEqual(SAMPLE_SIZES[f], [d.w, d.h], f);
  }
});

test('only a `sample:` reference to a real sample has a size', () => {
  assert.deepEqual(sampleSize('sample:photo-wide.jpg'), { w: 3200, h: 2000 });
  assert.equal(sampleSize('sample:not-a-sample'), null);
  assert.equal(sampleSize('sample:__proto__'), null);
  assert.equal(sampleSize('photo-wide.jpg'), null);
  assert.equal(sampleSize(undefined), null);
});

test('a `sample:` record knows its box with no host help (the Studio and the Playground pass no imageSize)', () => {
  const engine = require('../../../lib/engine');
  const { html } = engine.render('---\ntheme: indaco\n---\n\n<!-- _class: content -->\n\n## A\n\n`@image{sample:photo-wide.jpg, title="Lake"}`\n');
  assert.match(html, /--lat-media-ar:1\.6"/);
  assert.match(html, / width="3200" height="2000"/);
});

test('a host\'s imageSize is asked with the reference the author wrote', () => {
  const engine = require('../../../lib/engine');
  const seen = [];
  const { html } = engine.render('---\ntheme: indaco\n---\n\n<!-- _class: content -->\n\n## A\n\n`@image{asset:lake, title="Lake"}`\n', 'indaco', {
    assetUrls: { lake: 'blob:x' },
    imageSize: (url, ref) => { seen.push([url, ref]); return { w: 400, h: 300 }; },
  });
  assert.deepEqual(seen, [['blob:x', 'asset:lake']]);
  assert.match(html, /--lat-media-ar:1\.3333"/);
});
