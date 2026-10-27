/**
 * Unit: the CLI's choice between a PNG and a JPEG for one slide (lib/export/slide-picture.js).
 * A fake element handle stands in for puppeteer, so what is tested is the decision: which shot
 * is taken first, whether a second one is taken at all, and which of the two is kept. The order
 * is the cost (a PNG of a photograph is about 1.2 s, its JPEG 0.36 s).
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { shootPicture } = require('../../../lib/export/slide-picture');

const PNG = (n) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(n)]);
const JPEG = (n) => Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(n)]);
const KB = 1024;
/** `tone`: what the page says about the slide (`isContinuousTone`). */
function handle({ png, jpeg, tone = false }) {
  const calls = [];
  return {
    calls,
    async evaluate() {
      calls.push({ type: 'evaluate' });
      return tone;
    },
    async screenshot(opts) {
      calls.push(opts);
      return opts.type === 'jpeg' ? JPEG(jpeg) : PNG(png);
    },
  };
}
const isJpeg = (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8;
const shots = (h) => h.calls.filter((c) => c.type !== 'evaluate').map((c) => c.type);

describe('shootPicture — a flat slide (the page says no continuous tone)', () => {
  test('stays a PNG, and no JPEG is shot', async () => {
    const h = handle({ png: 200 * KB, jpeg: 250 * KB });
    const out = await shootPicture(h, { type: 'png' });
    assert.equal(isJpeg(out), false);
    assert.deepEqual(shots(h), ['png']);
  });

  test('a big PNG gets a JPEG to compare, and the JPEG wins only when clearly smaller', async () => {
    const win = handle({ png: 3_000_000, jpeg: 300 * KB });
    assert.equal(isJpeg(await shootPicture(win, { type: 'png' })), true);
    assert.deepEqual(shots(win), ['png', 'jpeg']);
    assert.equal(isJpeg(await shootPicture(handle({ png: 1_000_000, jpeg: 900_000 }), { type: 'png' })), false);
  });
});

describe('shootPicture — a continuous-tone slide (a photograph, a wash)', () => {
  test('is a JPEG first, at quality 90, the shared picture quality, and the slow PNG is never shot when the JPEG is large', async () => {
    const h = handle({ png: 3_000_000, jpeg: 400 * KB, tone: true });
    const out = await shootPicture(h, { type: 'png' });
    assert.equal(isJpeg(out), true);
    assert.deepEqual(shots(h), ['jpeg']);
    assert.equal(h.calls.find((c) => c.type === 'jpeg').quality, 90);
  });

  test('a small JPEG means it was nearly flat after all: the PNG is shot and the sizes decide', async () => {
    const flat = handle({ png: 80 * KB, jpeg: 60 * KB, tone: true });
    assert.equal(isJpeg(await shootPicture(flat, { type: 'png' })), false, 'a small PNG is kept, lossless');
    assert.deepEqual(shots(flat), ['jpeg', 'png']);
    const heavy = handle({ png: 2_000_000, jpeg: 90 * KB, tone: true });
    assert.equal(isJpeg(await shootPicture(heavy, { type: 'png' })), true, 'a big PNG still loses to a small JPEG');
  });
});

test('a capture that keeps a rounded corner as transparency is never a JPEG, and is not even asked about', async () => {
  const h = handle({ png: 3_000_000, jpeg: 300 * KB, tone: true });
  const out = await shootPicture(h, { type: 'png', omitBackground: true });
  assert.equal(isJpeg(out), false);
  assert.deepEqual(h.calls.map((c) => c.type), ['png']);
});
