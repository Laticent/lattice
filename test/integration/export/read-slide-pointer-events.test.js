/**
 * Integration: the shared PDF writer's reader (lib/core/pdf-compose/read-slide.mjs) sees an
 * image or SVG that opts out of clicks, run in a real Chromium page on synthetic slides.
 *
 * A hit test skips `pointer-events: none`, so such an element never finds its own box and
 * reads as covered by whatever paints under it: the card behind a picture, the tile behind a
 * diagram. The text reader already let the test see it for one call (`textCovered`); the
 * image check (`paintedAbove`) and the SVG check (`covers`) did not, so an author's
 * `<img style="pointer-events:none">` stayed in the photo and the page was taken sharper.
 *
 *   IMG     a `pointer-events: none` image on a card is placed as an original image
 *   SVG     a `pointer-events: none` SVG on a card is not masked as covered
 *   COVERED an image under a real scrim is still refused (the fix must not stop seeing covers)
 *   RESTORE the author's `pointer-events` value is back after the read
 *
 * FALSIFIABLE: with `paintedAbove` / `covers` calling the hit test directly, IMG and SVG fail.
 * Needs Chromium (CHROME_PATH).
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { resolveChrome } = require('../../../tools/lib/resolve-chrome');

const READER = `file://${path.join(__dirname, '..', '..', '..', 'lib', 'core', 'pdf-compose', 'read-slide.mjs')}`;
// A 1x1 PNG, so the image has a real source and geometry.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let browser;
let page;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-read-pe-'));
before(async () => {
  browser = await puppeteer.launch({ executablePath: resolveChrome?.() || process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--allow-file-access-from-files'] });
  page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
});
after(async () => {
  await browser?.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** Read one slide and return the writer's image count, refusals and the img's pointer-events afterward. */
async function read(inner) {
  const file = path.join(tmp, 'slide.html');
  fs.writeFileSync(file, `<!doctype html><meta charset="utf-8"><style>body{margin:0}section{width:1280px;height:720px;position:relative;background:#fff}
    .card{position:absolute;left:100px;top:100px;width:500px;height:300px;background:#dde}
    .card>*{position:absolute;left:20px;top:20px;width:200px;height:120px;pointer-events:none}
    .scrim{position:absolute;left:100px;top:100px;width:500px;height:300px;background:rgba(0,0,0,.4)}</style>
    <section>${inner}</section>`);
  await page.goto(`file://${file}`);
  await page.addScriptTag({ type: 'module', content: `import { readSlide } from '${READER}'; const s = document.querySelector('section'); const r = readSlide(s); window.__out = { images: r.images.length, svgWords: r.words.filter((w) => w.svg).map((w) => w.t), refused: r.stats.refusedImages, pe: getComputedStyle(s.querySelector('img') || s).pointerEvents, inline: s.querySelector('img')?.style.pointerEvents ?? '' };` });
  await page.waitForFunction('window.__out', { timeout: 20000 });
  return page.evaluate(() => window.__out);
}

test('IMG: a pointer-events:none image on a card is placed as an original image', async () => {
  const r = await read(`<div class="card"><img src="${PNG}" alt=""></div>`);
  assert.equal(r.images, 1);
  assert.equal(r.refused.covered, undefined);
});

test('SVG: a pointer-events:none SVG over a sibling card keeps its text in the vector layer', async () => {
  // The svg is a sibling, not a child, of the card, so the hit test reaches the card only if it skips the svg.
  const r = await read('<div class="card"></div><svg style="position:absolute;left:120px;top:120px;width:200px;height:120px;pointer-events:none" viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg"><text x="10" y="60" font-size="20" fill="#000">Alpha</text></svg>');
  assert.deepEqual(r.svgWords, ['Alpha']);
});

test('COVERED: an image under a real scrim is still refused', async () => {
  const r = await read(`<div class="card"><img src="${PNG}" alt=""></div><div class="scrim"></div>`);
  assert.equal(r.images, 0);
  assert.equal(r.refused.covered, 1);
});

test('RESTORE: the author’s pointer-events value is back after the read', async () => {
  const r = await read(`<div class="card"><img src="${PNG}" alt=""></div>`);
  assert.equal(r.pe, 'none');
  assert.equal(r.inline, '');
});
