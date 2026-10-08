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
        pillInk: document.querySelector('code.pill calco-hide') ? cs('code.pill calco-hide').color : cs('code.pill').color,
        h1: document.querySelector('h1 calco-hide') ? cs('h1 calco-hide').color : cs('h1').color,
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
    assert.equal(hidden.pillInk, 'rgba(0, 0, 0, 0)');
    assert.equal(hidden.pillBg, shown.pillBg, 'the pill background survives');
    assert.equal(hidden.svgFill, shown.svgFill, 'the SVG icon keeps its currentColor');
    assert.equal(hidden.after, shown.after, 'the ::after number keeps its color');
    assert.equal(hidden.ell, shown.ell, 'text left in the picture is not hidden');
    assert.equal(hidden.rot, shown.rot);
    await s.evaluate(restoreSlide);
    assert.equal(await page.evaluate(() => document.documentElement.outerHTML), before, 'the DOM is back exactly');
    await s.evaluate(restoreSlide); // a second restore is a no-op
  });

  test('a list marker keeps its color: the owner is never recolored (html-to-image clones no ::marker)', { timeout: 60000 }, async () => {
    await page.setContent('<section id="m" style="width:600px;height:300px;color:#123456"><ul><li>Item one</li></ul></section>');
    const m = await page.$('#m');
    await m.evaluate(readSlide, { hide: true });
    const after = await page.evaluate(() => ({ li: getComputedStyle(document.querySelector('li')).color, marker: getComputedStyle(document.querySelector('li'), '::marker').color, ink: getComputedStyle(document.querySelector('li calco-hide')).color }));
    assert.deepEqual(after, { li: 'rgb(18, 52, 86)', marker: 'rgb(18, 52, 86)', ink: 'rgba(0, 0, 0, 0)' });
    await m.evaluate(restoreSlide);
    assert.equal(await page.evaluate(() => document.querySelector('li').innerHTML), 'Item one');
  });

  test('a wrapper that would move text falls back to freezing colors, and still restores exactly', { timeout: 60000 }, async () => {
    // `p > :first-child` gets a margin: wrapping the text node makes the wrapper that child.
    await page.setContent('<style>p > :first-child { margin-left: 40px; }</style><section id="f" style="width:600px;height:300px"><p>Shifted text</p></section>');
    const f = await page.$('#f');
    const before = await page.evaluate(() => document.body.innerHTML);
    const res = await f.evaluate(readSlide, { hide: true });
    assert.equal(res.hidden, true);
    const state = await page.evaluate(() => ({ wrapped: !!document.querySelector('calco-hide'), color: getComputedStyle(document.querySelector('p')).color }));
    assert.deepEqual(state, { wrapped: false, color: 'rgba(0, 0, 0, 0)' }, 'fell back to the color freeze');
    await f.evaluate(restoreSlide);
    assert.equal(await page.evaluate(() => document.body.innerHTML), before);
  });

  test('a wrapper that would change only PAINT (a :first-child background) also falls back', { timeout: 60000 }, async () => {
    // `<p>Plain <b>hi</b>`: wrapping "Plain" makes <b> no longer the first child, and its
    // yellow background would vanish from the picture while every word stays put.
    await page.setContent('<style>p > b:first-child { background: rgb(255, 255, 0); }</style><section id="g" style="width:600px;height:300px"><p>Plain <b>hi</b></p></section>');
    const g = await page.$('#g');
    const res = await g.evaluate(readSlide, { hide: true });
    assert.equal(res.hidden, true);
    const state = await page.evaluate(() => ({ wrapped: !!document.querySelector('calco-hide'), bg: getComputedStyle(document.querySelector('b')).backgroundColor }));
    assert.deepEqual(state, { wrapped: false, bg: 'rgb(255, 255, 0)' });
    await g.evaluate(restoreSlide);
  });
});

