// The shared EXIF Orientation reader: image-dimensions.js (build-time aspect) and the PDF
// writer (lib/core/pdf-compose, which keeps a rotated JPEG in the photo) both call it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SAMPLES = path.resolve(__dirname, '../../../lib/samples');
let mod;
test.before(async () => { mod = await import('../../../lib/core/exif-orientation.mjs'); });

function jpegWithOrientation(orientation, little = false) {
  const u16 = (v) => { const b = Buffer.alloc(2); if (little) b.writeUInt16LE(v); else b.writeUInt16BE(v); return b; };
  const u32 = (v) => { const b = Buffer.alloc(4); if (little) b.writeUInt32LE(v); else b.writeUInt32BE(v); return b; };
  const tiff = Buffer.concat([Buffer.from(little ? 'II' : 'MM', 'ascii'), u16(42), u32(8), u16(1), u16(0x0112), u16(3), u32(1), u16(orientation), u16(0), u32(0)]);
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
  const len = Buffer.alloc(2); len.writeUInt16BE(payload.length + 2);
  const sof = Buffer.alloc(19); sof[0] = 0xff; sof[1] = 0xc0; sof.writeUInt16BE(17, 2); sof[4] = 8;
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), len, payload, sof]);
}

test('jpegOrientation reads the tag in both byte orders, as a Buffer or a bare Uint8Array', () => {
  for (const o of [1, 3, 6, 8]) {
    assert.equal(mod.jpegOrientation(jpegWithOrientation(o)), o);
    assert.equal(mod.jpegOrientation(jpegWithOrientation(o, true)), o);
    assert.equal(mod.jpegOrientation(new Uint8Array(jpegWithOrientation(o))), o, 'no Buffer methods are needed');
  }
});

test('jpegOrientation answers 1 for no tag, an out-of-range tag, a PNG and a truncated file', () => {
  assert.equal(mod.jpegOrientation(jpegWithOrientation(9)), 1);
  assert.equal(mod.jpegOrientation(jpegWithOrientation(0)), 1);
  assert.equal(mod.jpegOrientation(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])), 1);
  assert.equal(mod.jpegOrientation(jpegWithOrientation(6).subarray(0, 12)), 1);
  assert.equal(mod.jpegOrientation(fs.readFileSync(path.join(SAMPLES, 'photo-tall.jpg'))), 1, 'a sample with no Exif is upright');
});

test('the shipped rotated sample carries Orientation 6', () => {
  assert.equal(mod.jpegOrientation(fs.readFileSync(path.join(SAMPLES, 'photo-tall-rotated.jpg'))), 6);
});
