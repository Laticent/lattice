const test = require('node:test');
const assert = require('node:assert/strict');
const { parseImagesSetting, resolveImagePolicy, readImageInfo, planRecode, acceptRecode, IMAGE_MODES } = require('../../../lib/core/image-policy.js');

// A minimal PNG header: signature, IHDR (w, h, depth 8, color type), then IEND.
function png(w, h, colorType, extra = []) {
  const b = Buffer.alloc(8 + 25 + 12 + extra.length);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12);
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  b[24] = 8;
  b[25] = colorType;
  Buffer.from(extra).copy(b, 33);
  return b;
}
// A JPEG header: SOI, an APP0 segment, SOF0 with the size.
function jpeg(w, h) {
  const b = Buffer.alloc(40);
  b[0] = 0xff; b[1] = 0xd8;
  b[2] = 0xff; b[3] = 0xe0; b[4] = 0; b[5] = 4;
  b[8] = 0xff; b[9] = 0xc0; b[10] = 0; b[11] = 11; b[12] = 8;
  b.writeUInt16BE(h, 13);
  b.writeUInt16BE(w, 15);
  return b;
}

test('resolveImagePolicy: optimized by default, original on request, quality clamped', () => {
  assert.deepEqual(IMAGE_MODES, ['optimized', 'original']);
  assert.equal(resolveImagePolicy().mode, 'optimized');
  assert.equal(resolveImagePolicy({ mode: ' Original ' }).mode, 'original');
  assert.equal(resolveImagePolicy({ mode: 'bogus' }).mode, 'optimized');
  assert.equal(resolveImagePolicy().quality, 88);
  assert.equal(resolveImagePolicy({ quality: '200' }).quality, 100);
  assert.equal(resolveImagePolicy({ quality: 0 }).quality, 1);
  assert.equal(resolveImagePolicy({ quality: 'x' }).quality, 88);
});

test('the images: line takes a mode and a quality in any order, like the other multi-word registers', () => {
  assert.deepEqual(parseImagesSetting('optimized 90'), { mode: 'optimized', quality: '90', unknown: [] });
  assert.deepEqual(parseImagesSetting('90 Original'), { mode: 'original', quality: '90', unknown: [] });
  assert.deepEqual(parseImagesSetting('original, lossless 0 101'), { mode: 'original', quality: '', unknown: ['lossless', '0', '101'] });
  const p = resolveImagePolicy('optimized 90');
  assert.equal(p.mode, 'optimized');
  assert.equal(p.quality, 90);
  assert.equal(resolveImagePolicy('original').mode, 'original');
  assert.equal(resolveImagePolicy(undefined).quality, 88);
});

test('readImageInfo reads size, format and a PNG alpha hint from the header', () => {
  assert.deepEqual(readImageInfo(png(1179, 1179, 2)), { mime: 'image/png', width: 1179, height: 1179, alpha: false });
  assert.equal(readImageInfo(png(10, 10, 6)).alpha, true);
  const chunk = (name) => [0, 0, 0, 0, ...Buffer.from(name), 0, 0, 0, 0];
  assert.equal(readImageInfo(png(10, 10, 3, chunk('tRNS'))).alpha, true, 'a palette PNG with a tRNS chunk may be transparent');
  assert.equal(readImageInfo(png(10, 10, 3, [...chunk('IDAT'), ...chunk('tRNS')])).alpha, false, 'a tRNS after the first IDAT is not read');
  assert.deepEqual(readImageInfo(jpeg(1920, 1280)), { mime: 'image/jpeg', width: 1920, height: 1280, alpha: false });
  assert.equal(readImageInfo(Buffer.from('GIF89a'.padEnd(40, 'x'))), null);
});

test('planRecode: skips small files, original mode, and tight JPEGs; shrinks the long edge', () => {
  const p = resolveImagePolicy();
  const big = readImageInfo(png(4000, 3000, 2));
  assert.equal(planRecode(big, 100 * 1024, p), null, 'under 150 KB');
  assert.deepEqual(planRecode(big, 5e6, p), { width: 2560, height: 1920, quality: 88, checkAlpha: false, formatChange: true });
  assert.equal(planRecode(big, 5e6, resolveImagePolicy({ mode: 'original' })), null);
  const tight = readImageInfo(jpeg(1920, 1280));
  assert.equal(planRecode(tight, 600 * 1024, p), null, '0.24 bytes per pixel is already tight');
  assert.ok(planRecode(tight, 3e6, p), 'a loose 1920 px JPEG is worth trying');
  assert.equal(planRecode(readImageInfo(jpeg(5000, 3000)), 600 * 1024, p).formatChange, false);
  assert.equal(planRecode(readImageInfo(png(100, 100, 6)), 5e6, p).checkAlpha, true);
});

test('acceptRecode: a format change needs a 30% win, a resize 10%, and never a larger file', () => {
  const p = resolveImagePolicy();
  assert.equal(acceptRecode(1000, 690, { formatChange: true }, p), true);
  assert.equal(acceptRecode(1000, 710, { formatChange: true }, p), false);
  assert.equal(acceptRecode(1000, 890, { formatChange: false }, p), true);
  assert.equal(acceptRecode(1000, 950, { formatChange: false }, p), false);
  assert.equal(acceptRecode(1000, 0, { formatChange: true }, p), false);
});