// The cases the adversarial review of the first cut found (decision note §5): each one
// shipped a wrong box or a wrong word before its fix.
const REVIEW_FIXTURE = `<!doctype html><html><head><style>
  body { margin: 0; font-family: sans-serif; }
  section { width: 1280px; height: 720px; position: relative; background: #fff; color: #000; }
  section > * { position: absolute; margin: 0; font-size: 20px; line-height: 28px; }
  .ws { left: 40px; top: 20px; }
  .agenda { left: 40px; top: 70px; list-style: none; padding: 0; }
  .agenda li::before { content: "01"; display: inline-block; width: 60px; }
  .pill { left: 40px; top: 120px; }
  .pill code { padding: 0 16px; background: #eee; }
  .stage { left: 40px; top: 180px; width: 600px; height: 120px; overflow: clip; }
  .stage h1 { position: static; margin: 0; font-size: 72px; line-height: 0.8; }
  .fx1 { left: 700px; top: 20px; filter: opacity(0); }
  .fx2 { left: 700px; top: 60px; clip-path: inset(50%); }
  .fx3 { left: 700px; top: 100px; -webkit-mask-image: linear-gradient(transparent, transparent); mask-image: linear-gradient(transparent, transparent); }
  .fx4 { left: 700px; top: 140px; clip: rect(0 0 0 0); }
  .stroke { left: 700px; top: 180px; -webkit-text-stroke: 1px red; }
  .rtl { left: 40px; top: 340px; width: 160px; direction: rtl; }
  .blank { left: 40px; top: 500px; font: 16px/22px monospace; }
  .wrapcode { left: 700px; top: 340px; width: 220px; font: 16px/22px monospace; white-space: pre-wrap; }
  .chip { left: 40px; top: 600px; font-size: 28px; }
  .chip code { font-size: 14px; padding: 0 4px; background: #eee; }
  .grad { left: 700px; top: 560px; width: 400px; padding: 10px; background: #003366 linear-gradient(90deg, #00aa00 0 6px, transparent 6px); }
  .grad p { margin: 0; color: rgba(255, 255, 255, 0.76); letter-spacing: 3px; font-size: 14px; }
  .grad .plain { letter-spacing: normal; }
  .tall { left: 40px; top: 20px; width: 600px; font: 20px/1.5 sans-serif; }
  .sc { left: 40px; top: 680px; font-size: 18px; }
  .sc .k { font-variant: small-caps; }
  .sc code { font: 14px monospace; padding: 0 3px; }
  .lig { left: 400px; top: 680px; font-size: 22px; letter-spacing: 0.5px; }
  .vpill { left: 700px; top: 640px; width: 120px; text-align: center; font-size: 14px; }
  .vpill::before { content: ""; display: inline-block; width: 24px; height: 12px; background: #063; }
  .rpill { left: 900px; top: 640px; width: 200px; text-align: right; font-size: 14px; }
  .rpill::after { content: ""; display: inline-block; width: 30px; height: 12px; background: #600; }
</style></head><body>
<section id="r">
  <p class="ws"><b>bold</b> <i>italic</i></p>
  <ol class="agenda"><li>Why</li></ol>
  <p class="pill">A <code>pill</code> after</p>
  <div class="stage"><h1>Overhang</h1></div>
  <p class="fx1">filtered away</p><p class="fx2">clipped away</p><p class="fx3">masked away</p><p class="fx4">rect away</p>
  <p class="stroke">stroked</p>
  <p class="rtl">שלום עולם זה טקסט ארוך שעובר כמה שורות</p>
  <pre class="blank">first

third</pre>
  <pre class="wrapcode">const value = "a long string that wraps";</pre>
  <p class="chip"><code>render</code> is derived</p>
  <div class="grad"><p>THE PREMISE</p><p class="plain">Not spaced</p></div>
  <p class="sc"><span class="k">Pain</span> scale <code>roadmap</code> now render</p>
  <p class="lig">office first</p>
  <p class="vpill">Speed</p>
  <p class="rpill">Ends early</p>
  <p class="tall">one two three four five<br>six <span style="font-size: 40px">BIG</span> seven<br>eight nine ten</p>
</section></body></html>`;

