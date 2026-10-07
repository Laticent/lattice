const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {
  readDimensions, stampImageBucket, stampImageComposition, bgUrlOf, urlToLocalPath, jpegSize,
} = require('../../../lib/core/image-dimensions');

test('jpegSize fails safe (no throw) on malformed/truncated input', () => {
  // FFD8 (SOI) then a run of fill bytes that walks `off` past the buffer end —
  // the parser must return null, not throw "offset out of range".
  const malformed = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(100, 0xff)]);
  assert.doesNotThrow(() => jpegSize(malformed));
  assert.equal(jpegSize(malformed), null);
  assert.equal(jpegSize(Buffer.from([0xff, 0xd8])), null); // SOI only
});

const COMP = path.join(__dirname, '../../../lib/samples');
const asset = (name) => pathToFileURL(path.join(COMP, name)).href;
const section = (cls, url, attrs = '') =>
  `<section class="${cls}"${attrs}><div class="lattice-bg lattice-bg-full" style="background-image:url('${url}')"></div><div class="image-text"><h2>T</h2><p>B</p></div></section>`;

test('readDimensions parses the packaged SVG sample photos', () => {
  assert.deepEqual(readDimensions(path.join(COMP, 'photo-wide.svg')), { w: 1600, h: 1000 });
  assert.deepEqual(readDimensions(path.join(COMP, 'photo-tall.svg')), { w: 800, h: 1200 });
  assert.deepEqual(readDimensions(path.join(COMP, 'photo-pano.svg')), { w: 2400, h: 900 });
  assert.equal(readDimensions(path.join(COMP, 'does-not-exist.svg')), null);
});

test('bgUrlOf / urlToLocalPath extract and localize the asset', () => {
  assert.equal(bgUrlOf(section('image', asset('photo-wide.svg'))), asset('photo-wide.svg'));
  assert.equal(urlToLocalPath('https://example.com/x.png'), null); // remote → no stamp
  assert.equal(urlToLocalPath('data:image/png;base64,AAAA'), null);
});

test('stampImageBucket reads the real asset and stamps the bucket', () => {
  const out = stampImageBucket(section('image', asset('photo-tall.svg')));
  assert.match(out, /<section[^>]*\bdata-img-bucket="tall"/);
});

test('stampImageBucket no-ops on non-image / remote / already-stamped', () => {
  assert.doesNotMatch(stampImageBucket(section('content', asset('photo-wide.svg'))), /data-img-bucket/);
  assert.doesNotMatch(stampImageBucket(section('image', 'https://x/y.png')), /data-img-bucket/);
  const once = stampImageBucket(section('image', asset('photo-wide.svg')));
  assert.equal(stampImageBucket(once), once); // idempotent
});

test('stampImageComposition resolves bucket × orientation (run after bucket stamp)', () => {
  // wide + landscape → clean
  let s = stampImageComposition(stampImageBucket(section('image', asset('photo-wide.svg'))));
  assert.match(s, /data-img-composition="clean"/);
  // tall + landscape → split
  s = stampImageComposition(stampImageBucket(section('image', asset('photo-tall.svg'))));
  assert.match(s, /data-img-composition="split"/);
  // pano + portrait → split
  s = stampImageComposition(stampImageBucket(section('image', asset('photo-pano.svg'), ' data-orientation="portrait"')));
  assert.match(s, /data-img-composition="split"/);
});

test('stampImageComposition: explicit author class wins over the resolver', () => {
  // a tall photo would auto-resolve to split; `spotlight` forces full-bleed cover
  const s = stampImageComposition(stampImageBucket(section('image spotlight', asset('photo-tall.svg'))));
  assert.match(s, /data-img-composition="spotlight"/);
});

test('stampImageComposition: unreadable / remote asset → Clean floor', () => {
  const s = stampImageComposition(section('image', 'https://x/y.png'));
  assert.match(s, /data-img-composition="clean"/);
});
