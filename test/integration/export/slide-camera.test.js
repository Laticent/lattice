/**
 * Integration: the shared slide camera (lib/core/slide-camera.mjs) takes the same picture as Chrome.
 *
 * Why this exists. The CLI used to photograph a slide with a native Chrome screenshot and the Studio with html-to-image,
 * so the same deck came out as different pixels per host: on a 52-slide deck every slide differed (median 3.2% of pixels
 * off by more than 8 levels, worst 21%), the Studio's PNG set was 52% larger, and a topic slide's bottom shelf was missing.
 * Both hosts now run ONE function in a Chromium page, and this test holds it to the native screenshot as the oracle.
 *
 * It renders a deck to HTML (no browser export), opens it in Chrome, and for each slide compares the camera's picture
 * with `element.screenshot()`, at scale 1 (every deck) and at scale 2 (one slide of each deck). The bar is 0.1% of pixels differing by more than 8 levels:
 * measured, the camera is at 0.0065% on 52 real slides, html-to-image was at 4.3% on average.
 *
 * The bar is 40x tighter than where html-to-image sat (4.3% average, measured), so a camera that copies computed styles
 * and floors font sizes fails it on text-heavy slides. Needs Chromium and the camera bundle (`npm run build`).
 */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..', '..', '..');
const BUNDLE = path.join(ROOT, 'dist', 'lattice-pdf-compose-min.js');
// topic: the shelf; cards: a card slide; a11y and print-mode: chart wedges and swatches filled with `url(#pattern)` from page-level <defs>.
const DECKS = ['examples/topic.md', 'examples/cards-stats-actors-kpi.md', 'examples/a11y.md', 'examples/print-mode.md'];
const MAX_SLIDES = 8;
const BAR = 0.1; // percent of pixels differing by more than 8 levels

// Runs in the page: one camera shot as base64 PNG. The test page is a file:// page opened with file access, so a plain fetch reads a picture.
const TAKE = `window.takeSlide = async (el, scale) => {
  const { bytes } = await globalThis.LatticePdfCompose.captureSlide(el, { scale, toDataUri: async (u) => { const b = await (await fetch(u)).blob(); return await new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); }); } });
  let s = ''; for (let k = 0; k < bytes.length; k += 0x8000) s += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
  return btoa(s);
};`;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-camera-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

function render(deck) {
  const out = path.join(tmp, `${path.basename(deck, '.md')}.html`);
  const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), path.join(ROOT, deck), out, '--quiet'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return out;
}

function pixelsOff(a, b, PNG) {
  const A = PNG.sync.read(a);
  const B = PNG.sync.read(b);
  assert.equal(A.width, B.width, 'same width');
  assert.equal(A.height, B.height, 'same height');
  let off = 0;
  // The first two rows are a screenshot-clip artifact of the oracle (white above the slide), not the camera.
  for (let i = A.width * 2 * 4; i < A.data.length; i += 4) {
    const d = Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2]));
    if (d > 8) off++;
  }
  return (off / (A.width * (A.height - 2))) * 100;
}

for (const deck of DECKS) {
  test(`the slide camera matches Chrome's own screenshot: ${deck}`, { timeout: 240_000 }, async () => {
    assert.ok(fs.existsSync(BUNDLE), 'run `npm run build` first (dist/lattice-pdf-compose-min.js)');
    const puppeteer = require('puppeteer');
    const { PNG } = require('pngjs');
    const html = render(deck);
    const launch = { headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] };
    if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
    const browser = await puppeteer.launch(launch);
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
      await page.goto(pathToFileURL(html).href);
      await new Promise((r) => setTimeout(r, 1200));
      await page.addScriptTag({ content: fs.readFileSync(BUNDLE, 'utf8') });
      await page.addScriptTag({ content: TAKE });
      const handles = (await page.$$('section[data-lattice-slide]')).slice(0, MAX_SLIDES);
      assert.ok(handles.length > 0, 'the deck rendered slides');
      for (const [i, h] of handles.entries()) {
        await h.evaluate((el) => el.scrollIntoView());
        const native = Buffer.from(await h.screenshot({ type: 'png' }));
        const b64 = await h.evaluate((el) => takeSlide(el, 1));
        const off = pixelsOff(native, Buffer.from(b64, 'base64'), PNG);
        assert.ok(off <= BAR, `${deck} slide ${i + 1}: ${off.toFixed(3)}% of pixels differ from Chrome's screenshot (bar ${BAR}%)`);
      }
      // Scale 2: the camera draws the SVG at the target resolution; Chrome's own at device scale 2 is the oracle.
      await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
      const h2 = (await page.$$('section[data-lattice-slide]'))[0];
      await h2.evaluate((el) => el.scrollIntoView());
      const native2 = Buffer.from(await h2.screenshot({ type: 'png' }));
      const b64x2 = await h2.evaluate((el) => takeSlide(el, 2));
      const off2 = pixelsOff(native2, Buffer.from(b64x2, 'base64'), PNG);
      assert.ok(off2 <= BAR, `${deck} slide 1 at scale 2: ${off2.toFixed(3)}% of pixels differ (bar ${BAR}%)`);
    } finally {
      await browser.close();
    }
  });
}