describe('calco reader: the review cases', () => {
  let browser;
  let res;
  before(async () => {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.setContent(REVIEW_FIXTURE, { waitUntil: 'load' });
    res = await (await page.$('#r')).evaluate(readSlide);
  });
  after(async () => {
    await browser?.close();
  });
  const plain = (f) => f.lines.map((l) => l.map((r) => r.text).join('')).join('\n');
  const find = (re) => res.frames.find((f) => re.test(plain(f)));

  test('the space between two inline elements survives', () => {
    assert.equal(plain(find(/bold/)).replace(/ /g, ''), 'bold italic');
  });

  test('a line pushed right by a ::before marker starts after the marker', () => {
    const why = find(/Why/);
    assert.ok(why.x >= 40 + 55, `the box starts at ${why.x}, on top of the 60px marker`);
  });

  test('a padded inline pill keeps its room as a spacer run', () => {
    const runs = find(/pill/).lines[0];
    const spacers = runs.filter((r) => r.text === ' ');
    assert.ok(spacers.length >= 1, 'a spacer stands in for the padding');
    assert.ok(spacers.every((r) => r.style.letterSpacing > 8), JSON.stringify(spacers.map((r) => r.style.letterSpacing)));
  });

  test('a heading whose glyph box overhangs a clipping stage is still read', () => {
    assert.ok(find(/Overhang/), 'the heading became a text box');
  });

  test('filtered, clip-path, masked, clip and stroked text stays in the picture', () => {
    for (const re of [/filtered/, /clipped/, /masked/, /rect away/, /stroked/]) assert.equal(find(re), undefined, `${re} was read`);
  });

  test('right-to-left text splits into its lines', () => {
    assert.ok(find(/שלום/).lines.length >= 2);
  });

  test('a blank line in code comes back as an empty line, so the next keeps its place', () => {
    const code = find(/first/);
    assert.deepEqual(code.lines.map((l) => l.map((r) => r.text).join('')), ['first', '', 'third']);
    assert.ok(Math.abs(code.lineHeight - 22) < 0.5, `pitch ${code.lineHeight}`);
  });

  test('soft-wrapped preformatted code keeps every character, split where it wrapped', () => {
    const code = find(/const value/);
    assert.ok(code.lines.length >= 2, `${code.lines.length} line(s)`);
    assert.equal(code.lines.map((l) => l.map((r) => r.text).join('')).join(''), 'const value = "a long string that wraps";');
  });

  test('a small padded code chip keeps its room even under the in-style threshold', () => {
    const runs = find(/is derived/).lines[0];
    const at = runs.findIndex((r) => r.text.includes('render'));
    assert.ok(runs.slice(at + 1).some((r) => r.style.size === 2), JSON.stringify(runs.map((r) => [r.text, r.style.size])));
  });

  test('letter-spaced translucent text over a gradient is flattened (LibreOffice clips it otherwise)', () => {
    assert.equal(find(/THE PREMISE/).lines[0][0].style.flatColor, '#c2ceda');
    assert.equal(find(/Not spaced/).lines[0][0].style.flatColor, undefined, 'unspaced text keeps its opacity over a gradient');
  });

  test('a taller inline in prose never adds a blank line', () => {
    assert.deepEqual(find(/BIG/).lines.map((l) => l.map((r) => r.text).join('')), ['one two three four five', 'six BIG seven', 'eight nine ten']);
  });

  test('a centered label beside a ::before icon is centered on its text, not under the icon', () => {
    const f = find(/^Speed$/);
    const word = f.lines[0][0];
    assert.equal(word.text, 'Speed');
    // The box is symmetric around the word, so centering it in an office file puts the word back.
    assert.ok(f.x >= 700 + 20, `the box starts at ${f.x}, over the 24px icon`);
  });

  test('a right-aligned line that ends before a ::after icon keeps its end', () => {
    const f = find(/Ends early/);
    assert.ok(f.x + f.w <= 900 + 200 - 25, `the box ends at ${f.x + f.w}, over the 30px icon`);
  });

  test('small caps are read, and tracked text is read without ligatures (as Chrome draws it)', () => {
    const sc = find(/scale/).lines[0];
    assert.equal(sc.find((r) => r.text.includes('Pain')).style.smallCaps, true);
    assert.equal(sc.find((r) => r.text.includes('scale')).style.smallCaps, undefined);
    assert.equal(find(/office first/).lines[0][0].style.ligatures, false);
  });

  test('a space after a code chip is drawn in the body font, not the chip font', () => {
    const runs = find(/now render/).lines[0];
    const i = runs.findIndex((r) => r.text.includes('roadmap'));
    const code = runs[i].style;
    assert.ok(!/\s$/.test(runs[i].text), `the chip run "${runs[i].text}" carries no trailing space`);
    const space = runs.slice(i + 1).find((r) => r.text.startsWith(' ') || r.text === ' ');
    assert.ok(space, JSON.stringify(runs.map((r) => r.text)));
    assert.notEqual(space.style.family, code.family);
  });
});

