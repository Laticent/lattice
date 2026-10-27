// The shared JPEG encoder (lib/core/jpeg-encode.mjs). Node has no JPEG decoder, so these pin the file's structure,
// its determinism and its streaming; the round trip through real decoders (Chromium, Firefox, WebKit) and the
// same-bytes-on-every-engine check are docs/e2e/jpeg-encode-engines.spec.ts, which compares against GOLDEN below.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

const load = () => import('../../../lib/core/jpeg-encode.mjs');

/** A picture with flat areas, gradients, hard edges, noise and some transparency; the e2e spec draws the same one. */
function synthetic(w, h, { alpha = true } = {}) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const n = Math.imul(x, 73856093) ^ Math.imul(y, 19349663);
      px[i] = x < w / 3 ? 200 : (x * 255) / w;
      px[i + 1] = (y * 255) / h;
      px[i + 2] = ((x >> 3) + (y >> 3)) & 1 ? 40 : n & 255;
      px[i + 3] = alpha && y > h * 0.75 ? (x * 255) / w : 255;
    }
  }
  return px;
}

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

// The bytes the encoder writes for synthetic(301, 157) at quality 90. A change here changes every export's JPEGs:
// update it on purpose, and the e2e spec's copy with it.
const GOLDEN = { width: 301, height: 157, quality: 90, sha256: 'c58daad69614db3208e19a5f8fcd8fb61eec1cc601fdc373bd4e4d12bd926f00' };

test('writes a baseline JFIF: SOI, APP0, two DQT, SOF0 4:2:0, DHT, SOS ... EOI', async () => {
  const { encodeJpeg } = await load();
  const jpg = encodeJpeg(synthetic(37, 21), 37, 21, 90);
  assert.deepEqual([...jpg.subarray(0, 2)], [0xff, 0xd8]);
  assert.deepEqual([...jpg.subarray(-2)], [0xff, 0xd9]);
  const markers = [];
  for (let i = 2; i < jpg.length; ) {
    assert.equal(jpg[i], 0xff, `marker expected at ${i}`);
    const m = jpg[i + 1];
    markers.push(m);
    if (m === 0xda) break;
    i += 2 + ((jpg[i + 2] << 8) | jpg[i + 3]);
  }
  assert.deepEqual(markers, [0xe0, 0xdb, 0xc0, 0xc4, 0xda]);
  const sof = jpg.indexOf(0xc0, 2) - 1;
  assert.equal((jpg[sof + 5] << 8) | jpg[sof + 6], 21, 'height');
  assert.equal((jpg[sof + 7] << 8) | jpg[sof + 8], 37, 'width');
  assert.deepEqual([...jpg.subarray(sof + 9, sof + 19)], [3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1], 'Y 2x2, Cb and Cr 1x1');
  // Inside the scan, every 0xFF is stuffed (followed by 0x00) until EOI.
  const sos = jpg.lastIndexOf(0xda, jpg.length) - 1;
  const scan = jpg.subarray(sos + 2 + ((jpg[sos + 2] << 8) | jpg[sos + 3]), -2);
  for (let i = 0; i < scan.length; i++) if (scan[i] === 0xff) assert.equal(scan[i + 1], 0, `unstuffed 0xFF at ${i}`);
});

test('the quantization tables are libjpeg’s at the same quality', async () => {
  const { encodeJpeg } = await load();
  const dqt = (q) => {
    const jpg = encodeJpeg(synthetic(8, 8), 8, 8, q);
    const i = jpg.indexOf(0xdb, 2) + 3;
    return { y: [...jpg.subarray(i + 1, i + 65)], c: [...jpg.subarray(i + 66, i + 130)] };
  };
  // libjpeg at quality 90 (cjpeg -quality 90), zigzag order as written to the file.
  assert.deepEqual(dqt(90).y.slice(0, 8), [3, 2, 2, 3, 2, 2, 3, 3]);
  assert.deepEqual(dqt(90).c.slice(0, 8), [3, 4, 4, 5, 4, 5, 9, 5]);
  assert.ok(dqt(50).y.every((v, i) => v >= dqt(90).y[i]), 'a lower quality never quantizes more finely');
  assert.ok(dqt(1).y.every((v) => v >= 1 && v <= 255) && dqt(100).y.every((v) => v === 1));
});

