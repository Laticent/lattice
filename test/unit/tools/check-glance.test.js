/**
 * Unit: tools/check-glance.js — the optics and the mark measurement, on synthetic slides.
 *
 * No browser: the page side only finds boxes, and every judgment the tool makes is the pure
 * functions below. The load-bearing case is the third: a pale pill held off the slide by a
 * dark 2px border must PASS as painted and FAIL once the back-row blur dissolves that border,
 * because that is exactly the mark every static contrast gate passes and a hall cannot see.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { PNG } = require('pngjs');
const {
  sigmaFor, arcminPerPx, applyFlare, gaussianBlur, toLinearPlanes, measureMark, closestPair, ROOMS, VIEWERS, BACK_ROW_FLOOR,
} = require('../../../tools/check-glance.js');
const { VENUE_BACK_ROW } = require('../../../lib/core/resolve-venue.js');

const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
/** A w×h slide in `bg` with filled rectangles painted in order: [x, y, w, h, hex]. */
function slide(w, h, bg, rects) {
  const png = new PNG({ width: w, height: h });
  const paint = (x0, y0, rw, rh, hex) => {
    const c = hexRgb(hex);
    for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) {
      const i = (y * w + x) * 4; png.data[i] = c[0]; png.data[i + 1] = c[1]; png.data[i + 2] = c[2]; png.data[i + 3] = 255;
    }
  };
  paint(0, 0, w, h, bg);
  for (const r of rects) paint(...r);
  return toLinearPlanes(png);
}

describe('check-glance optics', () => {
  test('the blur grows with the venue: the back row of a hall blurs more than a laptop', () => {
    const laptop = sigmaFor(VIEWERS['back-row'], VENUE_BACK_ROW.laptop);
    const hall = sigmaFor(VIEWERS['back-row'], VENUE_BACK_ROW.hall);
    assert.ok(hall > laptop * 2, `hall ${hall} vs laptop ${laptop}`);
    // one 720px-slide pixel at 8 screen-heights is 3438 / 5760 arcminutes
    assert.equal(arcminPerPx(8).toFixed(4), (3438 / 5760).toFixed(4));
    // a 20/40 viewer (2 arcmin) at the hall back row: FWHM 2 / 0.5969 px, sigma = FWHM / 2.355
    assert.equal(hall.toFixed(3), (2 / (3438 / 5760) / 2.355).toFixed(3));
  });

  test('the washout lifts black and keeps white', () => {
    const [p] = applyFlare([new Float32Array([0, 1])], ROOMS.lit);
    assert.equal(p[1], 1);
    assert.ok(Math.abs(p[0] - ROOMS.lit / (1 + ROOMS.lit)) < 1e-6);
    assert.equal(applyFlare([new Float32Array([0])], ROOMS.none)[0][0], 0, 'room "none" leaves the slide alone');
  });

  test('the blur conserves light (a uniform slide is unchanged)', () => {
    const planes = slide(40, 30, '#808080', []);
    const out = gaussianBlur(planes, 40, 30, 3);
    for (let i = 0; i < out[0].length; i++) assert.ok(Math.abs(out[0][i] - planes[0][i]) < 1e-5);
  });
});

describe('check-glance mark measurement', () => {
  const W = 200, H = 80, BG = '#FFFFFF';
  const PILL = { x: 70, y: 30, w: 60, h: 18 };

  test('a deep solid pill separates from the slide, painted or blurred', () => {
    const planes = slide(W, H, BG, [[PILL.x, PILL.y, PILL.w, PILL.h, '#1C5000']]);
    assert.ok(measureMark(planes, W, H, PILL).sep > 7);
    const hall = gaussianBlur(planes, W, H, sigmaFor(VIEWERS['back-row'], VENUE_BACK_ROW.hall) * 1.5);
    assert.ok(measureMark(hall, W, H, PILL).sep >= BACK_ROW_FLOOR);
  });

  test('a pale pill held off by a 2px border passes as painted and FAILS once the border blurs away', () => {
    const planes = slide(W, H, BG, [
      [PILL.x, PILL.y, PILL.w, PILL.h, '#7A5600'],                       // the 2px border
      [PILL.x + 2, PILL.y + 2, PILL.w - 4, PILL.h - 4, '#F7E3B0'],       // the pale fill inside it
    ]);
    const painted = measureMark(planes, W, H, PILL);
    assert.ok(painted.sep >= BACK_ROW_FLOOR, `painted, the border carries it: ${painted.sep}`);
    const fill = measureMark(planes, W, H, PILL).fill;
    assert.ok(fill.toLowerCase() === '#f7e3b0', `the fill is sampled from the middle, not the border: ${fill}`);
    const squint = gaussianBlur(planes, W, H, sigmaFor(VIEWERS.squint, VENUE_BACK_ROW.hall));
    const seen = measureMark(squint, W, H, PILL);
    assert.ok(seen.sep < BACK_ROW_FLOOR, `blurred, the border is gone and the pale fill is all that is left: ${seen.sep}`);
  });

  test('closestPair names the two statuses whose fills are nearest', () => {
    const pair = closestPair([
      { key: 'pass', m: { fill: '#1C5000' } },
      { key: 'warn', m: { fill: '#8A5D00' } },
      { key: 'fail', m: { fill: '#8A5A05' } },
      { key: 'fail', m: { fill: '#000000' } }, // a second mark of a status already seen is not a new key
    ]);
    assert.deepEqual([pair.a, pair.b].sort(), ['fail', 'warn']);
    assert.ok(pair.d < 0.02);
  });
});