// Native shapes (engineering/decisions/2026-10-07-calco-native-shapes.md): which boxes leave
// the picture as shapes, which stay because something above them would be covered or left
// behind, how a card groups with what is inside it, and how the paint is hidden and restored.
const SHAPES = `<!doctype html><html><head><style>
  body { margin: 0; font-family: sans-serif; }
  section { width: 1280px; height: 720px; position: relative; background: #ffffff; color: #112233; }
  .card { position: absolute; width: 300px; height: 160px; background: #f2f5fa; border: 1px solid #898e95; border-radius: 10px; box-sizing: border-box; }
  .card p { margin: 0; position: absolute; left: 20px; top: 60px; font-size: 18px; line-height: 24px; }
  #c1 { left: 40px; top: 40px; border-bottom: 3px solid #2e608a; }
  #c1 .tag { position: absolute; left: 0; top: 0; padding: 4px 10px; background: #2e608a; color: #fff; font-size: 12px; line-height: 16px; border-radius: 10px 0 7px 0; }
  #c2 { left: 380px; top: 40px; }
  #c3 { left: 720px; top: 40px; }
  #c3::before { content: "1"; position: absolute; left: 0; top: 0; padding: 2px 6px; background: #006fa8; color: #fff; }
  #c4 { left: 40px; top: 260px; }
  #c4 ul { position: absolute; left: 30px; top: 20px; margin: 0; padding: 0 0 0 20px; font-size: 16px; }
  #c5 { left: 380px; top: 260px; border-radius: 40px / 10px; }
  #c6 { left: 720px; top: 260px; border: 0; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25); }
  #ring { position: absolute; left: 1060px; top: 40px; padding: 4px 8px; background: #fff; box-shadow: inset 0 0 0 1px #6b7f9a; font-size: 12px; }
  h2 { position: absolute; left: 40px; top: 470px; width: 600px; margin: 0; font-size: 28px; line-height: 40px; border-bottom: 2px solid #898e95; }
  #under { position: absolute; left: 720px; top: 470px; width: 200px; height: 80px; background: #eef; }
  #over { position: absolute; left: 700px; top: 460px; width: 300px; height: 120px; background: linear-gradient(90deg, rgba(255,0,0,.2), transparent); }
  #back { position: absolute; left: 1000px; top: 450px; width: 260px; height: 200px; z-index: -1; background: radial-gradient(circle, #ddd, transparent); }
  #onback { position: absolute; left: 1040px; top: 500px; width: 180px; height: 100px; background: #eef; }
  #seg { position: absolute; left: 40px; top: 560px; width: 100px; height: 2.5px; padding-top: 16px; background: #006fa8; background-clip: content-box; }
  #bimg { position: absolute; left: 200px; top: 560px; width: 100px; height: 40px; border: 6px solid red; border-image: linear-gradient(green, blue) 1; }
  #pre { position: absolute; left: 340px; top: 560px; width: 120px; height: 80px; }
  #pre::before { content: ""; position: absolute; left: 0; top: 0; width: 60px; height: 60px; background: red; }
  #pre div { width: 100px; height: 50px; background: #00f; }
  #two { position: absolute; left: 500px; top: 560px; width: 100px; height: 60px; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.3), 0 8px 24px rgba(0,0,0,.15); }
</style></head><body>
<section id="sh">
  <div class="card" id="c1"><span class="tag">Build</span><p>Owns the policy.</p></div>
  <div class="card" id="c2"><svg width="24" height="24" style="position:absolute;right:12px;top:12px"><circle cx="12" cy="12" r="10" fill="#006fa8"/></svg><p>Has an icon.</p></div>
  <div class="card" id="c3"><p>Counted tag.</p></div>
  <div class="card" id="c4"><ul><li>One point</li><li>Two points</li></ul></div>
  <div class="card" id="c5"><p>Elliptical.</p></div>
  <div class="card" id="c6"><p>Shadowed.</p></div>
  <span id="ring">Plain tag</span>
  <h2>A rule under a heading</h2>
  <div id="back"></div>
  <div id="under"></div>
  <div id="over"></div>
  <div id="onback"></div>
  <div id="seg"></div>
  <div id="bimg"></div>
  <div id="pre"><div></div></div>
  <div id="two"></div>
</section></body></html>`;

