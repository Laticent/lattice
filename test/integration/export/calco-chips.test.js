/**
 * Integration: an inline chip (a code span, a mark) is a highlight on its words, not a shape
 * (docs/src/lib/calco/reader.ts, `emit` and `chipEls`; the writers' `highlight`).
 *
 * A shape behind a paragraph does not move or wrap with the paragraph, and a chip that wraps is two boxes,
 * so the chip becomes the run's own background. The tint is blended over what is behind it, since a
 * highlight is opaque. The chip's corners, border and padding are not carried. A chip whose words stay in
 * the picture (a paragraph the reader cannot place) stays in the picture too.
 *
 * Slow tier: one Chromium launch, no CLI.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const { readSlide, restoreSlide } = require('@laticent/calco');

const HTML = `<!doctype html><html><head><style>
  body { margin: 0; font-family: sans-serif; }
  section { width: 1280px; height: 720px; position: relative; background: #fff; color: #123; }
  code { background: rgba(0, 100, 150, .1); border: 1px solid rgba(0, 100, 150, .2); border-radius: 4px; padding: 0 4px; font-family: monospace; }
  p { position: absolute; left: 60px; width: 420px; margin: 0; font-size: 20px; }
  mark { background: #fe0; }
  .wrap { top: 40px; width: 200px; }
  .ok { top: 200px; }
  .card { position: absolute; left: 60px; top: 300px; width: 420px; height: 80px; background: #fcc; }
  .card p { position: static; }
  .cut { top: 450px; width: 260px; }
</style></head><body><section id="s">
  <p class="ok">Set <code>trim: on</code> and <mark>mark</mark> here.</p>
  <p class="wrap">Words <code>one two three four five six</code> end.</p>
  <div class="card"><p>On a card <code>chip</code></p></div>
  <p class="cut">A very long token <code>a-very-long-inline-code-token-that-cannot-fit-on-one-line-at-all</code>.</p>
</section></body></html>`;

describe('calco inline chips as highlights', () => {
  let browser;
  let res;
  before(async () => {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.setContent(HTML, { waitUntil: 'load' });
    const h = await page.$('#s');
    res = await h.evaluate(readSlide, { shapes: true, hide: true });
    res.shapesAfterHide = await h.evaluate((s) => [...s.querySelectorAll('code')].map((c) => getComputedStyle(c).backgroundColor));
    await h.evaluate(restoreSlide);
  });
  after(async () => {
    await browser?.close();
  });
  const runs = () => res.frames.flatMap((f) => f.lines.flat());
  const lit = (text) => runs().filter((r) => r.text.includes(text) && r.style.highlight);

  test('a chip is a highlight on its words, blended over the page behind it; no shape is lifted for it', () => {
    const [chip] = lit('trim');
    assert.ok(chip, JSON.stringify(runs().map((r) => [r.text, r.style.highlight])));
    // rgba(0,100,150,.1) over white
    const near = (a, b) => [1, 3, 5].every((i) => Math.abs(Number.parseInt(a.slice(i, i + 2), 16) - Number.parseInt(b.slice(i, i + 2), 16)) <= 2);
    assert.ok(near(chip.style.highlight, '#e6f0f5'), chip.style.highlight);
    assert.equal(res.shapes.some((s) => s.kind === 'box' && s.h < 40 && s.w < 200 && s.y > 190 && s.y < 240), false);
    assert.ok(lit('mark').length && lit('mark')[0].style.highlight === '#ffee00', 'an opaque mark keeps its color');
  });

  test('a wrapped chip has the highlight on every line', () => {
    const lines = res.frames.find((f) => f.lines.length > 1 && f.lines.flat().some((r) => r.style.highlight));
    assert.ok(lines, 'the wrapped paragraph is text');
    assert.ok(lines.lines.every((l) => l.some((r) => r.style.highlight)) || lines.lines.slice(0, 2).every((l) => l.some((r) => r.style.highlight)));
  });

  test('a chip on a lifted card is blended over the card\'s color', () => {
    const [chip] = lit('chip');
    assert.ok(chip);
    // rgba(0,100,150,.1) over #fcc is darker than over white
    assert.notEqual(chip.style.highlight, '#e6f0f5');
  });

  test('a chip in a paragraph the reader cannot place keeps its paint', () => {
    const [last] = res.shapesAfterHide.slice(-1);
    assert.notEqual(last, 'rgba(0, 0, 0, 0)', 'its words are in the picture, so its background is too');
    assert.equal(lit('a-very-long').length, 0);
  });

  test('the export says it approximated chips', () => {
    assert.ok(res.approximated.filter((a) => a === 'chip-highlight').length >= 3);
  });
});
