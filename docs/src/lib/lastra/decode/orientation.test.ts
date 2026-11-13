// @vitest-environment node
/**
 * applyOrientation against an independent statement of the eight EXIF orientations: each is built
 * here from three plain moves on a grid of pixel ids (mirror the columns, reverse the rows, transpose).
 */

import { describe, expect, test } from 'vitest';
import { applyOrientation, type DecodedImage } from './index.js';

type Grid = number[][];
const mirror = (g: Grid): Grid => g.map((row) => [...row].reverse());
const flip = (g: Grid): Grid => [...g].reverse();
const transpose = (g: Grid): Grid => g[0].map((_, x) => g.map((row) => row[x]));

/** What the camera meant, per orientation tag (TIFF 6.0 / EXIF 2.3 Orientation). */
const UPRIGHT: Record<number, (g: Grid) => Grid> = {
  1: (g) => g,
  2: mirror,
  3: (g) => flip(mirror(g)),
  4: flip,
  5: transpose,
  6: (g) => mirror(transpose(g)), // 90 degrees clockwise
  7: (g) => flip(mirror(transpose(g))),
  8: (g) => flip(transpose(g)), // 90 degrees counter-clockwise
};

function image(g: Grid): DecodedImage {
  const height = g.length;
  const width = g[0].length;
  const data = new Uint8ClampedArray(width * height * 4);
  g.flat().forEach((id, i) => {
    data.set([id, id * 2, id * 3, 255 - id], i * 4);
  });
  return { width, height, data };
}

function grid(img: DecodedImage): Grid {
  const out: Grid = [];
  for (let y = 0; y < img.height; y++) {
    const row: number[] = [];
    for (let x = 0; x < img.width; x++) {
      const o = (y * img.width + x) * 4;
      expect([img.data[o + 1], img.data[o + 2], img.data[o + 3]]).toEqual([img.data[o] * 2, img.data[o] * 3, 255 - img.data[o]]);
      row.push(img.data[o]);
    }
    out.push(row);
  }
  return out;
}

describe('applyOrientation', () => {
  const source: Grid = [
    [1, 2, 3, 4],
    [5, 6, 7, 8],
    [9, 10, 11, 12],
  ];
  for (let o = 1; o <= 8; o++) {
    test(`orientation ${o}`, () => {
      const out = applyOrientation(image(source), o);
      const want = UPRIGHT[o](source);
      expect([out.width, out.height]).toEqual([want[0].length, want.length]);
      expect(grid(out)).toEqual(want);
    });
  }

  test('6 and 8 undo each other; 3 twice is the identity', () => {
    const img = image(source);
    expect(grid(applyOrientation(applyOrientation(img, 6), 8))).toEqual(source);
    expect(grid(applyOrientation(applyOrientation(img, 3), 3))).toEqual(source);
  });

  test('a value outside 1 to 8 returns the image unchanged', () => {
    const img = image(source);
    for (const o of [0, 9, -1, 2.5, Number.NaN]) expect(applyOrientation(img, o)).toBe(img);
  });

  test('a view into a larger buffer at an odd offset', () => {
    const img = image(source);
    const backing = new Uint8ClampedArray(img.data.length + 3);
    backing.set(img.data, 3);
    const view = { ...img, data: backing.subarray(3) };
    expect(grid(applyOrientation(view, 6))).toEqual(UPRIGHT[6](source));
  });
});
