// @vitest-environment node
/**
 * decodePng on hand-built inputs: each refusal and its code, the limits checked before allocation, and
 * the hostile shapes from the design note §4 (a decompression bomb, a header that lies about its size).
 */

import { describe, expect, test } from 'vitest';
import { decodePng, isLastraError, type LastraErrorCode, type WorkMeter } from './index.js';
import { chunk, concat, deflateSync, ihdr, PNG_SIGNATURE, rawRows, rgbPng } from './test-support.js';

async function refusal(bytes: Uint8Array, opts?: Parameters<typeof decodePng>[1]): Promise<LastraErrorCode> {
  try {
    await decodePng(bytes, opts);
  } catch (e) {
    if (isLastraError(e)) return e.code;
    throw e;
  }
  throw new Error('decoded, expected a refusal');
}

const iend = chunk('IEND');
const idat = (raw: Uint8Array) => chunk('IDAT', deflateSync(raw));

describe('decodePng refuses with a typed code', () => {
  test('not a PNG, or too short to tell', async () => {
    expect(await refusal(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9]))).toBe('bad-marker');
    expect(await refusal(PNG_SIGNATURE.subarray(0, 5))).toBe('truncated');
    expect(await refusal(new Uint8Array(0))).toBe('truncated');
  });

  test('the first chunk is not IHDR', async () => {
    expect(await refusal(concat(PNG_SIGNATURE, idat(rawRows(1, 1, 3)), ihdr(1, 1), iend))).toBe('bad-marker');
  });

  test('a chunk type that is not four letters, or a length over 2^31 - 1', async () => {
    const bad = rgbPng(2, 2);
    bad[12] = 0x31;
    expect(await refusal(bad)).toBe('bad-marker');
    const huge = rgbPng(2, 2);
    huge.set([0x80, 0, 0, 0], 33);
    expect(await refusal(huge)).toBe('bad-marker');
  });

  test('a bad CRC on a critical chunk', async () => {
    const png = rgbPng(3, 2);
    png[29] ^= 1; // IHDR's CRC
    expect(await refusal(png)).toBe('crc');
    const raw = rawRows(3, 2, 3);
    const z = deflateSync(raw);
    const badIdat = concat(PNG_SIGNATURE, ihdr(3, 2), chunk('IDAT', z, 0x12345678), iend);
    expect(await refusal(badIdat)).toBe('crc');
  });

  test('a bad CRC on tRNS drops the chunk, as libpng does', async () => {
    const trns = chunk('tRNS', [0, 7, 0, 7, 0, 7], 0);
    const img = await decodePng(rgbPng(2, 2, { extra: [trns] }));
    expect(Array.from(img.data.subarray(0, 4))).toEqual([7, 7, 7, 255]);
    const good = await decodePng(rgbPng(2, 2, { extra: [chunk('tRNS', [0, 7, 0, 7, 0, 7])] }));
    expect(Array.from(good.data.subarray(0, 4))).toEqual([7, 7, 7, 0]);
  });

  test('the file ends inside a chunk, or before any image data', async () => {
    const png = rgbPng(4, 4);
    for (const cut of [10, 20, 33, png.length - 13, png.length - 5]) expect(await refusal(png.subarray(0, cut))).toBe('truncated');
    expect(await refusal(concat(PNG_SIGNATURE, ihdr(4, 4)))).toBe('truncated');
    expect(await refusal(concat(PNG_SIGNATURE, ihdr(4, 4), iend))).toBe('corrupt');
  });

  test('a missing IEND after complete image data still decodes, as libpng and Pillow do', async () => {
    const png = rgbPng(4, 4);
    const img = await decodePng(png.subarray(0, png.length - 12));
    expect(img.width).toBe(4);
  });

  test('impossible headers', async () => {
    const make = (w: number, h: number, depth: number, ct: number, il = 0) => concat(PNG_SIGNATURE, ihdr(w, h, depth, ct, il), idat(rawRows(1, 1, 3)), iend);
    expect(await refusal(make(0, 4, 8, 2))).toBe('corrupt');
    expect(await refusal(make(4, 0, 8, 2))).toBe('corrupt');
    expect(await refusal(make(4, 4, 8, 1))).toBe('corrupt'); // color type 1 does not exist
    expect(await refusal(make(4, 4, 4, 2))).toBe('corrupt'); // RGB has no 4-bit depth
    expect(await refusal(make(4, 4, 16, 3))).toBe('corrupt'); // palette has no 16-bit depth
    expect(await refusal(make(4, 4, 8, 2, 2))).toBe('unsupported'); // interlace method 2
    const ihdrShort = chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0]);
    expect(await refusal(concat(PNG_SIGNATURE, ihdrShort, iend))).toBe('bad-marker');
  });

  test('a palette image with no PLTE, and a PLTE of the wrong length', async () => {
    const raw = rawRows(2, 2, 1, 0, 0);
    expect(await refusal(concat(PNG_SIGNATURE, ihdr(2, 2, 8, 3), idat(raw), iend))).toBe('corrupt');
    expect(await refusal(concat(PNG_SIGNATURE, ihdr(2, 2, 8, 3), chunk('PLTE', [1, 2, 3, 4]), idat(raw), iend))).toBe('corrupt');
  });

  test('a bad filter byte', async () => {
    expect(await refusal(rgbPng(2, 2, { raw: rawRows(2, 2, 3, 5) }))).toBe('corrupt');
  });

  test('IDAT chunks that are not consecutive', async () => {
    const z = deflateSync(rawRows(4, 4, 3));
    const half = z.length >> 1;
    const png = concat(PNG_SIGNATURE, ihdr(4, 4), chunk('IDAT', z.subarray(0, half)), chunk('tEXt', [65, 0, 66]), chunk('IDAT', z.subarray(half)), iend);
    expect(await refusal(png)).toBe('corrupt');
  });

  test('an unknown critical chunk', async () => {
    expect(await refusal(rgbPng(2, 2, { extra: [chunk('ZZZZ', [1])] }))).toBe('unsupported');
    // An unknown ANCILLARY chunk (lowercase first letter) is skipped.
    expect((await decodePng(rgbPng(2, 2, { extra: [chunk('zzZZ', [1])] }))).width).toBe(2);
  });

  test('image data that inflates short, inflates long, or does not inflate', async () => {
    expect(await refusal(rgbPng(4, 4, { raw: rawRows(4, 3, 3) }))).toBe('truncated');
    expect(await refusal(rgbPng(4, 4, { raw: rawRows(4, 5, 3) }))).toBe('corrupt');
    const garbage = concat(PNG_SIGNATURE, ihdr(4, 4), chunk('IDAT', [0x78, 0x9c, 0xff, 0xff, 0xff, 0xff]), iend);
    expect(await refusal(garbage)).toBe('corrupt');
    const z = deflateSync(rawRows(4, 4, 3));
    z[z.length - 1] ^= 0xff; // Adler-32
    expect(await refusal(concat(PNG_SIGNATURE, ihdr(4, 4), chunk('IDAT', z), iend))).toBe('corrupt');
  });
});