describe('calco reader: native shapes', () => {
  let browser;
  let page;
  let res;
  before(async () => {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.setContent(SHAPES, { waitUntil: 'load' });
    res = await (await page.$('#sh')).evaluate(readSlide, { shapes: true });
  });
  after(async () => {
    await browser?.close();
  });
  const textOf = (frame) => frame.lines.map((l) => l.map((r) => r.text).join('')).join('\n');
  const boxAt = (x, y) => res.shapes.find((s) => s.kind === 'box' && Math.abs(s.x - x) < 1 && Math.abs(s.y - y) < 1);

  test('no shapes unless asked', async () => {
    const plain = await (await page.$('#sh')).evaluate(readSlide);
    assert.deepEqual(plain.shapes, []);
  });

  test('a card lifts with its outline, its accent edge as a rule, and its tag carrying its text', () => {
    const card = boxAt(40, 40);
    assert.ok(card, JSON.stringify(res.shapes));
    assert.deepEqual(card.fill, { color: '#f2f5fa', alpha: 1 });
    assert.deepEqual(card.stroke, { color: '#898e95', alpha: 1, width: 1 });
    assert.deepEqual(card.radii, [10, 10, 10, 10]);
    const accent = res.shapes.find((s) => s.kind === 'line' && s.side === 'bottom' && s.stroke.color === '#2e608a');
    assert.ok(accent, 'the 3px bottom border is a rule');
    assert.equal(accent.stroke.width, 3);
    assert.ok(Math.abs(accent.y - (40 + 160 - 1.5)) < 0.01, `the rule runs along the middle of its band: ${accent.y}`);
    assert.deepEqual(accent.wrap, [10, 10]);
    const tag = res.shapes.find((s) => s.text !== undefined && textOf(res.frames[s.text]) === 'Build');
    assert.ok(tag, 'the tag carries its word');
    assert.deepEqual(tag.radii, [10, 0, 7, 0]);
    // One group: the card, its rule, its tag and its paragraph.
    const g = res.shapes.indexOf(card);
    assert.equal(card.group, g);
    assert.equal(accent.group, g);
    assert.equal(tag.group, g);
    assert.equal(res.frames.find((f) => textOf(f) === 'Owns the policy.').group, g);
    assert.equal(res.frames[tag.text].group, undefined, 'the carried text is the label, not a group member');
  });

  test('a card stays in the picture when something it would cover stays there: an icon, a ::before tag, list markers', () => {
    assert.equal(boxAt(380, 40), undefined, 'the card with an SVG icon');
    assert.equal(boxAt(720, 40), undefined, 'the card with a counted ::before tag');
    assert.equal(boxAt(40, 260), undefined, 'the card holding a bulleted list');
    assert.equal(res.frames.find((f) => textOf(f) === 'Has an icon.').group, undefined);
  });

  test('elliptical corners stay in the picture; a shadow and an inset ring are carried', () => {
    assert.equal(boxAt(380, 260), undefined);
    const shadowed = boxAt(720, 260);
    assert.ok(shadowed);
    assert.deepEqual(shadowed.shadow, { color: '#000000', alpha: 0.25, x: 0, y: 2, blur: 8 });
    const ring = res.shapes.find((s) => s.kind === 'box' && s.stroke && s.stroke.color === '#6b7f9a');
    assert.ok(ring, 'an inset 1px ring is the outline');
    assert.equal(ring.stroke.width, 1);
    assert.equal(textOf(res.frames[ring.text]), 'Plain tag');
  });

  test('a heading rule is a line; a box under a later overlay stays; one over a z-index -1 backdrop lifts', () => {
    const rule = res.shapes.find((s) => s.kind === 'line' && s.stroke.width === 2);
    assert.ok(rule);
    assert.equal(rule.h, 0);
    assert.equal(rule.group, undefined);
    assert.equal(boxAt(720, 470), undefined, 'the overlay paints above it');
    assert.ok(boxAt(1040, 500), 'the backdrop paints below it');
  });

  test('a fill clipped to its content box is that box; border-image, two shadows and a covered child stay', () => {
    const seg = res.shapes.find((s) => s.kind === 'box' && s.fill?.color === '#006fa8' && Math.abs(s.x - 40) < 1);
    assert.ok(seg, 'the padded accent segment lifts');
    assert.ok(Math.abs(seg.y - 576) < 0.5 && Math.abs(seg.h - 2.5) < 0.1, `the fill is the content box: ${JSON.stringify(seg)}`);
    assert.equal(res.shapes.find((s) => Math.abs(s.x - 200) < 4 && Math.abs(s.y - 560) < 4), undefined, 'a border-image box');
    assert.equal(boxAt(340, 560), undefined, 'a static child under its parent\'s absolutely placed ::before');
    assert.equal(boxAt(500, 560), undefined, 'two outer shadow layers');
  });

  test('hiding takes the paint out without moving anything, and restore is exact', async () => {
    const s = await page.$('#sh');
    const before = await page.evaluate(() => document.documentElement.outerHTML);
    const probe = () => {
      const cs = getComputedStyle(document.querySelector('#c1'));
      const r = document.querySelector('#c1 p').getBoundingClientRect();
      return { bg: cs.backgroundColor, bottom: cs.borderBottomColor, width: cs.borderBottomWidth, tag: getComputedStyle(document.querySelector('#c1 .tag')).backgroundColor, p: [r.left, r.top], c2: getComputedStyle(document.querySelector('#c2')).backgroundColor };
    };
    const shown = await page.evaluate(probe);
    const hiddenRes = await s.evaluate(readSlide, { hide: true, shapes: true });
    assert.equal(hiddenRes.hidden, true);
    const hidden = await page.evaluate(probe);
    assert.equal(hidden.bg, 'rgba(0, 0, 0, 0)');
    assert.equal(hidden.bottom, 'rgba(0, 0, 0, 0)');
    assert.equal(hidden.tag, 'rgba(0, 0, 0, 0)');
    assert.equal(hidden.width, shown.width, 'border widths stay');
    assert.deepEqual(hidden.p, shown.p, 'nothing moves');
    assert.equal(hidden.c2, shown.c2, 'a card that stays in the picture keeps its paint');
    await s.evaluate(restoreSlide);
    assert.equal(await page.evaluate(() => document.documentElement.outerHTML), before);
  });
});

