// @vitest-environment node
// resize.ts: Lanczos-3 on RGBA. The slide camera's use of it (strips read off a canvas) is pinned in Lattice's
// test/unit/core/slide-camera-resample.test.js; these pin the filter itself.
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { lanczosResize, lanczosWeights } from './resize.js';

test('lanczosResize: a flat color stays exactly that color, at the size asked for', () => {
  const sw = 97;
  const sh = 61;
  const src = new Uint8ClampedArray(sw * sh * 4);
  for (let i = 0; i < src.length; i += 4) src.set([200, 120, 40, 255], i);
  const out = lanczosResize(src, sw, sh, 30, 19);
  assert.equal(out.length, 30 * 19 * 4);
  for (let i = 0; i < out.length; i += 4) assert.deepEqual([...out.subarray(i, i + 4)], [200, 120, 40, 255]);
});

test('lanczosResize: a transparent pixel lends no color (no dark halo at a transparent edge)', () => {
  const sw = 80;
  const sh = 8;
  const src = new Uint8ClampedArray(sw * sh * 4);
  // Left half opaque white, right half transparent BLACK: a premultiplied filter keeps the edge white, a naive one grays it.
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw / 2; x++) src.set([255, 255, 255, 255], (y * sw + x) * 4);
  const out = lanczosResize(src, sw, sh, 20, 2);
  for (let x = 0; x < 20; x++) {
    const p = x * 4;
    if (out[p + 3] > 8) assert.ok(out[p] >= 250, `column ${x}: ${out[p]} with alpha ${out[p + 3]}`);
  }
});

test('lanczosResize: read in strips, it writes the same bytes as from the whole array', () => {
  const sw = 123;
  const sh = 157;
  const src = new Uint8ClampedArray(sw * sh * 4);
  let seed = 7;
  for (let i = 0; i < src.length; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    src[i] = i % 4 === 3 ? 255 : seed >>> 24;
  }
  const whole = lanczosResize(src, sw, sh, 41, 52);
  let reads = 0;
  const strips = lanczosResize(
    (y, n) => {
      reads++;
      return src.subarray(y * sw * 4, (y + n) * sw * 4);
    },
    sw,
    sh,
    41,
    52,
    16,
  );
  assert.deepEqual([...strips], [...whole]);
  assert.ok(reads >= Math.ceil(sh / 16), 'the source was read in strips');
});

test('lanczosResize: a fine stripe pattern averages out instead of aliasing', () => {
  const sw = 400;
  const sh = 4;
  const src = new Uint8ClampedArray(sw * sh * 4);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) src.set(x % 2 ? [255, 255, 255, 255] : [0, 0, 0, 255], (y * sw + x) * 4);
  // 1-pixel stripes shrunk 5 times are a flat mid-gray; a nearest or bilinear shrink would keep stripes or beat patterns.
  const out = lanczosResize(src, sw, sh, 80, 1);
  for (let x = 2; x < 78; x++) assert.ok(Math.abs(out[x * 4] - 127.5) <= 3, `column ${x}: ${out[x * 4]}`);
});

test('lanczosWeights: every output tap sums to one and stays inside the source', () => {
  for (const [src, dst] of [[4032, 552], [100, 100], [7, 3], [3, 7], [1, 1]]) {
    const taps = lanczosWeights(src, dst);
    assert.equal(taps.length, dst);
    for (const { first, w } of taps) {
      assert.ok(first >= 0 && first + w.length <= src, `${src}->${dst}: taps inside the source`);
      const sum = w.reduce((a, v) => a + v, 0);
      assert.ok(Math.abs(sum - 1) < 1e-5, `${src}->${dst}: weights sum to ${sum}`);
    }
  }
});
