// @vitest-environment node
/**
 * The oracle (engineering/decisions/2026-11-13-image-library.md §4): every committed fixture decodes to
 * the expected pixels.
 *
 * PNG is lossless, so the floor is an exact match with the ground truth the corpus encoder was given.
 * JPEG's floor is an exact match with Pillow's decode (libjpeg-turbo, recorded in expected.json), the
 * measured result on every file of every mode: max difference 0, PSNR infinite. lastra transcribes
 * libjpeg-turbo's default IDCT, upsampling and color tables (jpeg-idct.ts, jpeg-sample.ts) precisely so
 * that it can hold this floor; a looser one would let an off-by-one in a rounding constant through.
 */

import { describe, expect, test } from 'vitest';
import { decodeJpeg, decodeJpegSync, decodePng } from './index.js';
import { expected, fixture, sha256 } from './test-support.js';

describe('PNG corpus: exact ground truth', () => {
  for (const [name, want] of Object.entries(expected.png)) {
    test(name, async () => {
      const img = await decodePng(fixture('png', name));
      expect([img.width, img.height]).toEqual([want.width, want.height]);
      expect(img.data.length).toBe(want.width * want.height * 4);
      expect(sha256(img.data)).toBe(want.rgbaSha256);
    });
  }
});

describe('JPEG corpus: exact match with libjpeg-turbo via Pillow', () => {
  for (const [name, want] of Object.entries(expected.jpeg)) {
    test(`${name} (${want.pillowMode})`, async () => {
      const bytes = fixture('jpeg', name);
      const img = await decodeJpeg(bytes);
      expect([img.width, img.height]).toEqual([want.width, want.height]);
      expect(sha256(img.data)).toBe(want.rgbaSha256);
    });
  }

  test('decodeJpegSync gives the same pixels as decodeJpeg', async () => {
    const bytes = fixture('jpeg', 'mid-prog-420-q75.jpg');
    expect(sha256(decodeJpegSync(bytes).data)).toBe(sha256((await decodeJpeg(bytes)).data));
  });
});

test('the corpus covers every mode the decoders claim', () => {
  const jpeg = Object.keys(expected.jpeg).join(' ');
  for (const mode of ['base-444', 'base-422', 'base-420', 'base-440', 'base-411', 'prog-444', 'prog-422', 'prog-420', 'prog-440', 'gray-base', 'gray-prog', 'restart', 'cmyk', 'ycck', 'rgb-adobe0', 'no-dht', 'q30', 'q95', 'one-', 'odd-', 'big-'])
    expect(jpeg).toContain(mode);
  const png = Object.keys(expected.png);
  for (const ct of [0, 2, 3, 4, 6]) {
    for (const d of { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] }[ct] as number[]) {
      expect(png).toContain(`ct${ct}-d${d}.png`);
      expect(png).toContain(`ct${ct}-d${d}-adam7.png`);
    }
  }
});
