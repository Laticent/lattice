/**
 * Integration: what cannot be a shape stays a picture of its own, in paint order
 * (docs/src/lib/calco/reader.ts, `ReadOptions.sprites`).
 *
 * Without `sprites` the one slide-sized foreground picture sits under every shape, so a card that holds
 * an icon (picture content painted above the card's fill) cannot be a shape: it stays in the picture.
 * With `sprites` each cluster of picture content is its own picture placed in the paint order, so the
 * card is a shape and the icon is a picture drawn above it, in the card's group.
 *
 * Slow tier: one Chromium launch, no CLI.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const { readSlide, restoreSlide } = require('@laticent/calco');

const FIXTURE = `<!doctype html><html><head><style>
  body { margin: 0; font-family: sans-serif; }
  section { width: 1280px; height: 720px; position: relative; background: #fff; color: #112233; }
  .card { position: absolute; left: 40px; top: 40px; width: 320px; height: 140px; background: #f2f5fa; border-radius: 8px; box-sizing: border-box; }
  .card svg { position: absolute; left: 16px; top: 16px; width: 32px; height: 32px; }
  .card p { position: absolute; left: 64px; top: 20px; margin: 0; font-size: 18px; }
  .under { position: absolute; left: 420px; top: 40px; width: 200px; height: 100px; background: #e8f5ec; }
  .photo { position: absolute; left: 440px; top: 60px; width: 60px; height: 60px; }
  .over { position: absolute; left: 520px; top: 60px; width: 80px; height: 40px; background: #036; }
  .plain { position: absolute; left: 40px; top: 300px; width: 200px; height: 60px; background: #fef3c7; }
</style></head><body><section id="s">
  <div class="card" id="card"><svg viewBox="0 0 32 32" id="icon"><circle cx="16" cy="16" r="12" fill="#c00"/></svg><p>Card text</p></div>
  <div class="under"></div>
  <svg class="photo" viewBox="0 0 10 10" aria-label="A chart"><rect width="10" height="10" fill="#a0a"/></svg>
  <div class="over"></div>
  <div class="plain"></div>
</section></body></html>`;

describe('calco sprites', () => {
  let browser;
  let page;
  before(async () => {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.setContent(FIXTURE, { waitUntil: 'load' });
  });
  after(async () => {
    await browser?.close();
  });
  const read = async (options) => {
    const h = await page.$('#s');
    const res = await h.evaluate(readSlide, { shapes: true, ...options });
    await h.evaluate(restoreSlide);
    return res;
  };
  const near = (s, x, y) => Math.abs(s.x - x) < 2 && Math.abs(s.y - y) < 2;

  test('without sprites, a card holding an icon stays in the picture', async () => {
    const res = await read({});
    assert.equal(res.shapes.find((s) => s.kind === 'box' && near(s, 40, 40)), undefined);
    assert.equal(res.shapes.some((s) => s.kind === 'picture'), false);
  });

  test('with sprites, the card is a shape, its icon a picture above it, and both are one group', async () => {
    const res = await read({ sprites: true });
    const card = res.shapes.findIndex((s) => s.kind === 'box' && near(s, 40, 40));
    const icon = res.shapes.findIndex((s) => s.kind === 'picture' && s.x < 60 && s.y < 60);
    assert.ok(card >= 0, 'the card is a shape');
    assert.ok(icon > card, 'the icon is drawn after (above) the card');
    assert.equal(res.shapes[icon].group, card);
    assert.equal(res.shapes[card].group, card);
    // The picture is the icon and its margin, not the slide.
    assert.ok(res.shapes[icon].w < 80 && res.shapes[icon].h < 80);
  });

  test('a box above a picture and one below it keep their order; a plain box needs no picture', async () => {
    const res = await read({ sprites: true });
    const under = res.shapes.findIndex((s) => s.kind === 'box' && near(s, 420, 40));
    const pic = res.shapes.findIndex((s) => s.kind === 'picture' && near({ x: s.x + 8, y: s.y + 8 }, 440, 60));
    const over = res.shapes.findIndex((s) => s.kind === 'box' && near(s, 520, 60));
    assert.ok(under >= 0 && pic >= 0 && over >= 0, JSON.stringify(res.shapes.map((s) => [s.kind, s.x, s.y])));
    assert.ok(under < pic && pic < over, 'under, then the picture, then over');
    assert.equal(res.shapes[pic].alt, 'A chart');
    assert.ok(res.shapes.some((s) => s.kind === 'box' && near(s, 40, 300)), 'the plain box is a shape');
  });
});

describe('calco sprites, end to end through captureSlides', () => {
  const { captureSlides } = require('../../../lib/export/office-export');
  let browser;
  let page;
  before(async () => {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.setContent(FIXTURE.replace('<section id="s">', '<section id="s" data-lattice-slide="1">'), { waitUntil: 'load' });
  });
  after(async () => {
    await browser?.close();
  });
  const isPng = (b) => b[0] === 0x89 && b[1] === 0x50;

  test('each picture carries its own bytes, cut to its ink; there is no whole-slide picture', async () => {
    const handles = await page.$$('section[data-lattice-slide]');
    const { slides } = await captureSlides(handles, { type: 'png' }, true);
    const [slide] = slides;
    assert.equal(slide.image, undefined, 'no foreground picture');
    const pics = slide.shapes.filter((s) => s.kind === 'picture');
    assert.ok(pics.length >= 2, `icon and chart: ${JSON.stringify(slide.shapes.map((s) => [s.kind, s.x, s.y, s.w, s.h]))}`);
    for (const p of pics) {
      assert.ok(p.image.length > 50 && isPng(p.image));
      assert.ok(p.w < 120 && p.h < 120, 'cut to the ink, not the slide');
    }
  });

  test('a blurred box is a picture of its own, with its soft edge inside the crop', async () => {
    await page.evaluate(() => {
      const el = document.createElement('div');
      el.id = 'stray';
      el.style.cssText = 'position:absolute;left:700px;top:400px;width:300px;height:200px;filter:blur(6px);background:#0a0;opacity:.5';
      document.getElementById('s').appendChild(el);
    });
    const handles = await page.$$('section[data-lattice-slide]');
    const { slides } = await captureSlides(handles, { type: 'png' }, true);
    const [slide] = slides;
    assert.equal(slide.image, undefined, 'the soft edge is covered, so no fallback to a whole-slide picture');
    assert.ok(slide.shapes.some((s) => s.kind === 'picture' && s.x < 700 && s.x + s.w > 1000 && s.y < 400 && s.y + s.h > 600), 'the blurred box is one picture');
    await page.evaluate(() => document.getElementById('stray').remove());
  });
});
