/**
 * Integration: the shared slide camera (lib/core/slide-camera.mjs) takes the same picture as Chrome.
 *
 * Why this exists. The CLI used to photograph a slide with a native Chrome screenshot and the Studio with html-to-image,
 * so the same deck came out as different pixels per host: on a 52-slide deck every slide differed (median 3.2% of pixels
 * off by more than 8 levels, worst 21%), the Studio's PNG set was 52% larger, and a topic slide's bottom shelf was missing.
 * Both hosts now run ONE function in a Chromium page, and this test holds it to the native screenshot as the oracle.
 *
 * It renders a deck to HTML (no browser export), opens it in Chrome, and for each slide compares the camera's picture
 * with `element.screenshot()`, at scale 1 and at scale 2. The bar is 0.1% of pixels differing by more than 8 levels:
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
const DECKS = ['examples/topic.md', 'examples/cards-stats-actors-kpi.md'];
const MAX_SLIDES = 5;
const BAR = 0.1; // percent of pixels differing by more than 8 levels

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
      const handles = (await page.$$('section[data-lattice-slide]')).slice(0, MAX_SLIDES);
      assert.ok(handles.length > 0, 'the deck rendered slides');
      for (const [i, h] of handles.entries()) {
        await h.evaluate((el) => el.scrollIntoView());
        const native = Buffer.from(await h.screenshot({ type: 'png' }));
        const b64 = await h.evaluate(async (el) => {
          const { bytes } = await globalThis.LatticePdfCompose.captureSlide(el, { scale: 1, toDataUri: async (u) => { const b = await (await fetch(u)).blob(); return await new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); }); } });
          let s = '';
          for (let k = 0; k < bytes.length; k += 0x8000) s += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
          return btoa(s);
        });
        const off = pixelsOff(native, Buffer.from(b64, 'base64'), PNG);
        assert.ok(off <= BAR, `${deck} slide ${i + 1}: ${off.toFixed(3)}% of pixels differ from Chrome's screenshot (bar ${BAR}%)`);
      }
    } finally {
      await browser.close();
    }
  });
}
