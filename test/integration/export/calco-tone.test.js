/**
 * Integration: Calco's `isContinuousTone` in a real Chromium (docs/src/lib/calco/picture.ts).
 *
 * It decides the ORDER of the two screenshots (a PNG of a photograph takes about 1.2 s, its
 * JPEG 0.36 s; a flat slide's PNG takes 0.2 s), so it must say yes to a photograph or a soft
 * wash covering a quarter of the slide and no to a flat slide, a vector image, or a thin
 * gradient rule. A wrong guess costs one extra shot (lib/export/slide-picture.js), never a
 * worse file, but the guess is what saves the time.
 *
 * Slow tier: one Chromium launch, no CLI.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const { isContinuousTone } = require('@laticent/calco');

// A real (tiny) raster; the layout, not the pixels, is what is measured.
const JPEG =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDwKiiivzI/uM//2Q==';
const SVG = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>';

const SLIDES = {
  flat: '<h2>Plain text on a color</h2>',
  bar: '<div style="position:absolute;left:0;top:0;width:100%;height:4px;background:linear-gradient(90deg,#003d66,#6cb516)"></div><h2>A thin gradient rule</h2>',
  wash: '<div style="position:absolute;inset:0;background:radial-gradient(60% 60% at 12% 18%,#9cc,transparent)"></div><h2>A soft wash</h2>',
  bgPhoto: `<div style="position:absolute;inset:0;background:url('${JPEG}') center/cover"></div><h2>A photo behind</h2>`,
  imgPhoto: `<img src="${JPEG}" style="position:absolute;left:0;top:0;width:640px;height:720px"><h2>A photo beside</h2>`,
  smallPhoto: `<img src="${JPEG}" style="position:absolute;right:20px;top:20px;width:120px;height:80px"><h2>A thumbnail</h2>`,
  svgBg: `<div style="position:absolute;inset:0;background:url('${SVG}') center/cover"></div><h2>A vector</h2>`,
  svgImg: `<img src="${SVG}" style="position:absolute;inset:0;width:1280px;height:720px"><h2>A vector image</h2>`,
};

describe('isContinuousTone in Chromium', () => {
  let browser;
  let page;
  before(async () => {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    const html = Object.entries(SLIDES)
      .map(([k, v]) => `<section id="${k}" style="position:relative;width:1280px;height:720px;overflow:hidden;background:#fff">${v}</section>`)
      .join('');
    await page.setContent(`<!doctype html><body style="margin:0">${html}</body>`, { waitUntil: 'load' });
  });
  after(async () => {
    await browser?.close();
  });
  const tone = async (id) => (await page.$(`#${id}`)).evaluate(isContinuousTone);

  test('a photograph, as a background or an image, covering a quarter or more is continuous tone', async () => {
    assert.equal(await tone('bgPhoto'), true);
    assert.equal(await tone('imgPhoto'), true);
  });

  test('a soft gradient wash covering the slide is continuous tone', async () => {
    assert.equal(await tone('wash'), true);
  });

  test('flat text, a thin gradient rule, a thumbnail and vector images are not', async () => {
    assert.equal(await tone('flat'), false);
    assert.equal(await tone('bar'), false, 'a 4px rule is not a quarter of the slide');
    assert.equal(await tone('smallPhoto'), false, 'a thumbnail is not a quarter of the slide');
    assert.equal(await tone('svgBg'), false, 'an SVG is flat vector art, not a photograph');
    assert.equal(await tone('svgImg'), false);
  });
});
