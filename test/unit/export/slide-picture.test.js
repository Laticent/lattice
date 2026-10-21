/**
 * Unit: the CLI's choice between a PNG and a JPEG for one slide (lib/export/slide-picture.js).
 * A fake element handle stands in for puppeteer, so what is tested is the decision: when a
 * second, JPEG screenshot is taken at all, and which of the two is kept.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { shootPicture } = require('../../../lib/export/slide-picture');

const PNG = (n) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(n)]);
const JPEG = (n) => Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(n)]);
function handle({ png, jpeg }) {
  const calls = [];
  return {
    calls,
    async screenshot(opts) {
      calls.push(opts);
      return opts.type === 'jpeg' ? JPEG(jpeg) : PNG(png);
    },
  };
}
const isJpeg = (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8;

describe('shootPicture', () => {
  test('a flat slide stays a PNG and no JPEG is shot', async () => {
    const h = handle({ png: 200 * 1024, jpeg: 50 * 1024 });
    const out = await shootPicture(h, { type: 'png' });
    assert.equal(isJpeg(out), false);
    assert.equal(h.calls.length, 1);
  });

  test('a photographic slide becomes a JPEG when that is much smaller, at quality 92', async () => {
    const h = handle({ png: 3_000_000, jpeg: 300_000 });
    const out = await shootPicture(h, { type: 'png' });
    assert.equal(isJpeg(out), true);
    assert.equal(h.calls.length, 2);
    assert.equal(h.calls[1].type, 'jpeg');
    assert.equal(h.calls[1].quality, 92);
  });

  test('a big PNG whose JPEG is not clearly smaller stays a PNG', async () => {
    const out = await shootPicture(handle({ png: 1_000_000, jpeg: 900_000 }), { type: 'png' });
    assert.equal(isJpeg(out), false);
  });

  test('a capture that keeps a rounded corner as transparency is never a JPEG', async () => {
    const h = handle({ png: 3_000_000, jpeg: 300_000 });
    const out = await shootPicture(h, { type: 'png', omitBackground: true });
    assert.equal(isJpeg(out), false);
    assert.equal(h.calls.length, 1, 'no second shot: a JPEG would paint the corner black');
  });
});
