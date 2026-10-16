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

// ── EXIF Orientation (a rotated phone photo is stored as landscape pixels) ──────────
// A minimal JPEG: SOI, an optional APP1 Exif segment carrying IFD0 Orientation, SOF0.
function jpegWithOrientation(w, h, orientation, little = false) {
  const parts = [Buffer.from([0xff, 0xd8])];
  if (orientation != null) {
    const u16 = (v) => { const b = Buffer.alloc(2); (little ? b.writeUInt16LE(v) : b.writeUInt16BE(v)); return b; };
    const u32 = (v) => { const b = Buffer.alloc(4); (little ? b.writeUInt32LE(v) : b.writeUInt32BE(v)); return b; };
    const tiff = Buffer.concat([
      Buffer.from(little ? 'II' : 'MM', 'ascii'), u16(42), u32(8),
      u16(1), u16(0x0112), u16(3), u32(1), u16(orientation), u16(0), u32(0),
    ]);
    const payload = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
    const len = Buffer.alloc(2); len.writeUInt16BE(payload.length + 2);
    parts.push(Buffer.from([0xff, 0xe1]), len, payload);
  }
  const sof = Buffer.alloc(19);
  sof[0] = 0xff; sof[1] = 0xc0; sof.writeUInt16BE(17, 2); sof[4] = 8;
  sof.writeUInt16BE(h, 5); sof.writeUInt16BE(w, 7); sof[9] = 3;
  parts.push(sof);
  return Buffer.concat(parts);
}

test('jpegSize applies EXIF Orientation: 5-8 swap width and height, 1-4 and absent do not', () => {
  assert.deepEqual(jpegSize(jpegWithOrientation(4000, 3000, null)), { w: 4000, h: 3000 });
  for (const o of [1, 2, 3, 4]) assert.deepEqual(jpegSize(jpegWithOrientation(4000, 3000, o)), { w: 4000, h: 3000 }, `orientation ${o}`);
  for (const o of [5, 6, 7, 8]) assert.deepEqual(jpegSize(jpegWithOrientation(4000, 3000, o)), { w: 3000, h: 4000 }, `orientation ${o}`);
});

test('jpegSize reads EXIF Orientation in both byte orders', () => {
  assert.deepEqual(jpegSize(jpegWithOrientation(4000, 3000, 6, true)), { w: 3000, h: 4000 });
  assert.deepEqual(jpegSize(jpegWithOrientation(4000, 3000, 6, false)), { w: 3000, h: 4000 });
});

test('jpegSize ignores an out-of-range Orientation value', () => {
  assert.deepEqual(jpegSize(jpegWithOrientation(4000, 3000, 9)), { w: 4000, h: 3000 });
  assert.deepEqual(jpegSize(jpegWithOrientation(4000, 3000, 0)), { w: 4000, h: 3000 });
});

// Hostile Exif segments: each must return the stored size, never throw, and never read past
// the segment. The helper builds the APP1 payload by hand so the IFD fields can be lied about.
function jpegWithRawExif(w, h, tiff, { segmentLength } = {}) {
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
  const len = Buffer.alloc(2);
  len.writeUInt16BE(segmentLength ?? payload.length + 2);
  const sof = Buffer.alloc(19);
  sof[0] = 0xff; sof[1] = 0xc0; sof.writeUInt16BE(17, 2); sof[4] = 8;
  sof.writeUInt16BE(h, 5); sof.writeUInt16BE(w, 7); sof[9] = 3;
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), len, payload, sof]);
}
const be16 = (v) => { const b = Buffer.alloc(2); b.writeUInt16BE(v); return b; };
const be32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32BE(v); return b; };

test('jpegSize: an IFD offset far past the segment returns the stored size', () => {
  const tiff = Buffer.concat([Buffer.from('MM'), be16(42), be32(0xffffffff)]);
  assert.deepEqual(jpegSize(jpegWithRawExif(4000, 3000, tiff)), { w: 4000, h: 3000 });
});

test('jpegSize: an entry count that runs past the segment returns the stored size', () => {
  // 65535 entries claimed, one real entry (Orientation 6) present: the bounds check on the
  // entry list must stop the scan at the segment end rather than read beyond it.
  const tiff = Buffer.concat([Buffer.from('MM'), be16(42), be32(8), be16(65535), be16(0x0112), be16(3), be32(1), be16(6), be16(0)]);
  assert.deepEqual(jpegSize(jpegWithRawExif(4000, 3000, tiff)), { w: 3000, h: 4000 }, 'the real first entry is still read');
  const tiffNoTag = Buffer.concat([Buffer.from('MM'), be16(42), be32(8), be16(65535), be16(0x0100), be16(3), be32(1), be16(1), be16(0)]);
  assert.deepEqual(jpegSize(jpegWithRawExif(4000, 3000, tiffNoTag)), { w: 4000, h: 3000 });
});

test('jpegSize: a segment shorter than an Exif header returns the stored size', () => {
  const tiff = Buffer.concat([Buffer.from('MM'), be16(42), be32(8)]);
  assert.deepEqual(jpegSize(jpegWithRawExif(4000, 3000, tiff, { segmentLength: 10 })), { w: 4000, h: 3000 });
});

test('jpegSize: an XMP APP1 before the Exif APP1 does not hide the orientation', () => {
  const xmpPayload = Buffer.from('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta/>', 'binary');
  const xmpLen = Buffer.alloc(2);
  xmpLen.writeUInt16BE(xmpPayload.length + 2);
  const xmp = Buffer.concat([Buffer.from([0xff, 0xe1]), xmpLen, xmpPayload]);
  const exifJpeg = jpegWithOrientation(4000, 3000, 6); // SOI + APP1 Exif + SOF0
  const withXmp = Buffer.concat([exifJpeg.subarray(0, 2), xmp, exifJpeg.subarray(2)]);
  assert.deepEqual(jpegSize(withXmp), { w: 3000, h: 4000 });
});

test('jpegSize never throws on truncations of a valid rotated JPEG', () => {
  const full = jpegWithOrientation(4000, 3000, 6, true);
  for (let n = 0; n < full.length; n++) {
    assert.doesNotThrow(() => jpegSize(full.subarray(0, n)), `truncated to ${n} bytes`);
  }
});
