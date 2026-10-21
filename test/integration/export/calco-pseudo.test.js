/**
 * Integration: Calco lifts a pseudo-element's paint into native shapes, in a real Chromium
 * (docs/src/lib/calco/reader.ts: `liftPseudo`, `measurePseudo`, `markOf`).
 *
 * The DOM has no rectangle for `::before`, so the reader swaps a PROBE with the pseudo's layout
 * for one read. These cases are the shapes the engine's own pills and panels use:
 *   - a pill (`inline-flex`) whose `::before` is a disc FLEX ITEM and whose `::after` is an
 *     absolutely placed mask overlay with `translateY(-50%)` (the `state` / `badge` recipe);
 *   - an absolutely placed accent bar (`panel::after`);
 *   - an in-flow BLOCK `::before` (a rule above the content);
 * and what must NOT lift: generated text (a counter), and a mask that is not an inline SVG path.
 * The pill, its dot and its mark are one group: one object to move.
 *
 * Slow tier: one Chromium launch, no CLI.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const { readSlide, restoreSlide } = require('@laticent/calco');

const CHECK = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M6 12.6l4 4 8-9' fill='none' stroke='black' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'/></svg>\")";
const CIRCLE = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><circle cx='12' cy='12' r='8'/></svg>\")";

const FIXTURE = `<!doctype html><html><head><style>
  body { margin: 0; font-family: sans-serif; }
  section { width: 1280px; height: 720px; position: relative; background: #fff; color: #112233; }
  .pill { position: absolute; left: 40px; top: 40px; display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 999px; background: #e8f5ec; font-size: 16px; line-height: 20px; box-sizing: border-box; }
  .pill::before { content: ''; display: inline-block; flex: none; width: 14px; height: 14px; border-radius: 50%; background: #bfe3c9; box-sizing: border-box; }
  .pill::after { content: ''; position: absolute; left: 14px; top: 50%; transform: translateY(-50%); width: 14px; height: 14px; background-color: #16a34a; -webkit-mask: ${CHECK} center / 100% 100% no-repeat; mask: ${CHECK} center / 100% 100% no-repeat; }
  .panel { position: absolute; left: 40px; top: 160px; width: 300px; height: 120px; background: #f2f5fa; border-radius: 8px; box-sizing: border-box; }
  .panel::after { content: ''; position: absolute; right: 0; top: 0; width: 6px; height: 100%; background: #c00; }
  .bar { position: absolute; left: 400px; top: 160px; width: 260px; padding: 0 12px 12px; background: #fff7e6; box-sizing: border-box; }
  .bar::before { content: ''; display: block; height: 4px; margin-bottom: 8px; background: #036; }
  .counted { position: absolute; left: 700px; top: 160px; width: 200px; height: 80px; background: #eef; }
  .counted::before { content: '01'; position: absolute; left: 6px; top: 6px; color: #00a; font-size: 14px; }
  .oddmask { position: absolute; left: 40px; top: 340px; width: 80px; height: 40px; background: #eef; }
  .oddmask::after { content: ''; position: absolute; left: 8px; top: 8px; width: 24px; height: 24px; background-color: #a0a; -webkit-mask: ${CIRCLE} center / 100% 100% no-repeat; mask: ${CIRCLE} center / 100% 100% no-repeat; }
  .rot { position: absolute; left: 200px; top: 340px; width: 80px; height: 40px; background: #eef; }
  .rot::before { content: ''; position: absolute; left: 8px; top: 8px; width: 24px; height: 24px; background: #d70; transform: rotate(20deg); }
</style></head><body>
<section id="s">
  <div class="pill" id="pill">Passed</div>
  <div class="panel" id="panel"><p style="margin:0;position:absolute;left:12px;top:12px">Panel body</p></div>
  <div class="bar" id="bar"><p style="margin:0">Under a rule</p></div>
  <div class="counted" id="counted"></div>
  <div class="oddmask" id="oddmask"></div>
  <div class="rot" id="rot"></div>
</section></body></html>`;

const COUNTERS = `<!doctype html><html><head><style>
  body { margin: 0; font-family: sans-serif; }
  section { width: 1280px; height: 720px; position: relative; background: #fff; color: #112233; }
  .steps { position: absolute; left: 40px; margin: 0; padding: 0; list-style: none; counter-reset: step; width: 300px; }
  #s1 { top: 20px; } #s2 { top: 200px; }
  .steps li { counter-increment: step; }
  .steps li::before { content: "STEP " counter(step, decimal-leading-zero); display: block; font-size: 12px; line-height: 14px; }
  .nest { position: absolute; left: 400px; top: 20px; margin: 0; padding: 0 0 0 20px; list-style: none; width: 300px; }
  .nest ul { counter-reset: n; margin: 0; padding-left: 20px; list-style: none; }
  .nest { counter-reset: n; }
  .nest li { counter-increment: n; }
  .nest li::before { content: counters(n, ".") " "; display: inline; }
  .alpha { position: absolute; left: 800px; top: 20px; margin: 0; padding: 0; list-style: none; counter-reset: k; }
  .alpha li { counter-increment: k; }
  .alpha li::before { content: counter(k, lower-alpha) ") "; display: inline-block; width: 20px; }
  .roman::before { content: counter(r, upper-roman); }
  .quote { position: absolute; left: 800px; top: 200px; width: 300px; }
  .quote::before { content: open-quote; }
  .quote::after { content: close-quote; }
</style></head><body>
<section id="s">
  <ol class="steps" id="s1"><li>One</li><li>Two</li><li>Three</li></ol>
  <ol class="steps" id="s2"><li>Again</li></ol>
  <ul class="nest"><li>x<ul><li>y</li><li>z</li></ul></li><li>w</li></ul>
  <ul class="alpha"><li>first</li><li>second</li></ul>
  <p class="quote">spoken</p>
</section></body></html>`;

describe('calco reads generated text, with CSS counters worked out', () => {
  let browser;
  let page;
  let res;
  before(async () => {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.setContent(COUNTERS, { waitUntil: 'load' });
    res = await (await page.$('#s')).evaluate(readSlide, { shapes: true });
  });
  after(async () => {
    await browser?.close();
  });
  const texts = () => res.frames.map((f) => f.lines.map((l) => l.map((r) => r.text).join('')).join('|'));

  test('a counter is numbered in its list and restarts in the next one', () => {
    const t = texts();
    assert.deepEqual(t.filter((x) => /^STEP/.test(x)), ['STEP 01', 'STEP 02', 'STEP 03', 'STEP 01']);
  });

  test('counters() joins the nested values, and alpha and quote content are written out', () => {
    const t = texts().join('\n');
    assert.match(t, /1 x/);
    assert.match(t, /1\.1 y/);
    assert.match(t, /1\.2 z/);
    assert.match(t, /2 w/);
    assert.match(t, /a\) {1,}first|a\)\s*first/);
    assert.match(t, /b\)\s*second/);
    assert.match(t, /\u201Cspoken\u201D/, 'open-quote and close-quote');
  });

  test('the page is exactly as found after a hide and a restore', async () => {
    const s = await page.$('#s');
    const before = await page.evaluate(() => document.documentElement.outerHTML);
    await s.evaluate(readSlide, { hide: true, shapes: true });
    assert.ok(await page.evaluate(() => document.querySelectorAll('calco-pseudo').length > 0), 'stand-ins are in place while hidden');
    await s.evaluate(restoreSlide);
    assert.equal(await page.evaluate(() => document.documentElement.outerHTML), before, 'no stand-in, attribute or rule left');
    // And a plain read cleans up after itself.
    await s.evaluate(readSlide, {});
    assert.equal(await page.evaluate(() => document.documentElement.outerHTML), before);
  });
});

describe('calco lifts pseudo-elements in Chromium', () => {
  let browser;
  let page;
  let res;
  before(async () => {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.setContent(FIXTURE, { waitUntil: 'load' });
    res = await (await page.$('#s')).evaluate(readSlide, { shapes: true });
  });
  after(async () => {
    await browser?.close();
  });

  const near = (a, b, tol = 0.6) => Math.abs(a - b) <= tol;
  const at = (x, y, kind = 'box', pseudo = undefined) => res.shapes.findIndex((s) => s.kind === kind && near(s.x, x) && near(s.y, y) && (pseudo === undefined || !!s.pseudo === pseudo));
  const rectOf = async (sel) => page.evaluate((q) => {
    const r = document.querySelector(q).getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }, sel);

  test('a pill is a shape that carries its text, with its dot and its mark as shapes grouped with it', async () => {
    const pillRect = await rectOf('#pill');
    const pill = at(pillRect.x, pillRect.y, 'box', false);
    assert.ok(pill >= 0, `the pill: ${JSON.stringify(res.shapes)}`);
    assert.equal(res.shapes[pill].text !== undefined, true, 'its own dot and mark do not stop it carrying its word');
    const dot = res.shapes.findIndex((s) => s.kind === 'box' && s.pseudo && near(s.w, 14) && near(s.h, 14));
    assert.ok(dot >= 0, 'the ::before dot, a flex item, is a shape');
    // The dot sits at the pill's left padding, centered in its height.
    assert.ok(near(res.shapes[dot].x, pillRect.x + 14), `x ${res.shapes[dot].x}`);
    assert.ok(near(res.shapes[dot].y + 7, pillRect.y + pillRect.h / 2), 'centered vertically');
    assert.equal(res.shapes[dot].radii[0], 7, 'a circle');
    const mark = res.shapes.findIndex((s) => s.kind === 'path');
    assert.ok(mark >= 0, 'the ::after mask is a path');
    const m = res.shapes[mark];
    assert.equal(m.pseudo, true);
    assert.equal(m.cap, 'round');
    assert.equal(m.join, 'round');
    assert.deepEqual(m.stroke.color, '#16a34a');
    assert.ok(near(m.stroke.width, 2.5 * (14 / 24), 0.05), `stroke scales with the mark: ${m.stroke.width}`);
    // The mark sits inside the dot (translateY(-50%) was applied).
    const d = res.shapes[dot];
    assert.ok(m.x >= d.x - 1 && m.x + m.w <= d.x + d.w + 1 && m.y >= d.y - 1 && m.y + m.h <= d.y + d.h + 1, 'inside the dot');
    // One object: all three are in the pill's group.
    const g = res.shapes[pill].group;
    assert.equal(g, pill);
    assert.equal(res.shapes[dot].group, pill);
    assert.equal(m.group, pill);
    assert.equal(res.frames.filter((f) => f.group === pill).length, 0, 'the carried text is the label, not a member');
  });

  test('a mark is drawn above its pill and its dot, in paint order', () => {
    const pill = res.shapes.findIndex((s) => s.kind === 'box' && !s.pseudo && s.text !== undefined);
    const dot = res.shapes.findIndex((s) => s.kind === 'box' && s.pseudo && near(s.w, 14));
    const mark = res.shapes.findIndex((s) => s.kind === 'path');
    assert.ok(pill < dot && dot < mark, `${pill} < ${dot} < ${mark}`);
  });

  test('an absolutely placed accent bar and an in-flow block rule are shapes of their own', async () => {
    const panel = await rectOf('#panel');
    const bar = res.shapes.findIndex((s) => s.pseudo && near(s.w, 6) && near(s.h, 120) && near(s.x, panel.x + panel.w - 6));
    assert.ok(bar >= 0, 'the ::after accent bar');
    const card = at(panel.x, panel.y, 'box', false);
    assert.equal(res.shapes[bar].group, card, 'grouped with its panel');
    const barBox = await rectOf('#bar');
    const rule = res.shapes.findIndex((s) => s.pseudo && near(s.h, 4) && near(s.x, barBox.x + 12) && near(s.y, barBox.y));
    assert.ok(rule >= 0, `the in-flow block ::before: ${JSON.stringify(res.shapes.filter((s) => s.pseudo))}`);
    assert.ok(near(res.shapes[rule].w, 260 - 24), 'as wide as the content box');
  });

  test('a mask that is not a path, and a rotated pseudo, stay in the picture; generated text is read', async () => {
    const counted = await rectOf('#counted');
    assert.ok(at(counted.x, counted.y, 'box') >= 0, 'a box under generated text lifts: the text is read as text now');
    assert.ok(res.frames.some((f) => f.lines.map((l) => l.map((r) => r.text).join('')).join('') === '01'), 'the "01" is a text frame');
    const odd = await rectOf('#oddmask');
    assert.equal(at(odd.x, odd.y, 'box'), -1, 'a box under a circle-mask overlay stays');
    assert.equal(res.shapes.some((s) => s.pseudo && near(s.x, odd.x + 8)), false, 'a <circle> mask is not lifted');
    const rot = await rectOf('#rot');
    assert.equal(res.shapes.some((s) => s.pseudo && near(s.x, rot.x + 8) && near(s.w, 24)), false, 'a rotated pseudo is not lifted');
  });

  test('hiding takes the pseudo paint out and restore leaves the page exactly as it was', async () => {
    const s = await page.$('#s');
    const before = await page.evaluate(() => document.documentElement.outerHTML);
    const probe = () => page.evaluate(() => {
      const vis = (sel, p) => getComputedStyle(document.querySelector(sel), p).visibility;
      const r = document.querySelector('#pill p, #pill').getBoundingClientRect();
      return { dot: vis('#pill', '::before'), mark: vis('#pill', '::after'), bar: vis('#panel', '::after'), counted: vis('#counted', '::before'), pill: getComputedStyle(document.querySelector('#pill')).backgroundColor, w: r.width };
    });
    const shown = await probe();
    assert.equal(shown.dot, 'visible');
    const r = await s.evaluate(readSlide, { hide: true, shapes: true });
    assert.equal(r.hidden, true);
    const hidden = await probe();
    assert.equal(hidden.dot, 'hidden', 'the lifted dot is hidden');
    assert.equal(hidden.mark, 'hidden', 'the lifted mark is hidden');
    assert.equal(hidden.bar, 'hidden');
    assert.equal(hidden.counted, 'visible', 'an unlifted pseudo keeps painting');
    assert.equal(hidden.pill, 'rgba(0, 0, 0, 0)', 'the pill paint is hidden as before');
    assert.equal(hidden.w, shown.w, 'nothing moved: the dot still takes its room');
    await s.evaluate(restoreSlide);
    assert.equal(await page.evaluate(() => document.documentElement.outerHTML), before, 'no probe, attribute or rule left behind');
  });
});
