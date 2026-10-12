/**
 * Integration: how the shared PDF writer's reader (lib/core/pdf-compose/read-slide.mjs) reads an
 * SVG `<text>` into drawn words, run in a real Chromium page on synthetic slides.
 *
 * The reader takes each character's fill from the element that holds its text node (Mermaid paints a
 * sequence participant's name on the `<tspan>` and gives the `<text>` the box's fill, #2577). The
 * checker on that change found the edges, and each is a case here:
 *   TSPAN FILL    the `<tspan>`'s fill is the drawn color, not the `<text>`'s
 *   SAME INK      a tspan with the same ink stays one run
 *   OPACITY       a tspan with another opacity is its own run (a run once kept its first character's opacity)
 *   MIXED FILL    a `<text>` with a gradient-filled word beside a solid one is NOT drawn (drawing the solid
 *                 word hid the whole element from the photo and lost the gradient word)
 *   NO INK        a `<text>` with no solid ink anywhere is not drawn, and is not a refusal
 *   CAPITALIZE    a colored span inside a word does not move the case the writer draws (`Abcd ef`, as before)
 *
 * FALSIFIABLE: with the reader taking the `<text>`'s own fill, TSPAN FILL fails; with a run extended on
 * color alone, OPACITY fails; with a character that has no ink skipped, MIXED FILL fails.
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

let browser;
let page;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-read-svg-'));
before(async () => {
  browser = await puppeteer.launch({ executablePath: resolveChrome?.() || process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--allow-file-access-from-files'] });
  page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
});
after(async () => {
  await browser?.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** Read one slide holding `svgInner` and return its SVG words as { t, color, op } plus the writer's stats. */
async function read(svgInner, css = '') {
  // A file page, not `setContent`: the reader is a module imported by file URL, which a null-origin page may not do.
  const file = path.join(tmp, 'slide.html');
  fs.writeFileSync(file, `<!doctype html><meta charset="utf-8"><style>body{margin:0}section{width:1280px;height:720px;position:relative;background:#fff}${css}</style>
    <section><svg width="600" height="200" viewBox="0 0 600 200" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#00f"/></linearGradient></defs>${svgInner}</svg></section>`);
  await page.goto(`file://${file}`);
  await page.addScriptTag({ type: 'module', content: `import { readSlide } from '${READER}'; const r = readSlide(document.querySelector('section')); window.__out = { words: r.words.filter((w) => w.svg).map((w) => ({ t: w.t, color: w.color && w.color.slice(0, 3).join(','), op: +w.op.toFixed(3) })), stats: r.stats };` });
  await page.waitForFunction('window.__out', { timeout: 20000 });
  return page.evaluate(() => window.__out);
}

test('TSPAN FILL: the name is drawn in the tspan’s color, not the box’s', async () => {
  const r = await read('<text class="actor" x="10" y="40" font-size="16">Alice</text>', 'text.actor{fill:#bcd5ec} text.actor>tspan{fill:#0a1628} ');
  // The same shape Mermaid writes: the <text> carries the box fill, the <tspan> the readable one.
  const m = await read('<text class="actor" x="10" y="40" font-size="16"><tspan x="10">Alice</tspan></text>', 'text.actor{fill:#bcd5ec} text.actor>tspan{fill:#0a1628}');
  assert.deepEqual(m.words.map((w) => [w.t, w.color]), [['Alice', '10,22,40']]);
  assert.equal(r.words[0].color, '188,213,236', 'a plain <text> keeps its own fill');
});

test('SAME INK: a tspan with the same color and opacity stays one run', async () => {
  const r = await read('<text x="10" y="40" font-size="16" fill="#f00">ab<tspan fill="#f00">cd</tspan>ef</text>');
  assert.deepEqual(r.words.map((w) => w.t), ['abcdef']);
});

test('OPACITY: a tspan with its own opacity is its own run', async () => {
  const r = await read('<text x="10" y="40" font-size="16" fill="#f00"><tspan fill-opacity="0.3">ab</tspan>cd</text>');
  assert.deepEqual(r.words.map((w) => [w.t, w.op]), [['ab', 0.3], ['cd', 1]]);
});

test('MIXED FILL: a gradient word beside a solid one leaves the whole element in the photo', async () => {
  const r = await read('<text x="10" y="40" font-size="16" fill="url(#g)">GRAD<tspan fill="#000">solid</tspan></text>');
  assert.deepEqual(r.words, [], 'neither word is drawn: the browser paints both in the photo');
  assert.equal(r.stats.refusedText['svg-mixed-fill'], 1, 'and the report says why');
  const rev = await read('<text x="10" y="40" font-size="16" fill="#000">solid<tspan fill="url(#g)">GRAD</tspan></text>');
  assert.deepEqual(rev.words, []);
});

test('NO INK: a text with no solid ink is not drawn and is not a refusal', async () => {
  const r = await read('<text x="10" y="40" font-size="16" fill="none">hidden</text><text x="10" y="80" font-size="16" fill="url(#g)">grad</text>');
  assert.deepEqual(r.words, []);
  assert.equal(r.stats.refusedText['svg-mixed-fill'] ?? 0, 0);
});

test('CAPITALIZE: a colored span in the middle of a word changes nothing about the case the writer draws', async () => {
  // The writer has always capitalized only the first letter of an SVG text (`transformCase`); a split must not move it.
  const r = await read('<text x="10" y="40" font-size="16" fill="#f00" style="text-transform:capitalize">ab<tspan fill="#00f">cd</tspan> ef</text>');
  assert.equal(r.words.map((w) => w.t).join(''), 'Abcd ef');
  assert.equal(r.words.length, 3, 'a run per stretch of one color: red, blue, red again');
});
