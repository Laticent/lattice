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

test('lanczosResize: a flat color stays exactly that color, at the size asked for', async () => {
  const { lanczosResize } = await import('../../../lib/core/lanczos.mjs');
  const sw = 97;
  const sh = 61;
  const src = new Uint8ClampedArray(sw * sh * 4);
  for (let i = 0; i < src.length; i += 4) src.set([200, 120, 40, 255], i);
  const out = lanczosResize(src, sw, sh, 30, 19);
  assert.equal(out.length, 30 * 19 * 4);
  for (let i = 0; i < out.length; i += 4) assert.deepEqual([...out.subarray(i, i + 4)], [200, 120, 40, 255]);
});

test('lanczosResize: a transparent pixel lends no color (no dark halo at a transparent edge)', async () => {
  const { lanczosResize } = await import('../../../lib/core/lanczos.mjs');
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

test('lanczosResize: read in strips, it writes the same bytes as from the whole array', async () => {
  const { lanczosResize } = await import('../../../lib/core/lanczos.mjs');
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
  const strips = lanczosResize((y, n) => { reads++; return src.subarray(y * sw * 4, (y + n) * sw * 4); }, sw, sh, 41, 52, 16);
  assert.deepEqual([...strips], [...whole]);
  assert.ok(reads >= Math.ceil(sh / 16), 'the source was read in strips');
});

test('lanczosResize: a fine stripe pattern averages out instead of aliasing', async () => {
  const { lanczosResize } = await import('../../../lib/core/lanczos.mjs');
  const sw = 400;
  const sh = 4;
  const src = new Uint8ClampedArray(sw * sh * 4);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) src.set(x % 2 ? [255, 255, 255, 255] : [0, 0, 0, 255], (y * sw + x) * 4);
  // 1-pixel stripes shrunk 5 times are a flat mid-gray; a nearest or bilinear shrink would keep stripes or beat patterns.
  const out = lanczosResize(src, sw, sh, 80, 1);
  for (let x = 2; x < 78; x++) assert.ok(Math.abs(out[x * 4] - 127.5) <= 3, `column ${x}: ${out[x * 4]}`);
});

test('resamplePicture: the camera reads the photo in strips and writes exactly what the whole-array resize writes', async () => {
  // A mock canvas that copies the source 1:1 for a source-rectangle draw, as a browser does for an upright photo (an EXIF-rotated
  // one too: measured in Chromium and WebKit, a strip read by source rectangle matches one whole-image draw byte for byte).
  const { lanczosResize } = await import('../../../lib/core/lanczos.mjs');
  const { resamplePicture } = await import('../../../lib/core/slide-camera.mjs');
  const nw = 301;
  const nh = 203; // three full 64-row strips and a short one of 11
  const src = new Uint8ClampedArray(nw * nh * 4);
  for (let i = 0; i < src.length; i++) src[i] = i % 4 === 3 ? 255 : (i * 7919) % 256;
  const canvases = [];
  let put = null;
  const Real = globalThis.ImageData;
  globalThis.ImageData = class {
    constructor(d, w, h) {
      assert.equal(d.length, w * h * 4);
      this.data = d;
      this.width = w;
      this.height = h;
    }
  };
  try {
    const doc = {
      createElement: () => {
        const c = { width: 0, height: 0 };
        let buf = null;
        c.getContext = () => ({
          clearRect() {
            buf = new Uint8ClampedArray(c.width * c.height * 4);
          },
          drawImage(_img, sx, sy, sw, sh, dx, dy, dw, dh) {
            assert.ok(sw === dw && sh === dh && sx === 0 && dx === 0 && dy === 0, 'a strip is a 1:1 copy');
            for (let r = 0; r < sh; r++) buf.set(src.subarray((sy + r) * nw * 4, ((sy + r) * nw + sw) * 4), r * c.width * 4);
          },
          getImageData: (_x, _y, w, h) => ({ data: buf.slice(0, w * h * 4) }),
          putImageData(d) {
            put = d;
          },
          set imageSmoothingEnabled(_v) {},
        });
        canvases.push(c);
        return c;
      },
    };
    const out = resamplePicture({}, nw, nh, 100, 67, doc);
    assert.deepEqual([...put.data], [...lanczosResize(src, nw, nh, 100, 67)]);
    assert.equal(out.width, 100);
    assert.equal(out.height, 67);
    assert.deepEqual([canvases[0].width, canvases[0].height], [0, 0], 'the scratch canvas is released');
  } finally {
    globalThis.ImageData = Real;
  }
});
