/**
 * Integration: a finish's screen grain is on a live screen and nowhere else.
 *
 * WebKit (Safari) does not dither a CSS gradient, so a dark glow draws as flat bands; a faint noise tile on the finish's
 * mask layer (`--backdrop-grain`, lib/base/base.finish.css § SCREEN GRAIN) breaks them up. It must never reach an export:
 * noise in a photographed slide is the worst case for its size (a picture .pptx grew 16% before the camera marked its
 * clones). The checks, on the real exported player and the real slide camera (dist/lattice-pdf-compose-min.js):
 *   1. the live player paints the grain on a finish slide;
 *   2. the export face (`.lattice-exporting`), a native screenshot fallback (`captureScreenshot`, which marks the
 *      slide `lattice-capturing` for the shot) and print switch it off (the video switches it off in its own style: lib/export/video.mjs);
 *   3. the slide camera, on its default SCREEN face (a PNG set, a picture .pptx), photographs the slide without it: its
 *      picture equals the picture of the same slide with the grain forced off, byte for byte.
 * FALSIFIABLE: without the camera's `lattice-capturing` class, check 3's two pictures differ (the noise); without the
 * fallback's mark, check 2's capture arm reads the tile. Needs Chromium.
 */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const { captureScreenshot } = require('../../../lib/export/slide-picture');

const ROOT = path.join(__dirname, '..', '..', '..');
const BUNDLE = path.join(ROOT, 'dist', 'lattice-pdf-compose-min.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-grain-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const DECK = ['---', 'marp: true', 'theme: indaco', '---', '', '<!-- _class: statement finish-nimbus dark -->', '', '## Blooms on a dark canvas', '', 'Body.', ''].join('\n');

/** The deck exported as HTML (`player`: the self-contained player, whose prune drops rules that match nothing yet). */
async function withPage(player, fn) {
  const src = path.join(tmp, 'deck.md');
  const html = path.join(tmp, player ? 'player.html' : 'deck.html');
  fs.writeFileSync(src, DECK);
  const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), src, html, ...(player ? ['--player'] : []), '--quiet'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const puppeteer = require('puppeteer');
  const launch = { headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] };
  if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  const browser = await puppeteer.launch(launch);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    await page.goto(`file://${html}`, { waitUntil: 'load' });
    await page.waitForSelector('section.finish > .backdrop > .backdrop-mask');
    return await fn(page);
  } finally {
    await browser.close();
  }
}

/** The mask layer's computed background-image, after `prep` runs in the page. */
const maskImage = (page, prep) => page.evaluate((prepSrc) => {
  const section = document.querySelector('section.finish');
  // eslint-disable-next-line no-new-func
  new Function('section', prepSrc)(section);
  return getComputedStyle(section.querySelector(':scope > .backdrop > .backdrop-mask')).backgroundImage;
}, prep);

test('the exported player paints the grain live', { timeout: 180_000 }, async () => {
  await withPage(true, async (page) => {
    assert.match(await maskImage(page, ''), /data:image\/png/, 'the live player paints the grain');
  });
});

test('the grain is on the live screen, and off on the export face, on a capture page and in print', { timeout: 180_000 }, async () => {
  await withPage(false, async (page) => {
    assert.match(await maskImage(page, ''), /data:image\/png/, 'the live screen paints the grain');
    assert.doesNotMatch(await maskImage(page, "section.classList.add('lattice-exporting')"), /data:image\/png/, 'the export face');
    await maskImage(page, "section.classList.remove('lattice-exporting')");
    // The real fallback, with the shot swapped for a read of the mask layer while the mark is on.
    const el = await page.$('section.finish');
    const during = await captureScreenshot({ evaluate: el.evaluate.bind(el), screenshot: () => maskImage(page, '') }, {});
    assert.doesNotMatch(during, /data:image\/png/, 'a native screenshot fallback');
    assert.match(await maskImage(page, ''), /data:image\/png/, 'and the mark is gone after the shot');
    await page.emulateMediaType('print');
    assert.doesNotMatch(await maskImage(page, ''), /data:image\/png/, 'print');
  });
});

test('the slide camera photographs the screen face without the grain', { timeout: 180_000 }, async () => {
  assert.ok(fs.existsSync(BUNDLE), 'run `npm run build` first (dist/lattice-pdf-compose-min.js)');
  await withPage(false, async (page) => {
    await page.addScriptTag({ path: BUNDLE });
    const shoot = () => page.evaluate(async () => {
      const el = document.querySelector('section.finish');
      const { bytes } = await globalThis.LatticePdfCompose.captureSlide(el, { scale: 1 });
      return Array.from(bytes);
    });
    const withGrainLive = await shoot();
    await page.addStyleTag({ content: 'section.finish { --backdrop-grain: none !important; }' });
    const withGrainOff = await shoot();
    assert.equal(withGrainLive.length, withGrainOff.length, 'the camera picture is the same size with the grain switched off by hand');
    assert.ok(withGrainLive.every((b, i) => b === withGrainOff[i]), 'and the same bytes: the camera never photographs the grain');
  });
});
