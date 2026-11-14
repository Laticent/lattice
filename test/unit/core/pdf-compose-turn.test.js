/**
 * compose.mjs `drawableTurned`: when the PDF writer may draw a picture stored turned from its own bytes, through its
 * turn, instead of leaving it in the slide's photo. The quarter-turn side check guards a browser that did not turn the
 * picture (Firefox for an Exif after an XMP block, WebKit for a PNG's eXIf), which the CLI's Chromium never shows, so
 * it is held here. The integration side is test/integration/export/export-formats.test.js.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../../../lib/core/pdf-compose/compose.mjs');
const { resolveImagePolicy } = require('../../../lib/core/image-policy.js');

const OPTIMIZED = resolveImagePolicy({});
const ORIGINAL = resolveImagePolicy({ mode: 'original' });
/** A small, tight orientation-6 JPEG stored 2400 x 1600: the policy would keep it as it is were it upright. */
const info6 = { format: 'jpeg', mime: 'image/jpeg', width: 2400, height: 1600, alpha: false, orientation: 6 };
const small = { type: 'jpeg', bytes: new Uint8Array(80 * 1024), agreed: true };
const turnedImg = { kind: 'img', orient: 'from-image', natural: [1600, 2400] };

test('a small turned JPEG on an <img> the browser turned is drawn through its turn', async () => {
  const { drawableTurned } = await load();
  assert.equal(drawableTurned(turnedImg, small, info6, OPTIMIZED), true);
});

test('a quarter turn the browser did not apply (its sides not swapped) stays in the photo', async () => {
  const { drawableTurned } = await load();
  assert.equal(drawableTurned({ ...turnedImg, natural: [2400, 1600] }, small, info6, OPTIMIZED), false);
  assert.equal(drawableTurned({ ...turnedImg, natural: null }, small, info6, OPTIMIZED), false, 'no laid-out size to check');
  // A half turn or a mirror leaves the sides as they are, so they are not checked.
  assert.equal(drawableTurned({ ...turnedImg, natural: [2400, 1600] }, small, { ...info6, orientation: 3 }, OPTIMIZED), true);
});

test('a turn one engine skips, a background, an orientation-none picture or a PNG stays in the photo', async () => {
  const { drawableTurned } = await load();
  assert.equal(drawableTurned(turnedImg, { ...small, agreed: false }, info6, OPTIMIZED), false, 'an Exif after XMP');
  assert.equal(drawableTurned({ ...turnedImg, kind: 'bg' }, small, info6, OPTIMIZED), false);
  assert.equal(drawableTurned({ ...turnedImg, orient: 'none' }, small, info6, OPTIMIZED), false);
  assert.equal(drawableTurned(turnedImg, { ...small, type: 'png' }, { ...info6, format: 'png' }, OPTIMIZED), false);
});

test('a photo the policy would shrink stays in the photo, unless the deck asks for originals', async () => {
  const { drawableTurned } = await load();
  const big = { type: 'jpeg', bytes: new Uint8Array(5 * 1024 * 1024), agreed: true };
  const phone = { ...info6, width: 4032, height: 3024 };
  const img = { ...turnedImg, natural: [3024, 4032] };
  assert.equal(drawableTurned(img, big, phone, OPTIMIZED), false);
  assert.equal(drawableTurned(img, big, phone, ORIGINAL), true);
});
