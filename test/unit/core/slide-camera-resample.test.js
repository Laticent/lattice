/**
 * Unit: the slide camera's arithmetic for drawing a picture at the size it covers (lib/core/slide-camera.mjs, PICTURES AT THE
 * SIZE THEY ARE DRAWN; decisions/2026-11-03-pictures-at-drawn-size.md). The draw itself needs a browser and is exercised by the
 * export e2e; these pin the numbers that decide how far a picture is shrunk, since a wrong one would blur a photo.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../../../lib/core/slide-camera.mjs');

test('splitCssList splits at top-level commas only: a data URL keeps its own', async () => {
  const { splitCssList } = await load();
  const d = 'url("data:image/png;base64,AAA,BBB")';
  assert.deepEqual(splitCssList(`${d}, linear-gradient(rgb(0, 0, 0), red), url('x,y.png')`), [d, 'linear-gradient(rgb(0, 0, 0), red)', "url('x,y.png')"]);
  assert.deepEqual(splitCssList('cover, 50% auto'), ['cover', '50% auto']);
});

test('backgroundScale: cover takes the larger ratio, contain the smaller', async () => {
  const { backgroundScale } = await load();
  // A 4032 x 3024 photo in a 552 x 345 box: cover fills the width (552 / 4032), contain fits the height (345 / 3024).
  assert.equal(backgroundScale('cover', 552, 345, 4032, 3024), 552 / 4032);
  assert.equal(backgroundScale('contain', 552, 345, 4032, 3024), 345 / 3024);
});

test('backgroundScale: lengths, percentages and auto', async () => {
  const { backgroundScale } = await load();
  assert.equal(backgroundScale('auto', 500, 500, 2000, 1000), 1, 'auto draws at the natural size: never shrunk');
  assert.equal(backgroundScale('auto auto', 500, 500, 2000, 1000), 1);
  assert.equal(backgroundScale('400px auto', 500, 500, 2000, 1000), 0.2);
  assert.equal(backgroundScale('auto 50%', 500, 400, 2000, 1000), 0.2);
  assert.equal(backgroundScale('100% 100%', 500, 400, 2000, 1000), 0.4, 'a stretch keeps the axis that needs the most pixels');
  assert.equal(backgroundScale('10em', 500, 400, 2000, 1000), null, 'a unit it cannot resolve leaves the picture alone');
  assert.equal(backgroundScale('cover', 500, 400, 0, 0), null);
});

test('objectFitScale follows object-fit', async () => {
  const { objectFitScale } = await load();
  assert.equal(objectFitScale('cover', 552, 345, 4032, 3024), 552 / 4032);
  assert.equal(objectFitScale('fill', 552, 345, 4032, 3024), 552 / 4032);
  assert.equal(objectFitScale('contain', 552, 345, 4032, 3024), 345 / 3024);
  assert.equal(objectFitScale('scale-down', 5000, 5000, 400, 300), 1, 'scale-down never enlarges');
  assert.equal(objectFitScale('none', 100, 100, 4000, 3000), 1);
});

test('resamplePicture halves first, then takes one last step to the exact size', async () => {
  const { resamplePicture } = await load();
  const steps = [];
  const doc = {
    createElement: () => {
      const c = { width: 0, height: 0 };
      c.getContext = () => ({ drawImage: (_src, _sx, _sy, sw, sh, _dx, _dy, dw, dh) => steps.push([sw, sh, dw, dh]) });
      return c;
    },
  };
  const out = resamplePicture({}, 4032, 3024, 1105, 829, doc);
  assert.deepEqual(steps, [
    [4032, 3024, 2016, 1512],
    [2016, 1512, 1105, 829],
  ]);
  assert.equal(out.width, 1105);
  assert.equal(out.height, 829);
});