// What reviewers found the camera got wrong, each as a slide the old screenshot path drew correctly. The page is a plain HTML
// file so the case is exactly one feature; the oracle is Chrome's own screenshot of it.
test('the slide camera draws what an author can put on a slide: control characters, relative urls, <picture>, <video poster>, SVG <defs>', { timeout: 240_000 }, async () => {
  assert.ok(fs.existsSync(BUNDLE), 'run `npm run build` first');
  const puppeteer = require('puppeteer');
  const { PNG } = require('pngjs');
  // A 40x40 red square and a 40x40 blue one, as PNG files beside the page.
  const sq = (r, g, b) => { const p = new PNG({ width: 40, height: 40 }); for (let i = 0; i < p.data.length; i += 4) { p.data[i] = r; p.data[i + 1] = g; p.data[i + 2] = b; p.data[i + 3] = 255; } return PNG.sync.write(p); };
  fs.writeFileSync(path.join(tmp, 'red.png'), sq(220, 20, 20));
  fs.writeFileSync(path.join(tmp, 'blue.png'), sq(20, 20, 220));
  const page_ = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:#fff} section{width:1280px;height:720px;position:relative;font:32px sans-serif;background:#f4f1ea}
    .bg{position:absolute;left:40px;top:300px;width:200px;height:200px;background:url(red.png) 0 0/40px 40px}
    .pic{position:absolute;left:300px;top:300px;width:200px;height:200px}.pic img{width:200px;height:200px}
    .vid{position:absolute;left:560px;top:300px;width:200px;height:200px}
    .tex{position:absolute;left:820px;top:300px;width:200px;height:200px;fill:url(#p1)}
  </style></head><body><svg width="0" height="0" aria-hidden="true" style="position:absolute"><defs><pattern id="p1" patternUnits="userSpaceOnUse" width="8" height="8"><rect width="8" height="8" fill="#223"/><path d="M0 0L8 8" stroke="#fc0" stroke-width="2"/></pattern></defs></svg>
    <main id="deck"><section data-lattice-slide="1"><p style="margin:20px">Form\u000Cfeed and vertical\u000Btab</p>
      <div class="bg"></div><picture class="pic"><source srcset="blue.png"><img src="red.png" alt=""></picture>
      <video class="vid" poster="blue.png"></video><svg class="tex" viewBox="0 0 200 200"><rect width="200" height="200"/></svg></section></main></body></html>`.replace(/\\u000C/g, '\u000C').replace(/\\u000B/g, '\u000B');
  const file = path.join(tmp, 'features.html');
  fs.writeFileSync(file, page_);
  const launch = { headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] };
  if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  const browser = await puppeteer.launch(launch);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(file).href);
    await new Promise((r) => setTimeout(r, 500));
    await page.addScriptTag({ content: fs.readFileSync(BUNDLE, 'utf8') });
    await page.addScriptTag({ content: TAKE });
    const h = (await page.$$('section[data-lattice-slide]'))[0];
    const camera = PNG.sync.read(Buffer.from(await h.evaluate((el) => takeSlide(el, 1)), 'base64'));
    // Where each feature sits, and what colour proves it drew (a picture by its red, a poster by its blue, a texture by its yellow).
    const px = (x, y) => { const i = (y * camera.width + x) * 4; return [camera.data[i], camera.data[i + 1], camera.data[i + 2]]; };
    const near = (c, want, tol = 40) => c.every((v, k) => Math.abs(v - want[k]) <= tol);
    assert.ok(near(px(100, 400), [220, 20, 20]), 'a relative url() background draws (red expected)');
    // The browser picks the <source> (blue.png) over the <img>'s own src (red.png); the camera must draw what the browser chose.
    assert.ok(near(px(400, 400), [20, 20, 220]), 'a <picture> draws the source the browser chose (blue expected)');
    assert.ok(near(px(660, 400), [20, 20, 220]), 'a <video poster> draws as its poster (blue expected)');
    let textured = 0;
    for (let y = 300; y < 500; y += 3) for (let x = 820; x < 1020; x += 3) if (near(px(x, y), [255, 204, 0], 60)) textured++;
    assert.ok(textured > 50, `a pattern fill from page-level <defs> draws (found ${textured} yellow stripe samples)`);
  } finally {
    await browser.close();
  }
});
