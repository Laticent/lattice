/**
 * Integration: the failures an independent check found in the first version of sprites, one fixture each
 * (docs/src/lib/calco/reader.ts `above`; lib/export/office-export.js `cropPictures`, `placePictures`).
 *
 *   f1  a picture under a card's own `::after` scrim: the scrim is above it
 *   f4  an element's own background picture under its liftable `::before` bar
 *   f12 a negative-level glow under a white card
 *   f11 a frame with a clear middle must not be a JPEG (a JPEG paints clear pixels black)
 *   f7  a column rule, which nothing in the reader accounts for, is not dropped
 *   f2  an empty SVG before a card and a label: shape indexes stay true after pictures are dropped or split
 *
 * Slow tier: one Chromium launch, no CLI.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const { readSlide, restoreSlide } = require('@laticent/calco');
const { captureSlides } = require('../../../lib/export/office-export');

const page = (css, body) => `<!doctype html><html><head><style>body{margin:0;font-family:sans-serif} section{width:1280px;height:720px;position:relative;background:#fff;color:#123;isolation:isolate} ${css}</style></head><body><section id="s" data-lattice-slide="1">${body}</section></body></html>`;

const F1 = page(
  '.card{position:absolute;left:40px;top:40px;width:400px;height:300px}.card svg{display:block;width:400px;height:300px}.card::after{content:"";position:absolute;inset:0;background:rgba(0,0,0,.5)}',
  '<div class="card"><svg viewBox="0 0 10 10"><rect width="10" height="10" fill="#f80"/></svg></div>',
);
const F4 = page(
  '.card{position:absolute;left:40px;top:40px;width:400px;height:200px;background:radial-gradient(circle,#ffe,#ccd)}.card::before{content:"";position:absolute;left:0;top:0;width:12px;height:100%;background:#c00}.c2{position:absolute;left:500px;top:40px;width:400px;height:200px;background:radial-gradient(circle,#ffe,#ccd)}.c2::before{content:"";display:block;width:100%;height:12px;background:#0a0}',
  '<div class="card"></div><div class="c2"></div>',
);
const F12 = page(
  '.card{position:absolute;left:200px;top:150px;width:400px;height:250px;background:#fff;border-radius:12px}.card::before{content:"";position:absolute;inset:-40px;z-index:-1;background:radial-gradient(closest-side,#f60,transparent)}.card p{margin:30px;font-size:24px}',
  '<div class="card"><p>White card on a glow</p></div>',
);
const NOISE = 'url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20width%3D%27300%27%20height%3D%27300%27%3E%3Cfilter%20id%3D%27n%27%3E%3CfeTurbulence%20type%3D%27fractalNoise%27%20baseFrequency%3D%270.8%27%20numOctaves%3D%273%27/%3E%3C/filter%3E%3Crect%20width%3D%27300%27%20height%3D%27300%27%20fill%3D%27%23468%27/%3E%3Crect%20width%3D%27300%27%20height%3D%27300%27%20filter%3D%27url%28%23n%29%27%20opacity%3D%270.9%27/%3E%3C/svg%3E")';
const F11 = page(`.frame{position:absolute;left:60px;top:60px;width:1100px;height:600px;border:70px solid;border-image:${NOISE} 40 round;font-size:28px;padding:20px;box-sizing:border-box}`, '<div class="frame">Inside the textured frame</div>');
const F7 = page(
  '.cols{position:absolute;left:100px;top:200px;width:800px;columns:2;column-gap:40px;column-rule:2px solid #c00;font-size:20px}',
  '<div class="cols"><p>Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega.</p><p>Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega.</p></div>',
);
const F2 = page(
  '.empty{position:absolute;left:1000px;top:600px;width:100px;height:60px}.card{position:absolute;left:40px;top:40px;width:400px;height:200px;background:#eef}.card p{margin:10px;font-size:20px}.label{position:absolute;left:600px;top:300px;width:300px;height:60px;background:#fde;font-size:24px;line-height:60px;text-indent:-40px}',
  '<svg class="empty" viewBox="0 0 10 10"></svg><div class="card"><p>First paragraph</p><p>Second paragraph</p></div><div class="label">Loose label</div>',
);

const PHOTO = page(
  '.photo{position:absolute;left:64px;top:100px;width:600px;height:300px;border-radius:18px;overflow:hidden;background:#234}.photo svg{position:absolute;inset:0;width:100%;height:100%}.photo::after{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.75),rgba(0,0,0,0) 60%)}',
  '<div class="photo"><svg viewBox="0 0 10 10" preserveAspectRatio="none"><rect width="10" height="10" fill="#38a"/></svg></div>',
);
const WRAP = page(
  '.note{position:absolute;left:64px;top:100px;width:300px;font-size:20px;line-height:1.6}code{background:#dde;border-radius:4px;padding:0 4px}',
  '<div class="note">Short <code>chip</code> then <code>a-very-long-inline-code-token-that-wraps-onto-a-second-line</code> end.</div>',
);

describe('calco sprites: order, opacity, leftovers and indexes', () => {
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
  const load = async (html) => {
    await tab.setContent(html, { waitUntil: 'load' });
    return tab.$('#s');
  };
  const read = async (html) => {
    const h = await load(html);
    const res = await h.evaluate(readSlide, { shapes: true, sprites: true });
    await h.evaluate(restoreSlide);
    return res;
  };
  const capture = async (html) => {
    await load(html);
    const { slides } = await captureSlides(await tab.$$('section[data-lattice-slide]'), { type: 'png' }, true);
    return slides[0];
  };
  const near = (s, x, y, w, h) => Math.abs(s.x - x) < 2 && Math.abs(s.y - y) < 2 && (w === undefined || Math.abs(s.w - w) < 2) && (h === undefined || Math.abs(s.h - h) < 2);
  const index = (res, pred) => res.shapes.findIndex(pred);

  test('f1: the picture is under the card\'s own ::after scrim', async () => {
    const res = await read(F1);
    const pic = index(res, (s) => s.kind === 'picture');
    const scrim = index(res, (s) => s.kind === 'box' && near(s, 40, 40, 400, 300));
    assert.ok(pic >= 0 && scrim >= 0, JSON.stringify(res.shapes.map((s) => [s.kind, s.x, s.y])));
    assert.ok(pic < scrim, 'picture first, then the scrim over it');
  });

  test('f4: an element\'s own gradient picture is under its ::before bar, positioned or not', async () => {
    const res = await read(F4);
    for (const [bx, by, bw, bh] of [[40, 40, 12, 200], [500, 40, 400, 12]]) {
      const bar = index(res, (s) => s.kind === 'box' && near(s, bx, by, bw, bh));
      const pic = index(res, (s) => s.kind === 'picture' && s.x <= bx + 1 && s.y <= by + 1 && s.x + s.w >= bx + bw - 1);
      assert.ok(bar >= 0 && pic >= 0, `${bx}: ${JSON.stringify(res.shapes.map((s) => [s.kind, s.x, s.y, s.w, s.h]))}`);
      assert.ok(pic < bar, `${bx}: the picture is under the bar`);
    }
  });

  test('f12: a glow at a negative level is under the white card', async () => {
    const res = await read(F12);
    const card = index(res, (s) => s.kind === 'box' && near(s, 200, 150, 400, 250));
    const glow = index(res, (s) => s.kind === 'picture' && s.x < 200 && s.y < 150);
    assert.ok(card >= 0 && glow >= 0);
    assert.ok(glow < card);
  });

  test('f11: a frame with a clear middle is never one JPEG', async () => {
    const slide = await capture(F11);
    for (const p of slide.shapes.filter((s) => s.kind === 'picture')) {
      const jpeg = p.image[0] === 0xff && p.image[1] === 0xd8;
      const coversCenter = p.x < 640 && p.x + p.w > 640 && p.y < 360 && p.y + p.h > 360;
      assert.ok(!(jpeg && coversCenter), `a JPEG over the middle: ${JSON.stringify([p.x, p.y, p.w, p.h])}`);
    }
  });

  test('f7: a column rule that the reader does not know is still a picture, not dropped', async () => {
    const slide = await capture(F7);
    const rule = slide.shapes.find((s) => s.kind === 'picture' && s.x < 505 && s.x + s.w > 495 && s.h > 20);
    assert.ok(rule && rule.image.length > 0, JSON.stringify(slide.shapes.map((s) => [s.kind, s.x, s.y, s.w, s.h])));
    assert.equal(slide.image, undefined);
  });

  test('f2: indexes still point at the right shapes once a picture is dropped', async () => {
    const slide = await capture(F2);
    const card = slide.shapes.findIndex((s) => s.kind === 'box' && near(s, 40, 40, 400, 200));
    const label = slide.shapes.findIndex((s) => s.kind === 'box' && near(s, 600, 300, 300, 60));
    assert.ok(card >= 0 && label >= 0);
    assert.equal(slide.shapes[card].group, card, 'the card is its own group');
    assert.notEqual(slide.shapes[label].group, card, 'the loose label is not in the card\'s group');
    for (const f of slide.frames) if (f.group !== undefined) assert.equal(slide.shapes[f.group]?.kind, 'box', 'a frame\'s group is a card');
    assert.ok(slide.frames.some((f) => f.group === card), 'the card\'s text is in its group');
  });

  test('a scrim inside a rounded, overflow-hidden photo is baked into the photo, above it', async () => {
    const res = await read(PHOTO);
    const photo = index(res, (s) => s.kind === 'picture');
    assert.ok(photo >= 0);
    assert.equal(res.shapes.some((s) => s.kind === 'box' && s.gradient), false, 'the scrim would poke out of the rounded corners as a square shape');
  });

  test('a wrapped inline chip is not one rectangle; a one-line chip still is', async () => {
    const res = await read(WRAP);
    const chips = res.shapes.filter((s) => s.kind === 'box' && s.fill && s.h < 40);
    assert.equal(chips.length, 1, JSON.stringify(res.shapes.map((s) => [s.kind, s.x, s.y, s.w, s.h])));
    assert.ok(chips[0].w < 80, 'the short chip');
  });
});
