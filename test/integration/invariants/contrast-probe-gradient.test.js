/**
 * The contrast PROBE (tools/check-slide-contrast.js) measures ink against the paint directly
 * behind it, and that paint can be a gradient layer, not only a `background-color`.
 *
 * WHY THIS FILE EXISTS. `topic` paints its light bottom band as a second `background-image` layer,
 * `linear-gradient(transparent 75%, <light> 75%)`, over a dark `background-color`. The probe read
 * only the color, so dark ink on the light band scored 1.02:1 against the dark canvas. Five gates
 * share the probe, so the proof lives here, on a page small enough to state every number:
 * a failing arm for each way the evaluator can be wrong, each paired with its passing twin.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const { PNG } = require('pngjs');
const { PROBE } = require('../../../tools/check-slide-contrast');

const NAVY = '#003d66';
const LIGHT = '#f2f5fa';
const page = (inner) => `<!doctype html><html><body style="margin:0;font:32px sans-serif">
<section data-lattice-slide="1" class="probe" style="position:relative;width:1280px;height:720px;overflow:hidden;background-color:${NAVY}">${inner}</section></body></html>`;
const at = (top, left, color, text) => `<div style="position:absolute;top:${top}px;left:${left}px;color:${color}">${text}</div>`;

describe('contrast probe: gradient backdrops', () => {
  let browser;
  before(async () => { browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] }); });
  after(async () => { if (browser) await browser.close(); });

  const rows = async (html) => {
    const p = await browser.newPage();
    await p.setViewport({ width: 1280, height: 720 });
    await p.setContent(html);
    const out = await p.evaluate(PROBE);
    await p.close();
    return Object.fromEntries(out.map((r) => [r.text, r.r]));
  };

  // The `topic` shape: a hard two-tone stop at 75%, the light half below it.
  const TWO_TONE = `background-image:linear-gradient(rgba(0,0,0,0) 0px, rgba(0,0,0,0) 75%, ${LIGHT} 75%);background-size:100% 100%;background-repeat:no-repeat`;

  test('ink on the light half of a hard-stop band is scored against the light half, not the canvas', async () => {
    const r = await rows(page(`<div style="position:absolute;inset:0;${TWO_TONE}"></div>${at(60, 40, '#ffffff', 'ONDARK')}${at(600, 40, NAVY, 'ONLIGHT')}`));
    assert.ok(r.ONDARK > 10, `white on the navy half: ${r.ONDARK}`);
    assert.ok(r.ONLIGHT > 10, `navy on the light band: ${r.ONLIGHT} (1.02 when the gradient is ignored)`);
  });

  test('FAILING ARM: ink that is wrong for the light half still fails there', async () => {
    const r = await rows(page(`<div style="position:absolute;inset:0;${TWO_TONE}"></div>${at(600, 40, '#ffffff', 'WHITEONLIGHT')}`));
    assert.ok(r.WHITEONLIGHT < 1.5, `white on the light band must fail, got ${r.WHITEONLIGHT}`);
  });

  test('a layer with its own size and position paints only its tile', async () => {
    // A 3px rule at 75%: text well away from it sees only the canvas.
    const rule = 'background-image:linear-gradient(90deg,#ffffff,#ffffff);background-size:100% 3px;background-position:0 75%;background-repeat:no-repeat';
    const r = await rows(page(`<div style="position:absolute;inset:0;${rule}"></div>${at(60, 40, '#ffffff', 'AWAYFROMRULE')}`));
    assert.ok(r.AWAYFROMRULE > 10, `white on the canvas, far from a white rule: ${r.AWAYFROMRULE}`);
  });

  test('a horizontal gradient is evaluated where the glyphs are, not at its ends', async () => {
    const g = `background-image:linear-gradient(90deg,#000000 0%,#000000 50%,#ffffff 50%,#ffffff 100%);background-size:100% 100%`;
    const r = await rows(page(`<div style="position:absolute;inset:0;${g}"></div>${at(100, 40, '#ffffff', 'LEFTHALF')}${at(100, 900, '#000000', 'RIGHTHALF')}${at(300, 900, '#ffffff', 'WHITEONRIGHT')}`));
    assert.ok(r.LEFTHALF > 15, `white on the black half: ${r.LEFTHALF}`);
    assert.ok(r.RIGHTHALF > 15, `black on the white half: ${r.RIGHTHALF}`);
    assert.ok(r.WHITEONRIGHT < 1.5, `FAILING ARM: white on the white half: ${r.WHITEONRIGHT}`);
  });

  test('a translucent gradient composites over the color beneath it', async () => {
    // 50% white over navy (0,61,102) paints (128,158,179): white ink is 2.8:1 on it and navy ink 4.0:1.
    // Against the bare canvas the same two inks would score 11.3 and 1.0, so these numbers prove the composite.
    const g = 'background-image:linear-gradient(rgba(255,255,255,0.5),rgba(255,255,255,0.5));background-size:100% 100%';
    const r = await rows(page(`<div style="position:absolute;inset:0;${g}"></div>${at(100, 40, '#ffffff', 'WHITEONMID')}${at(300, 40, NAVY, 'NAVYONMID')}`));
    assert.ok(r.WHITEONMID > 2.5 && r.WHITEONMID < 3.1, `white on the composited mid blue: ${r.WHITEONMID}`);
    assert.ok(r.NAVYONMID > 3.7 && r.NAVYONMID < 4.3, `navy on the composited mid blue: ${r.NAVYONMID}`);
  });

  test('a gradient the evaluator does not handle changes nothing (radial paints no layer here)', async () => {
    const g = 'background-image:radial-gradient(circle,#ffffff,#ffffff);background-size:100% 100%';
    const r = await rows(page(`<div style="position:absolute;inset:0;${g}"></div>${at(100, 40, '#ffffff', 'WHITEONRADIAL')}`));
    assert.ok(r.WHITEONRADIAL > 10, `unchanged behavior: scored against the canvas, got ${r.WHITEONRADIAL}`);
  });

  // ── The evaluator against the REAL pixel ─────────────────────────────────────────────────
  // A claim that the evaluator handles a gradient form is a claim about Chromium's pixels, so each
  // form below is compared with the pixel the browser actually paints: the same page is rendered
  // twice, once with the text (the probe reads its backdrop) and once with the text hidden (a 1x1
  // screenshot at the text's center reads the paint behind it).
  const BOX = 'position:absolute;left:100px;top:100px;width:400px;height:100px;background-color:#ffffff;';
  const pixelCase = async (boxCss, x, y) => {
    const mk = (hide) => page(`<div style="${BOX}${boxCss}"></div><div style="position:absolute;left:${x - 4}px;top:${y - 8}px;font-size:12px;line-height:16px;color:#ff00ff${hide ? ';visibility:hidden' : ''}">x</div>`);
    const p = await browser.newPage();
    await p.setViewport({ width: 1280, height: 720 });
    await p.setContent(mk(false));
    const row = (await p.evaluate(PROBE)).find((q) => q.text === 'x');
    await p.setContent(mk(true));
    const cx = Math.round(row.rect.x + row.rect.w / 2);
    const cy = Math.round(row.rect.y + row.rect.h / 2);
    const png = PNG.sync.read(Buffer.from(await p.screenshot({ clip: { x: cx, y: cy, width: 1, height: 1 }, type: 'png' })));
    await p.close();
    return { got: row.bg, want: [png.data[0], png.data[1], png.data[2]] };
  };
  const near = (cs, label) => assert.ok(cs.got.every((v, i) => Math.abs(v - cs.want[i]) <= 3), `${label}: the probe reads ${cs.got}, Chromium paints ${cs.want}`);

  const CASES = [
    ['to top right on a NON-SQUARE box (the angle is atan(h/w))', 'background-image:linear-gradient(to top right,#000,#fff)', 400, 180],
    ['to top right, the other end of the same box', 'background-image:linear-gradient(to top right,#000,#fff)', 200, 120],
    ['to bottom left', 'background-image:linear-gradient(to bottom left,#ff0000,#0000ff)', 300, 170],
    ['an angle with px stops', 'background-image:linear-gradient(45deg,#000 20px,#fff 120px)', 260, 150],
    ['OKLab interpolation: color-mix stops mix in oklab, not sRGB', 'background-image:linear-gradient(90deg,color-mix(in oklab,#000 100%,#fff),color-mix(in oklab,#fff 100%,#000))', 300, 150],
    ['premultiplied interpolation toward transparent', 'background-color:#000;background-image:linear-gradient(90deg,#ff8080,transparent)', 300, 150],
    ['a hard stop at 75% (the topic band), below it', `background-color:${NAVY};background-image:linear-gradient(rgba(0,0,0,0) 0px,rgba(0,0,0,0) 75%,${LIGHT} 75%)`, 200, 190],
    ['a hard stop at 75% (the topic band), above it', `background-color:${NAVY};background-image:linear-gradient(rgba(0,0,0,0) 0px,rgba(0,0,0,0) 75%,${LIGHT} 75%)`, 200, 120],
    ['a 4-value position, inside the tile', 'background-image:linear-gradient(#000,#000);background-size:50px 20px;background-repeat:no-repeat;background-position:right 10px bottom 5px', 465, 185],
    ['a 4-value position, outside the tile', 'background-image:linear-gradient(#000,#000);background-size:50px 20px;background-repeat:no-repeat;background-position:right 10px bottom 5px', 120, 115],
    ['a repeated tile with a px size', 'background-image:linear-gradient(#000,#000);background-size:20px 20px;background-position:0 0;background-image:linear-gradient(90deg,#000 50%,#fff 50%)', 125, 150],
    ['a layer with a px size and a percent position', 'background-image:linear-gradient(#000,#000);background-size:100px 30px;background-repeat:no-repeat;background-position:100% 100%', 450, 190],
    ['a CSS transform scales the px stops with the box', 'transform:scale(.5);transform-origin:0 0;background-image:linear-gradient(#000 40px,#fff 40px)', 120, 125],
  ];
  for (const [name, css, x, y] of CASES) {
    test(`real pixel: ${name}`, async () => near(await pixelCase(css, x, y), name));
  }

  test('real pixel: the evaluator is not a no-op (the same cases differ from the bare background-color)', async () => {
    const withG = await pixelCase('background-image:linear-gradient(to top right,#000,#fff)', 400, 180);
    assert.ok(withG.got.some((v) => v !== 255), `a gradient must change the backdrop from the white color: ${withG.got}`);
  });
});