test('the same pixels give the same bytes however the rows arrive', async () => {
  const { createJpegEncoder, encodeJpeg } = await load();
  const W = 53;
  const H = 47;
  const px = synthetic(W, H);
  const whole = encodeJpeg(px, W, H, 85);
  assert.equal(sha(encodeJpeg(px, W, H, 85)), sha(whole), 'two runs, one file');
  for (const step of [1, 7, 16, 33]) {
    const enc = createJpegEncoder({ width: W, height: H, quality: 85 });
    for (let y = 0; y < H; y += step) {
      const rows = Math.min(step, H - y);
      enc.addRows(px.subarray(y * W * 4, (y + rows) * W * 4), rows);
    }
    assert.equal(sha(enc.finish()), sha(whole), `rows ${step} at a time`);
  }
});

test('transparent pixels land on white, and an opaque white pixel is the same file', async () => {
  const { encodeJpeg } = await load();
  const clear = new Uint8ClampedArray(16 * 16 * 4); // all zero: black, fully transparent
  const white = new Uint8ClampedArray(16 * 16 * 4).fill(255);
  assert.equal(sha(encodeJpeg(clear, 16, 16, 90)), sha(encodeJpeg(white, 16, 16, 90)));
});

test('odd sizes encode, and quality trades size the right way', async () => {
  const { encodeJpeg } = await load();
  for (const [w, h] of [[1, 1], [17, 1], [1, 17], [15, 15], [16, 16], [17, 33]]) {
    const jpg = encodeJpeg(synthetic(w, h), w, h, 90);
    assert.deepEqual([...jpg.subarray(-2)], [0xff, 0xd9], `${w}x${h}`);
  }
  const px = synthetic(200, 120, { alpha: false });
  const sizes = [30, 60, 90, 100].map((q) => encodeJpeg(px, 200, 120, q).length);
  for (let i = 1; i < sizes.length; i++) assert.ok(sizes[i] > sizes[i - 1], `sizes rise with quality: ${sizes}`);
});

test('it refuses what it cannot write', async () => {
  const { createJpegEncoder } = await load();
  assert.throws(() => createJpegEncoder({ width: 0, height: 4, quality: 90 }), RangeError);
  assert.throws(() => createJpegEncoder({ width: 4, height: 4, quality: Number.NaN }), TypeError);
  assert.throws(() => createJpegEncoder({ width: 4, height: 4, quality: null }), TypeError, 'null is not quality 1');
  assert.throws(() => createJpegEncoder({ width: 65501, height: 1, quality: 90 }), RangeError, 'past what decoders read');
  const enc = createJpegEncoder({ width: 4, height: 4, quality: 90 });
  assert.throws(() => enc.addRows(new Uint8Array(4 * 4 * 5), 5), RangeError, 'more rows than the height');
  enc.addRows(new Uint8Array(4 * 2 * 4), 2);
  assert.throws(() => enc.finish(), RangeError, 'finished early');
});

test('createJpegEncoder works from its own source text, as chrome-recode.js sends it into a page', async () => {
  const { createJpegEncoder, encodeJpeg } = await load();
  // biome-ignore lint/security/noGlobalEval: the point of the test is that the source stands alone.
  const fromText = (0, eval)(`(${createJpegEncoder.toString()})`);
  const px = synthetic(40, 30);
  const enc = fromText({ width: 40, height: 30, quality: 90 });
  enc.addRows(px, 30);
  assert.equal(sha(enc.finish()), sha(encodeJpeg(px, 40, 30, 90)));
});

test('golden bytes: the file every engine must write for the reference picture', async () => {
  const { encodeJpeg } = await load();
  const { width, height, quality, sha256 } = GOLDEN;
  assert.equal(sha(encodeJpeg(synthetic(width, height), width, height, quality)), sha256);
});
