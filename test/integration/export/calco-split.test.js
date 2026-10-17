/**
 * Integration: Calco's roles and background split in a real Chromium
 * (docs/src/lib/calco/reader.ts `readSlide` roles, `splitSlide`; lib/export/office-export.js
 * `captureSlides`).
 *
 * A slide is photographed as its own paint (the shared background) and its content over
 * transparency (the foreground). The fixture holds what the engine's slides hold: a fill, a
 * gradient `border-image` rule across the top, a header, a heading with an eyebrow above and
 * a subtitle below, a page number in `.lat-pagination`, and a footer. A second slide blends an
 * element with what is behind it, which a transparent foreground cannot reproduce, so it must
 * fall back to its own opaque picture.
 *
 * Slow tier: one Chromium launch, no CLI.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const { readSlide, splitSlide, restoreSplit } = require('@laticent/calco');
const { captureSlides } = require('../../../lib/export/office-export');

const FIXTURE = `<!doctype html><html><head><style>
  body { margin: 0; font-family: sans-serif; background: transparent; }
  section { width: 1280px; height: 720px; position: relative; isolation: isolate; overflow: hidden; background: #ffffff; color: #112233; border-top: 4px solid; border-image: linear-gradient(90deg, #003d66, #6cb516) 1; box-sizing: border-box; }
  section.dark { background: #003d66; color: #ffffff; }
  header { position: absolute; left: 30px; top: 24px; font-size: 14px; }
  footer { position: absolute; left: 30px; bottom: 20px; font-size: 14px; }
  .lat-pagination { position: absolute; right: 30px; bottom: 20px; font-size: 14px; }
  h2 { position: absolute; left: 64px; top: 120px; margin: 0; font-size: 40px; line-height: 48px; }
  p.eyebrow { position: absolute; left: 64px; top: 90px; margin: 0; font-size: 14px; }
  p.sub { position: absolute; left: 64px; top: 180px; margin: 0; font-size: 20px; }
  .backdrop { position: absolute; inset: 0; z-index: -2; background: linear-gradient(135deg, #e8eef5, #ffffff); }
  .card { position: absolute; left: 64px; top: 300px; width: 400px; height: 200px; background: #f0f4f8; }
  .blend { position: absolute; left: 0; top: 300px; width: 1280px; height: 200px; background: #888888; mix-blend-mode: difference; }
</style></head><body>
<section id="a" data-lattice-slide="1">
  <div class="backdrop"></div>
  <header>Deck · Part</header>
  <p class="eyebrow"><code>Context</code></p>
  <h2>The slide title</h2>
  <p class="sub"><code>A subtitle line</code></p>
  <div class="card"></div>
  <footer>Confidential</footer>
  <span class="lat-pagination">1</span>
</section>
<section id="b" class="dark" data-lattice-slide="2">
  <h2>Blended</h2>
  <div class="blend"></div>
</section>
</body></html>`;

describe('calco roles and background split in Chromium', () => {
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

  test('the page says what each block is: title, eyebrow, subtitle, header, footer, page number', async () => {
    const h = await page.$('#a');
    const read = await h.evaluate(readSlide, {});
    const role = (text) => read.frames.find((f) => textOf(f) === text)?.role;
    assert.equal(role('The slide title'), 'title');
    assert.equal(role('Context'), 'eyebrow');
    assert.equal(role('A subtitle line'), 'subtitle');
    assert.equal(role('Deck · Part'), 'header');
    assert.equal(role('Confidential'), 'footer');
    assert.equal(role('1'), 'number');
  });

  test('splitSlide hides the content for the background and the slide paint for the foreground, and restores both', async () => {
    const h = await page.$('#a');
    const state = () =>
      h.evaluate((el) => ({
        attr: el.getAttribute('data-calco-split'),
        bg: getComputedStyle(el).backgroundColor,
        image: getComputedStyle(el).borderImageSource,
        h2: getComputedStyle(el.querySelector('h2')).visibility,
        backdrop: getComputedStyle(el.querySelector('.backdrop')).visibility,
        styles: document.querySelectorAll('head style').length,
      }));
    const before = await state();
    await h.evaluate(splitSlide, 'background');
    const bg = await state();
    assert.equal(bg.h2, 'hidden');
    assert.equal(bg.backdrop, 'visible', 'the decorative layer under the content is the background');
    assert.equal(bg.bg, before.bg, 'the slide keeps its own fill');
    assert.equal(bg.image, before.image, 'and its rule');
    await h.evaluate(restoreSplit);
    await h.evaluate(splitSlide, 'foreground');
    const fg = await state();
    assert.equal(fg.h2, 'visible');
    assert.equal(fg.backdrop, 'hidden');
    assert.equal(fg.bg, 'rgba(0, 0, 0, 0)');
    assert.equal(fg.image, 'none', 'the border-image rule is the background, not the foreground');
    await h.evaluate(restoreSplit);
    const after = await state();
    assert.deepEqual(after, before, 'the DOM is exactly as it was');
  });

  test('captureSlides shares one background across slides that draw the same thing, and falls back where a blend cannot be split', async () => {
    const handles = await page.$$('section[data-lattice-slide]');
    // Two copies of slide A, so a match is possible.
    await page.evaluate(() => {
      const a = document.getElementById('a');
      const copy = a.cloneNode(true);
      copy.id = 'a2';
      copy.querySelector('.lat-pagination').textContent = '3';
      document.body.insertBefore(copy, document.getElementById('b'));
    });
    const all = await page.$$('section[data-lattice-slide]');
    assert.equal(all.length, 3);
    const { slides, backgrounds } = await captureSlides(all, { type: 'png' }, true);
    assert.equal(slides[0].background, slides[1].background, 'two slides, one background');
    assert.notEqual(slides[0].background, undefined);
    assert.ok(backgrounds[slides[0].background].image, 'a gradient rule means a picture, not a flat color');
    assert.equal(slides[2].background, undefined, 'the blend slide keeps its own opaque picture');
    assert.ok(slides[2].image.length > 0);
    assert.equal(handles.length, 2);
    // Nothing is left hidden or split.
    for (const h of all) assert.equal(await h.evaluate((el) => el.hasAttribute('data-calco-split')), false);
  });

  test('a slide that paints only a flat color shares a flat-color background, with no picture', async () => {
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('section')) el.style.border = '0';
      document.querySelector('#b .blend')?.remove();
      for (const el of document.querySelectorAll('.backdrop')) el.remove();
    });
    const all = await page.$$('section[data-lattice-slide]');
    const { slides, backgrounds } = await captureSlides(all, { type: 'png' }, true);
    for (const s of slides) assert.notEqual(s.background, undefined);
    assert.ok(backgrounds.every((b) => b.color && !b.image), 'flat color, no image');
    assert.deepEqual(backgrounds.map((b) => b.color).sort(), ['#003d66', '#ffffff']);
  });
});
