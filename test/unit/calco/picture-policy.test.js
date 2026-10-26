/**
 * Unit: the one rule for a slide picture and the policy that steers it (docs/src/lib/calco/picture.ts). The command line and
 * the Studio both call `choosePicture`, so these tests stand in for both: a fake shooter records which shots were taken.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { choosePicture, pictureQuality, PICTURE_FLAT_BYTES, PICTURE_TONE_JPEG_BYTES, PICTURE_JPEG_QUALITY } = require('@laticent/calco');

/** A shooter that hands back byte counts, and records its calls. */
function shooter({ png, jpeg }) {
  const calls = [];
  return {
    calls,
    png: async () => (calls.push('png'), { kind: 'png', n: png }),
    jpeg: async (q) => (calls.push(`jpeg${q}`), jpeg === null ? null : { kind: 'jpeg', n: jpeg }),
    size: (p) => p.n,
  };
}
const pick = async (s, opts, policy) => (await choosePicture(s, opts, policy)).kind;

describe('calco choosePicture', () => {
  test('original is a lossless PNG always, and takes no JPEG', async () => {
    const s = shooter({ png: 5_000_000, jpeg: 100_000 });
    assert.equal(await pick(s, { tone: true }, { mode: 'original' }), 'png');
    assert.deepEqual(s.calls, ['png']);
  });

  test('a picture with transparency is a PNG, since a JPEG would paint it black', async () => {
    const s = shooter({ png: 5_000_000, jpeg: 100_000 });
    assert.equal(await pick(s, { tone: true, opaque: false }, {}), 'png');
    assert.deepEqual(s.calls, ['png']);
  });

  test('a flat slide stays a PNG with no JPEG tried', async () => {
    const s = shooter({ png: PICTURE_FLAT_BYTES - 1, jpeg: 10 });
    assert.equal(await pick(s, { tone: false }, {}), 'png');
    assert.deepEqual(s.calls, ['png']);
  });

  test('a big PNG becomes a JPEG when that is much smaller, and not when it is only a little smaller', async () => {
    assert.equal(await pick(shooter({ png: 3_000_000, jpeg: 500_000 }), { tone: false }, {}), 'jpeg');
    assert.equal(await pick(shooter({ png: 3_000_000, jpeg: 2_500_000 }), { tone: false }, {}), 'png');
  });

  test('a continuous-tone slide is a JPEG first, and a large JPEG never takes the PNG', async () => {
    const s = shooter({ png: 9_000_000, jpeg: PICTURE_TONE_JPEG_BYTES });
    assert.equal(await pick(s, { tone: true }, {}), 'jpeg');
    assert.deepEqual(s.calls, ['jpeg92']);
  });

  test('a small JPEG of a tone slide lets the sizes decide', async () => {
    const s = shooter({ png: 50_000, jpeg: 20_000 });
    assert.equal(await pick(s, { tone: true }, {}), 'png', 'a flat PNG is kept');
    assert.deepEqual(s.calls, ['jpeg92', 'png']);
  });

  test('a host that cannot encode a JPEG gets the PNG', async () => {
    assert.equal(await pick(shooter({ png: 3_000_000, jpeg: null }), { tone: false }, {}), 'png');
  });

  test('the policy quality replaces the default, in 1 to 100', async () => {
    const s = shooter({ png: 3_000_000, jpeg: 500_000 });
    await pick(s, { tone: false }, { mode: 'optimized', quality: 80 });
    assert.deepEqual(s.calls, ['png', 'jpeg80']);
    assert.equal(pictureQuality({ quality: 80 }), 0.8);
    assert.equal(pictureQuality({}), PICTURE_JPEG_QUALITY);
    assert.equal(pictureQuality({ quality: 0 }), PICTURE_JPEG_QUALITY, 'out of range falls back');
    assert.equal(pictureQuality({ quality: 101 }), PICTURE_JPEG_QUALITY);
  });
});