describe('decodePng limits come before allocation', () => {
  test('a header that declares 2^31 - 1 squared pixels is refused on the header alone', async () => {
    const meter: WorkMeter = { steps: 0 };
    const png = concat(PNG_SIGNATURE, ihdr(0x7fffffff, 0x7fffffff), idat(rawRows(1, 1, 3)), iend);
    expect(await refusal(png, { meter })).toBe('too-large');
    expect(meter.steps).toBe(1); // one step, the IHDR chunk: nothing inflated, nothing allocated
  });

  test('maxPixels and maxBytes', async () => {
    const png = rgbPng(10, 10);
    expect(await refusal(png, { maxPixels: 99 })).toBe('too-large');
    expect((await decodePng(png, { maxPixels: 100 })).width).toBe(10);
    expect(await refusal(png, { maxBytes: png.length - 1 })).toBe('too-large');
    await expect(decodePng(png, { maxPixels: 0 })).rejects.toThrow(TypeError);
    await expect(decodePng([1, 2] as unknown as Uint8Array)).rejects.toThrow(TypeError);
  });

  test('a decompression bomb stops at the declared size', async () => {
    // 64 MB of zeros deflates to about 64 KB; the header says 16 x 16.
    const bomb = deflateSync(new Uint8Array(64 * 1024 * 1024));
    const meter: WorkMeter = { steps: 0 };
    const png = concat(PNG_SIGNATURE, ihdr(16, 16), chunk('IDAT', bomb), iend);
    expect(await refusal(png, { meter })).toBe('corrupt');
    // Work is counted per 4 KB of output: well under the 16,384 steps the whole bomb would cost.
    expect(meter.steps).toBeLessThan(400);
  });

  test('the work meter refuses once its limit is passed', async () => {
    const png = rgbPng(64, 64);
    const meter: WorkMeter = { steps: 0, limit: 10 };
    expect(await refusal(png, { meter })).toBe('too-large');
  });
});

describe('decodePng reads what browsers read', () => {
  test('a 16-bit sample keeps its high byte; a 16-bit tRNS key matches the full sample', async () => {
    const raw = Uint8Array.from([0, 0x12, 0x34, 0xab, 0xcd]);
    const png = concat(PNG_SIGNATURE, ihdr(2, 1, 16, 0), chunk('tRNS', [0xab, 0xcd]), idat(raw), iend);
    const img = await decodePng(png);
    expect(Array.from(img.data)).toEqual([0x12, 0x12, 0x12, 255, 0xab, 0xab, 0xab, 0]);
  });

  test('a palette index past PLTE is opaque black', async () => {
    const png = concat(PNG_SIGNATURE, ihdr(2, 1, 8, 3), chunk('PLTE', [9, 8, 7]), chunk('tRNS', [100]), idat(Uint8Array.from([0, 0, 1])), iend);
    const img = await decodePng(png);
    expect(Array.from(img.data)).toEqual([9, 8, 7, 100, 0, 0, 0, 255]);
  });

  test('ancillary chunks after IEND are ignored', async () => {
    const img = await decodePng(concat(rgbPng(2, 2), chunk('IDAT', [1, 2, 3])));
    expect(img.width).toBe(2);
  });

  test('input backed by a SharedArrayBuffer decodes the same', async () => {
    const png = rgbPng(5, 3);
    const shared = new Uint8Array(new SharedArrayBuffer(png.length));
    shared.set(png);
    expect(Array.from((await decodePng(shared)).data)).toEqual(Array.from((await decodePng(png)).data));
  });
});
