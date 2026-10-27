/**
 * Unit: the one rule for a picture an Office export writes (lib/core/office-export-policy.js `choosePicture`, `cropRules`, `PICTURE`). The command line and
 * the Studio both call `choosePicture`, so these tests stand in for both: a fake shooter records which shots were taken. Calco holds none of this.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { choosePicture, cropRules, PICTURE } = require('../../../lib/core/office-export-policy.js');

/** A shooter that hands back byte counts, and records its calls. */
function shooter({ png, jpeg }) {
  const calls = [];
  return {
    calls,
    png: async () => {
      calls.push('png');
      return { kind: 'png', n: png };
    },
    jpeg: async (q) => {
      calls.push(`jpeg${q}`);
      return jpeg === null ? null : { kind: 'jpeg', n: jpeg };
    },
    size: (p) => p.n,
  };
}
const pick = async (s, opts, setting) => (await choosePicture(s, opts, setting)).kind;

describe('choosePicture', () => {
  test('original is a lossless PNG always, and takes no JPEG', async () => {
    const s = shooter({ png: 5_000_000, jpeg: 100_000 });
    assert.equal(await pick(s, { tone: true }, 'original'), 'png');
    assert.deepEqual(s.calls, ['png']);
  });

  test('a picture with transparency is a PNG, since a JPEG would paint it black', async () => {
    const s = shooter({ png: 5_000_000, jpeg: 100_000 });
    assert.equal(await pick(s, { tone: true, opaque: false }, {}), 'png');
    assert.deepEqual(s.calls, ['png']);
  });

  test('a flat slide stays a PNG with no JPEG tried; at the threshold it is still flat', async () => {
    for (const n of [PICTURE.flatBytes - 1, PICTURE.flatBytes]) {
      const s = shooter({ png: n, jpeg: 10 });
      assert.equal(await pick(s, { tone: false }, {}), 'png');
      assert.deepEqual(s.calls, ['png']);
    }
  });

  test('a big PNG becomes a JPEG when that is much smaller, and not when it is only a little smaller', async () => {
    assert.equal(await pick(shooter({ png: 3_000_000, jpeg: 500_000 }), { tone: false }, {}), 'jpeg');
    assert.equal(await pick(shooter({ png: 3_000_000, jpeg: 2_500_000 }), { tone: false }, {}), 'png', 'a 17% saving is not worth a lossy picture');
    assert.equal(await pick(shooter({ png: 1_000_000, jpeg: 900_000 }), { tone: false }, {}), 'png');
  });

  test('a continuous-tone slide is a JPEG first, and a large JPEG never takes the PNG', async () => {
    const s = shooter({ png: 9_000_000, jpeg: PICTURE.toneBytes });
    assert.equal(await pick(s, { tone: true }, {}), 'jpeg');
    assert.deepEqual(s.calls, ['jpeg90']);
  });

  test('a small JPEG of a tone slide lets the sizes decide', async () => {
    const s = shooter({ png: 50_000, jpeg: 20_000 });
    assert.equal(await pick(s, { tone: true }, {}), 'png', 'a flat PNG is kept');
    assert.deepEqual(s.calls, ['jpeg90', 'png']);
  });

  test('a tone slide whose JPEG is small still takes a big PNG when the JPEG is much smaller', async () => {
    const s = shooter({ png: PICTURE.flatBytes + 1, jpeg: PICTURE.toneBytes - 1 });
    assert.equal(await pick(s, { tone: true }, {}), 'jpeg', 'the sizes rule decides below the tone threshold');
    assert.deepEqual(s.calls, ['jpeg90', 'png']);
  });

  test('a tone slide whose JPEG is just under the tone threshold and whose PNG is flat keeps the PNG', async () => {
    assert.equal(await pick(shooter({ png: PICTURE.toneBytes, jpeg: PICTURE.toneBytes - 1 }), { tone: true }, {}), 'png');
  });

  test('a host that cannot encode a JPEG gets the PNG, on the tone path too', async () => {
    assert.equal(await pick(shooter({ png: 3_000_000, jpeg: null }), { tone: true }, {}), 'png');
  });

  test('a host that cannot encode a JPEG gets the PNG', async () => {
    assert.equal(await pick(shooter({ png: 3_000_000, jpeg: null }), { tone: false }, {}), 'png');
  });

  test('the policy quality replaces the default, in 1 to 100', async () => {
    const s = shooter({ png: 3_000_000, jpeg: 500_000 });
    await pick(s, { tone: false }, 'optimized 80');
    assert.deepEqual(s.calls, ['png', 'jpeg80']);
  });
});

describe('cropRules', () => {
  test('original is lossless; the default is not, at quality 90 on a canvas scale', () => {
    assert.equal(cropRules('original').lossless, true);
    const d = cropRules({});
    assert.equal(d.lossless, false);
    assert.equal(d.quality, 0.9);
    assert.deepEqual([d.toneBytes, d.flatBytes, d.share], [PICTURE.toneBytes, PICTURE.flatBytes, PICTURE.share]);
    assert.equal(cropRules('optimized 80').quality, 0.8);
  });

  test('names the shared picture writer only when the host installed it', () => {
    const { PICTURE_WRITER } = require('../../../lib/core/office-export-policy.js');
    assert.equal(cropRules({}).encoder, undefined, 'no writer on the page: Calco keeps its own encoders');
    assert.equal(cropRules({}, { writer: true }).encoder, PICTURE_WRITER);
    assert.equal(cropRules('original', { writer: true }).encoder, PICTURE_WRITER, 'lossless crops are PNGs from the same writer');
  });
});
