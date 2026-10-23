/**
 * Integration: the deck logo is its own picture on every slide, the same way every time
 * (docs/src/lib/calco/capture.ts `addLogo`). Never baked into the shared background, never into another
 * picture (a photo panel it sits over), never into the whole-slide picture of a slide that reads its
 * backdrop, and a logo with a transparent background keeps its transparency.
 *
 * Slow tier: one Chromium launch, no CLI.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const { captureOfficeSlides } = require('@laticent/calco');

// A 40x25 logo: transparent corners, a solid red core.
const LOGO = (() => {
  const { PNG } = require('pngjs');
  const png = new PNG({ width: 40, height: 25 });
  for (let y = 0; y < 25; y++) {
    for (let x = 0; x < 40; x++) {
      const i = (y * 40 + x) * 4;
      const core = x >= 10 && x < 30 && y >= 6 && y < 19;
      png.data.set(core ? [220, 0, 0, 255] : [0, 0, 0, 0], i);
    }
  }
  return `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`;
})();
const PANEL = (() => {
  const { PNG } = require('pngjs');
  const png = new PNG({ width: 64, height: 64 });
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) png.data.set([30 + x, 90 + y, 160, 255], (y * 64 + x) * 4);
  return `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`;
})();

const slide = (extra = '') => `<section data-lattice-slide="1" class="finish">
  <div class="backdrop"><div class="backdrop-mask"></div></div>
  <img class="deck-logo" src="${LOGO}" alt="">
  <img class="panel" src="${PANEL}" alt="a panel">
  <p>Body</p>${extra}
</section>`;
const page = (body) => `<!doctype html><html><head><style>
body{margin:0;font-family:sans-serif}
section{width:1280px;height:720px;position:relative;background:#fff;color:#123;isolation:isolate;overflow:hidden}
.backdrop{position:absolute;inset:0;z-index:-2;background:linear-gradient(120deg,#cde,#fed)}
.backdrop::after{content:"";position:absolute;inset:0;background:radial-gradient(circle at 70% 30%,rgba(0,0,0,.08),transparent 60%)}
.backdrop-mask{position:absolute;inset:17px;border:1px solid rgba(0,0,0,.1)}
img.deck-logo{position:absolute;z-index:0;top:24px;right:30px;width:80px;height:50px;object-fit:contain}
img.panel{position:absolute;right:0;top:0;width:525px;height:720px;z-index:0}
p{position:absolute;left:60px;top:300px;font-size:30px;margin:0}
</style></head><body>${body}</body></html>`;

describe('calco deck logo', () => {
  let browser;
  let tab;
  before(async () => {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    tab = await browser.newPage();
    await tab.setViewport({ width: 1280, height: 720 });
  });
  after(async () => {
    await browser?.close();
  });

  const hostFor = (handles, shots) => ({
    run: (i, fn, arg) => handles[i].evaluate(fn, arg),
    shoot: async (i, kind) => {
      shots.push(kind);
      return new Uint8Array(await handles[i].screenshot({ type: 'png', omitBackground: kind === 'foreground' }));
    },
  });
  /** The RGBA of one pixel of an image (PNG or JPEG bytes), read in the page; `px` and `py` are fractions of its width and height. */
  const pixel = (bytes, x, y) =>
    tab.evaluate(
      async (b64, mime, px, py) => {
        const bmp = await createImageBitmap(await (await fetch(`data:${mime};base64,${b64}`)).blob());
        const c = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d', { willReadFrequently: true });
        c.drawImage(bmp, 0, 0);
        return Array.from(c.getImageData(Math.min(bmp.width - 1, Math.floor(px * bmp.width)), Math.min(bmp.height - 1, Math.floor(py * bmp.height)), 1, 1).data);
      },
      Buffer.from(bytes).toString('base64'),
      bytes[0] === 0xff ? 'image/jpeg' : 'image/png',
      x,
      y,
    );
  const isRed = ([r, g, b]) => r > 180 && g < 60 && b < 60;

  for (const mode of ['check', 'whole']) {
    test(`${mode}: the logo is its own transparent picture, in neither the background nor the panel`, async () => {
      // `reads` is forced by a blend on the logo's neighbor in 'whole' mode.
      await tab.setContent(page(slide(mode === 'whole' ? '<div style="position:absolute;left:600px;top:500px;width:50px;height:50px;background:#ccc;mix-blend-mode:multiply"></div>' : '')), { waitUntil: 'load' });
      const handles = await tab.$$('section[data-lattice-slide]');
      const shots = [];
      const { slides, backgrounds } = await captureOfficeSlides(hostFor(handles, shots), 1, { sprites: true });
      const pictures = slides[0].shapes.filter((s) => s.kind === 'picture');
      const logo = pictures.at(-1);
      assert.equal(logo.alt, 'Logo');
      assert.ok(logo.w < 100 && logo.h < 60, `the logo is its own small picture, not ${logo.w}x${logo.h}`);
      // Transparency kept: the logo's PNG has a clear corner and a red core.
      assert.equal(logo.image[0], 0x89, 'a PNG, since it has transparency');
      const clear = await pixel(logo.image, 0.02, 0.03);
      assert.equal(clear[3], 0, `the logo's transparent corner stays transparent: ${clear}`);
      assert.ok(isRed(await pixel(logo.image, 0.5, 0.5)), 'the logo core is red');
      // Not baked into another picture: the panel picture (or the whole-slide picture) has no red where the logo is.
      const lx = 1280 - 30 - 80 + 40;
      const ly = 24 + 25;
      const others = [...pictures.slice(0, -1), ...(slides[0].image ? [{ image: slides[0].image, x: 0, y: 0, w: 1280, h: 720 }] : [])];
      assert.ok(others.length > 0, 'something else is a picture here');
      for (const o of others) {
        if (lx < o.x || lx > o.x + o.w || ly < o.y || ly > o.y + o.h) continue;
        assert.ok(!isRed(await pixel(o.image, ((lx - o.x) / o.w) * 1, ((ly - o.y) / o.h) * 1)), 'the logo is not baked into another picture');
      }
      // Not baked into the shared background.
      const bg = backgrounds[slides[0].background];
      if (bg?.image) assert.ok(!isRed(await pixel(bg.image, lx / 1280, ly / 720)), 'the logo is not in the background');
    });
  }

  test('the logo is shot once per look, however many slides carry it', async () => {
    await tab.setContent(page([slide(), slide(), slide()].join('').replace(/data-lattice-slide="1"/g, (m, i) => m)), { waitUntil: 'load' });
    const handles = await tab.$$('section');
    const shots = [];
    const { slides } = await captureOfficeSlides(hostFor(handles, shots), 3, { sprites: true });
    for (const s of slides) assert.equal(s.shapes.filter((x) => x.alt === 'Logo').length, 1);
    // One 'logo' photograph, not three: the foreground shots are three (one a slide) plus one for the logo.
    assert.equal(shots.filter((k) => k === 'foreground').length, 4, shots.join());
  });
});
