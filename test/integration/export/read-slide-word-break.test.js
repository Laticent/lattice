/**
 * Integration: the shared PDF writer's reader (lib/core/pdf-compose/read-slide.mjs `linePieces`) reads a
 * word the browser broke across two lines, in a real Chromium page.
 *
 * The Yearn deck at portrait (owner, 2026-11-05) printed "straightforw" / "   ard." for a cover title the
 * browser had set "straightfor-" / "ward.": a one-character range at a break inside a word reports a box at
 * the end of the line above as well as its own, so the bounding box put the next line's first letter on the
 * wrong line, and the dash the browser drew is not text, so it was never written. Cases:
 *   HYPHENATED  `hyphens: auto` breaks "straightforward" with a dash: the first piece ends in "-" and every
 *               letter of the second piece sits on the second line, starting at the line's left edge
 *   FORCED      `overflow-wrap: break-word` with no hyphenation: the pieces carry no dash, and the second
 *               piece starts at the left edge too
 *   ONE LINE    a word that fits is one piece, no dash
 *
 * FALSIFIABLE: with the reader back on `getBoundingClientRect()` (the code before this fix), HYPHENATED fails:
 * the second piece's first letter rides the first line and no dash is written (measured: 1 of 3 fail). FORCED
 * passes on both, because a forced break reports no extra box; it pins that the dash is never invented there.
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-read-break-'));
before(async () => {
  browser = await puppeteer.launch({ executablePath: resolveChrome?.() || process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--allow-file-access-from-files'] });
  page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
});
after(async () => {
  await browser?.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** Read one slide holding a 300px-wide heading with `style`, and return its words with their line tops. */
async function read(text, style) {
  const file = path.join(tmp, 'slide.html');
  fs.writeFileSync(file, `<!doctype html><html lang="en"><meta charset="utf-8"><style>body{margin:0}section{width:1280px;height:720px;position:relative;background:#fff}h1{margin:0;width:300px;font:700 60px sans-serif;${style}}</style>
    <section><h1>${text}</h1></section></html>`);
  await page.goto(`file://${file}`);
  await page.addScriptTag({ type: 'module', content: `import { readSlide } from '${READER}'; const r = readSlide(document.querySelector('section')); window.__out = r.words.map((w) => ({ t: w.t, x: Math.round(w.x), top: Math.round(w.top), join: !!w.joinNext }));` });
  await page.waitForFunction('window.__out', { timeout: 20000 });
  return page.evaluate(() => window.__out);
}

test('HYPHENATED: the first piece ends with the dash, and the second starts the next line', async () => {
  const w = await read('straightforward', 'hyphens:auto;overflow-wrap:break-word');
  assert.equal(w.length, 2, JSON.stringify(w));
  assert.match(w[0].t, /-$/, 'the dash the browser drew is written');
  assert.equal(w[0].t.replace(/-$/, '') + w[1].t, 'straightforward');
  assert.ok(w[1].top > w[0].top, 'the second piece is on the next line');
  assert.ok(w[1].x <= 2, `the second piece starts at the line's left edge (x=${w[1].x})`);
  assert.equal(w[0].join, true);
});

test('FORCED: a break with no hyphenation writes no dash, and the second piece starts the next line', async () => {
  const w = await read('straightforwardnesses', 'hyphens:manual;overflow-wrap:break-word');
  assert.ok(w.length >= 2, JSON.stringify(w));
  assert.ok(w.every((x) => !x.t.endsWith('-')), JSON.stringify(w));
  assert.equal(w.map((x) => x.t).join(''), 'straightforwardnesses');
  for (let i = 1; i < w.length; i++) {
    assert.ok(w[i].top > w[i - 1].top, `piece ${i} is on its own line`);
    assert.ok(w[i].x <= 2, `piece ${i} starts at the left edge (x=${w[i].x})`);
  }
});

test('ONE LINE: a word that fits is one piece with no dash', async () => {
  const w = await read('fits', 'hyphens:auto');
  assert.deepEqual(w.map((x) => x.t), ['fits']);
});
