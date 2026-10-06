/**
 * Integration: Calco's reader in a real Chromium (docs/src/lib/calco/reader.ts).
 *
 * The reader measures laid-out text, so only a browser can test it. One fixture slide
 * holds every case that went wrong while it was built
 * (engineering/decisions/2026-10-06-calco-office-export-library.md §5):
 *   - a code pill whose background is mixed from `currentColor` must keep its pill when the
 *     text is hidden, and so must an SVG icon drawn in `currentColor` and a `::after` number;
 *   - preformatted code keeps the spaces between highlighted tokens;
 *   - an ellipsized line is NOT read and NOT hidden: a text box cannot show the `…`;
 *   - rotated text and SVG text stay in the picture;
 *   - translucent text over a solid background gets a blended color;
 *   - `restoreSlide` puts the DOM back exactly.
 *
 * Slow tier: one Chromium launch, no CLI.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const { readSlide, restoreSlide } = require('@laticent/calco');

const FIXTURE = `<!doctype html><html><head><style>
  body { margin: 0; font-family: sans-serif; }
  section { width: 1280px; height: 720px; position: relative; background: #ffffff; color: #112233; }
  h1 { position: absolute; left: 100px; top: 40px; width: 1080px; margin: 0; font-size: 48px; line-height: 60px; text-align: center; }
  p.wrap { position: absolute; left: 100px; top: 140px; width: 300px; margin: 0; font-size: 24px; line-height: 36px; }
  code.pill { background: color-mix(in srgb, currentColor 15%, transparent); color: #aa0000; }
  pre { position: absolute; left: 100px; top: 300px; margin: 0; font: 16px/24px monospace; color: #003300; }
  .ell { position: absolute; left: 700px; top: 140px; width: 120px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 20px; }
  .rot { position: absolute; left: 700px; top: 300px; transform: rotate(-30deg); font-size: 20px; }
  .num::after { content: "7"; position: absolute; right: 20px; bottom: 20px; color: #445566; }
  .faint { position: absolute; left: 700px; top: 400px; color: rgba(0, 0, 0, 0.5); font-size: 20px; letter-spacing: 3px; }
  svg { position: absolute; left: 1000px; top: 400px; color: #0055ff; }
</style></head><body>
<section class="num" id="s">
  <h1>Centered title</h1>
  <p class="wrap">A paragraph that wraps across lines with <b>bold</b> and <code class="pill">a pill</code> inside.</p>
  <pre><span class="k">function</span> <span class="f">go</span>(a,  b) {
  return a;
}</pre>
  <div class="ell">This line is far too long to fit</div>
  <div class="rot">Tilted</div>
  <div class="faint">Half ink</div>
  <svg width="40" height="40"><rect width="40" height="40" fill="currentColor"/><text x="5" y="25">S</text></svg>
</section></body></html>`;

describe('calco reader in Chromium', () => {
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

  const textOf = (frame) => frame.lines.map((l) => l.map((r) => r.text).join('')).join('\n');

  test('reads paragraphs, lines, runs and alignment as the browser drew them', { timeout: 60000 }, async () => {
    const s = await page.$('#s');
    const res = await s.evaluate(readSlide);
    const texts = res.frames.map(textOf);
    assert.equal(res.width, 1280);
    const title = res.frames.find((f) => textOf(f) === 'Centered title');
    assert.ok(title, `no title in ${JSON.stringify(texts)}`);
    assert.equal(title.align, 'center');
    const para = res.frames.find((f) => textOf(f).startsWith('A paragraph'));
    assert.ok(para.lines.length > 1, 'the paragraph wraps');
    assert.ok(Math.abs(para.lineHeight - 36) < 0.5, `line pitch ${para.lineHeight}`);
    assert.equal(textOf(para).replace(/\n/g, ' '), 'A paragraph that wraps across lines with bold and a pill inside.');
    const runs = para.lines.flat();
    assert.ok(runs.some((r) => r.text.includes('bold') && r.style.weight >= 700), 'the bold run');
    assert.ok(runs.some((r) => r.text.includes('pill') && r.style.color === '#aa0000'), 'the pill run keeps its color');
  });

  test('code keeps the spaces between tokens, and its own line breaks', { timeout: 60000 }, async () => {
    const res = await (await page.$('#s')).evaluate(readSlide);
    const code = res.frames.find((f) => textOf(f).startsWith('function'));
    assert.equal(textOf(code), 'function go(a,  b) {\n  return a;\n}');
  });

  test('ellipsized, rotated and SVG text stay in the picture; translucent text is flattened', { timeout: 60000 }, async () => {
    const res = await (await page.$('#s')).evaluate(readSlide);
    const all = res.frames.map(textOf).join('|');
    assert.doesNotMatch(all, /far too long/);
    assert.doesNotMatch(all, /Tilted/);
    assert.doesNotMatch(all, /\bS\b/);
    const faint = res.frames.find((f) => textOf(f) === 'Half ink').lines[0][0].style;
    assert.equal(faint.alpha, 0.5);
    assert.equal(faint.flatColor, '#808080', 'black at 50% over white');
    assert.equal(faint.letterSpacing, 3);
  });

  test('hiding keeps currentColor art, pseudo-elements and skipped text; restore is exact', { timeout: 60000 }, async () => {
    const s = await page.$('#s');
    const before = await page.evaluate(() => document.documentElement.outerHTML);
    const probe = () => {
      const cs = (sel, pseudo) => getComputedStyle(document.querySelector(sel), pseudo);
      return {
        pillBg: cs('code.pill').backgroundColor,
        pillColor: cs('code.pill').color,
        h1: cs('h1').color,
        svgFill: getComputedStyle(document.querySelector('svg rect')).fill,
        after: cs('#s', '::after').color,
        ell: cs('.ell').color,
        rot: cs('.rot').color,
      };
    };
    const shown = await page.evaluate(probe);
    const res = await s.evaluate(readSlide, { hide: true });
    assert.equal(res.hidden, true);
    const hidden = await page.evaluate(probe);
    assert.equal(hidden.h1, 'rgba(0, 0, 0, 0)', 'read text is hidden');
    assert.equal(hidden.pillColor, 'rgba(0, 0, 0, 0)');
    assert.equal(hidden.pillBg, shown.pillBg, 'the pill background survives');
    assert.equal(hidden.svgFill, shown.svgFill, 'the SVG icon keeps its currentColor');
    assert.equal(hidden.after, shown.after, 'the ::after number keeps its color');
    assert.equal(hidden.ell, shown.ell, 'text left in the picture is not hidden');
    assert.equal(hidden.rot, shown.rot);
    await s.evaluate(restoreSlide);
    assert.equal(await page.evaluate(() => document.documentElement.outerHTML), before, 'the DOM is back exactly');
    await s.evaluate(restoreSlide); // a second restore is a no-op
  });
});