// Two ways a lifted box could still hide paint (followups 2556-p3-calco-shapes-latent-covers):
// the slide's OWN ::after placed over a card, and a transition on the card's colors.
const COVER_FIXTURE = `<!doctype html><html><head><style>
  body { margin: 0; font-family: sans-serif; }
  section { width: 1280px; height: 720px; position: relative; background: #ffffff; }
  .card { position: absolute; left: 100px; top: 100px; width: 300px; height: 200px; padding: 16px; box-sizing: border-box; background: rgb(240, 240, 250); border-radius: 8px; box-shadow: rgba(0, 0, 0, 0.2) 0 4px 12px; }
  .card p { margin: 0; font-size: 18px; }
  #stamp::after { content: ""; position: absolute; left: 150px; top: 150px; width: 100px; height: 100px; background: rgb(255, 0, 0); }
  .slow, .slow p { transition: all 2s; }
</style></head><body>
  <section id="stamp"><div class="card"><p>Under a stamp</p></div></section>
  <section id="slow"><div class="card slow"><p>Transition</p></div></section>
</body></html>`;

describe('calco reader: native shapes and what covers them', () => {
  let browser;
  let page;
  before(async () => {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.setContent(COVER_FIXTURE, { waitUntil: 'load' });
  });
  after(async () => {
    await browser?.close();
  });

  test("a card under the slide's own ::after stays in the picture", async () => {
    const res = await (await page.$('#stamp')).evaluate(readSlide, { shapes: true });
    assert.equal(res.shapes.length, 0);
  });

  test('a transition on the colors neither keeps the box in the picture nor animates it back', async () => {
    const s = await page.$('#slow');
    const look = () => page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('#slow .card'));
      return [cs.backgroundColor, cs.boxShadow, getComputedStyle(document.querySelector('#slow p')).color, document.getAnimations().length];
    });
    const shown = await look();
    const before = await page.evaluate(() => document.documentElement.outerHTML);
    const res = await s.evaluate(readSlide, { hide: true, shapes: true });
    assert.equal(res.shapes.length, 1);
    assert.deepEqual((await look()).slice(0, 2), ['rgba(0, 0, 0, 0)', 'none'], 'the box is gone at once, not fading');
    await s.evaluate(restoreSlide);
    assert.deepEqual(await look(), shown, 'box and text back at once, with nothing animating');
    assert.equal(await page.evaluate(() => document.documentElement.outerHTML), before, 'restore is exact');
  });
});
