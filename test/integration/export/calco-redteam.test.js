/**
 * Integration: the failures a red-team pass found in the branch, one fixture each
 * (docs/src/lib/calco/reader.ts, lib/export/office-export.js). Each test is a hostile or careless deck.
 *
 *   split     a slide's content that outranks the background split must not be baked into a shared background
 *   hidden    text the slide hides (scaled to nothing, nearly clear, closed details) is not read as live text
 *   important a pseudo whose `content` is `!important` is read as text OR kept in the picture, never both
 *   counter   a roman numeral past 3999 is the decimal CSS shows
 *   mask      a mask path that leaves its box, or is not finite, stays in the picture
 *   gradient  a gradient tile larger than its box, or stops outside 0..1, stays in the picture
 *   throw     a read that throws leaves the page as it found it
 *   many      thousands of picture items still export in bounded time
 *
 * Slow tier: one Chromium launch, no CLI.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const { readSlide, restoreSlide, captureOfficeSlides } = require('@laticent/calco');
const { captureSlides } = require('../../../lib/export/office-export');

const page = (css, body, n = 1) => `<!doctype html><html><head><style>body{margin:0;font-family:sans-serif} section{width:1280px;height:720px;position:relative;background:#fff;color:#123;isolation:isolate} ${css}</style></head><body>${Array.from({ length: n }, (_, i) => `<section data-lattice-slide="${i + 1}" id="s${i + 1}">${typeof body === 'function' ? body(i) : body}</section>`).join('')}</body></html>`;

describe('calco red-team fixtures', () => {
  let browser;
  let tab;
  before(async () => {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    tab = await browser.newPage();
    await tab.setViewport({ width: 1280, height: 720 });
  });
  after(async () => {
    await browser?.close();
  });
  const load = (html) => tab.setContent(html, { waitUntil: 'load' });
  const read = async (html, options = { shapes: true, hide: true }) => {
    await load(html);
    const h = await tab.$('#s1');
    const res = await h.evaluate(readSlide, options);
    await h.evaluate(restoreSlide);
    return res;
  };
  const words = (res) => res.frames.flatMap((f) => f.lines.flat()).map((r) => r.text).join(' ');

  test('split: content that outranks the background split is not baked into a shared background', async () => {
    await load(
      page('', (i) => (i === 0 ? '<p style="visibility:visible !important;position:absolute;left:100px;top:100px;font-size:40px">LEAK_FROM_SLIDE_ONE</p>' : '<p>plain</p>'), 3),
    );
    const { backgrounds } = await captureSlides(await tab.$$('section[data-lattice-slide]'), { type: 'png' }, true);
    assert.equal(backgrounds.length, 1, 'three slides, one background');
    assert.ok(backgrounds[0].color && !backgrounds[0].image, 'a flat color: no slide content is in it');
  });

  test('hidden: generated text scaled to nothing, nearly clear, or in a closed details is not live text', async () => {
    const res = await read(
      page(
        '.a::after{content:"SCALED_SECRET";display:inline-block;transform:scale(.03)}.b::after{content:"CLEAR_SECRET";color:rgba(0,0,0,.004)}.c{zoom:.02}',
        '<p class="a">A</p><p class="b">B</p><p class="c">ZOOMED_SECRET</p><details><summary>S</summary>CLOSED_SECRET</details><p>visible text</p>',
      ),
    );
    const got = words(res);
    for (const secret of ['SCALED_SECRET', 'CLEAR_SECRET', 'ZOOMED_SECRET', 'CLOSED_SECRET']) assert.ok(!got.includes(secret), `${secret} must not be live text: ${got}`);
    assert.ok(got.includes('visible'));
  });

  test('important: a pseudo with `content: ... !important` is not drawn twice', async () => {
    const res = await read(page('.n::after{content:" (draft)" !important}', '<p class="n">Note</p>'), { shapes: true, hide: true });
    const text = words(res);
    const live = (text.match(/\(draft\)/g) || []).length;
    const painted = await tab.evaluate(() => getComputedStyle(document.querySelector('.n'), '::after').content);
    assert.ok(live === 0 || painted !== 'none', `live=${live} paintedAfterRestore=${painted}`);
    assert.ok(live <= 1);
  });

  test('counter: a roman numeral past 3999 is decimal, as CSS shows it', async () => {
    const res = await read(page('ol{counter-reset:d 4000;list-style:none;padding:0}li{counter-increment:d}li::before{content:counter(d,lower-roman) ". "}', '<ol><li>x</li></ol>'));
    assert.ok(!/m{3,}/.test(words(res)), words(res));
    assert.ok(words(res).includes('4001'), words(res));
  });

  test('mask: a path that leaves its box, or is not finite, stays in the picture', async () => {
    const svg = (d) => `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='${d}' fill='none' stroke='black' stroke-width='2'/></svg>")`;
    for (const d of ['M -200 12 L 224 12', 'M 2 2 L 20', 'M 1e300 0 L 5 5']) {
      const res = await read(page(`.m{position:absolute;left:100px;top:100px;width:40px;height:40px;background:#c00;-webkit-mask:${svg(d)} center/100% 100% no-repeat;mask:${svg(d)} center/100% 100% no-repeat}`, '<div class="m"></div>'), { shapes: true });
      assert.equal(res.shapes.filter((s) => s.kind === 'path').length, 0, `path "${d}" must not become a shape`);
      for (const s of res.shapes) for (const v of [s.x, s.y, s.w, s.h]) assert.ok(Number.isFinite(v) && Math.abs(v) < 1e5);
    }
  });

  test('gradient: a tile larger than its box, or stops outside 0..1, show the slice of the ramp that Chrome shows', async () => {
    const css = '.g{position:absolute;left:100px;width:300px;height:80px}';
    const html = page(css, '<div class="g" id="a" style="top:50px;background:linear-gradient(90deg,red,blue) 0 0/200% 100% no-repeat"></div><div class="g" id="b" style="top:150px;background:linear-gradient(90deg,red,blue) 100% 0/200% 100% no-repeat"></div><div class="g" id="c" style="top:250px;background:linear-gradient(90deg,red -100%,blue 200%)"></div><div class="g" id="d" style="top:350px;background:linear-gradient(90deg,red,blue)"></div>');
    const res = await read(html, { shapes: true });
    const at = (y) => res.shapes.find((s) => s.kind === 'box' && Math.abs(s.y - y) < 2 && Math.abs(s.x - 100) < 2)?.gradient;
    const rgb = (h) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
    const near = (hex, want, tol = 6) => rgb(hex).every((v, i) => Math.abs(v - want[i]) <= tol);
    const a = at(50);
    assert.ok(near(a.stops[0].color, [255, 0, 0]) && near(a.stops.at(-1).color, [128, 0, 128]), `first half of the ramp: ${JSON.stringify(a)}`);
    const b = at(150);
    assert.ok(near(b.stops[0].color, [128, 0, 128]) && near(b.stops.at(-1).color, [0, 0, 255]), `second half: ${JSON.stringify(b)}`);
    const c = at(250);
    assert.ok(near(c.stops[0].color, [170, 0, 85]) && near(c.stops.at(-1).color, [85, 0, 170]), `stops outside 0..1: ${JSON.stringify(c)}`);
    const d = at(350);
    assert.ok(near(d.stops[0].color, [255, 0, 0]) && near(d.stops.at(-1).color, [0, 0, 255]));
  });

  test('throw: a read that throws leaves the page as it found it', async () => {
    await load(page('.p::before{content:"GEN";}', '<p class="p">text</p>'));
    const before = await tab.evaluate(() => document.documentElement.outerHTML);
    const h = await tab.$('#s1');
    await h
      .evaluate((s, fn) => {
        const prev = Array.prototype.sort;
        Array.prototype.sort = () => {
          throw new Error('boom');
        };
        try {
          return new Function(`return (${fn})`)()(s, { shapes: true, hide: true });
        } finally {
          Array.prototype.sort = prev;
        }
      }, readSlide.toString())
      .catch(() => {});
    await h.evaluate(restoreSlide);
    const after = await tab.evaluate(() => document.documentElement.outerHTML);
    assert.equal(after, before);
  });

  test('many: thousands of picture items export in bounded time', async () => {
    const items = Array.from({ length: 3000 }, (_, i) => `<svg viewBox="0 0 2 2" style="position:absolute;left:${(i % 60) * 20}px;top:${Math.floor(i / 60) * 14}px;width:6px;height:6px"><rect width="2" height="2" fill="#a0a"/></svg>`).join('');
    await load(page('', items));
    const t0 = Date.now();
    const { slides } = await captureSlides(await tab.$$('section[data-lattice-slide]'), { type: 'png' }, true);
    assert.ok(Date.now() - t0 < 60000, `took ${Date.now() - t0} ms`);
    assert.ok(slides[0].shapes.some((s) => s.kind === 'picture') || slides[0].image);
  });

  test('decorative: generated text on the slide\'s decorative layer is background, not live text', async () => {
    const res = await read(page('.backdrop{position:absolute;inset:0;z-index:-1}.backdrop::before{content:"MONOGRAM_AB";position:absolute;right:40px;bottom:40px;font-size:200px;color:rgba(0,0,0,.08)}', '<div class="backdrop"></div><p>real text</p>'));
    assert.ok(!words(res).includes('MONOGRAM_AB'), words(res));
    assert.ok(words(res).includes('real'));
  });

  test('covered: text under an opaque box is not live text; text under a translucent overlay is', async () => {
    const res = await read(
      page(
        '.t{position:absolute;left:60px;font-size:28px}.cover{position:absolute;left:40px;top:90px;width:500px;height:80px;background:#fff}.veil{position:absolute;left:40px;top:290px;width:500px;height:80px;background:rgba(255,255,255,.4)}',
        '<p class="t" style="top:100px">UNDER_OPAQUE</p><div class="cover"></div><p class="t" style="top:300px">UNDER_VEIL</p><div class="veil"></div>',
      ),
    );
    const got = words(res);
    assert.ok(!got.includes('UNDER_OPAQUE'), got);
    assert.ok(got.includes('UNDER_VEIL'), got);
  });

  test('covered: text under an opaque box is hidden from the capture, not left as picture ink', async () => {
    const res = await read(
      page(
        '.t{position:absolute;left:60px;top:100px;font-size:28px}.cover{position:absolute;left:40px;top:90px;width:500px;height:80px;background:#fff}',
        '<p class="t">UNDER_OPAQUE</p><div class="cover"></div>',
      ),
      { shapes: true, hide: true, sprites: true },
    );
    assert.equal(res.shapes.filter((sh) => sh.kind === 'picture').length, 0, 'the hidden text must not become a picture');
  });

  test('host: a slide that reads its backdrop is one whole picture, without shooting its layers, when the host asks', async () => {
    await load(
      page(
        '.blend{position:absolute;left:100px;top:100px;width:300px;height:200px;background:#c00;mix-blend-mode:multiply}',
        (i) => (i === 0 ? '<p>plain</p>' : '<div class="blend"></div><p>blended</p>'),
        2,
      ),
    );
    const handles = await tab.$$('section[data-lattice-slide]');
    const run = async (mode) => {
      const shots = [];
      const host = {
        run: (i, fn, arg) => handles[i].evaluate(fn, arg),
        shoot: async (i, kind) => {
          shots.push(`${i}:${kind}`);
          return new Uint8Array(await handles[i].screenshot({ type: 'png', omitBackground: kind === 'foreground' }));
        },
      };
      const out = await captureOfficeSlides(host, 2, { backdrop: mode });
      return { shots, out };
    };
    const whole = await run('whole');
    assert.deepEqual(whole.shots.filter((x) => x.startsWith('1:')), ['1:full'], 'the blended slide is shot once, whole');
    assert.ok(whole.out.slides[1].image && whole.out.slides[1].background === undefined, 'a whole picture, no shared background');
    assert.equal(typeof whole.out.slides[0].background, 'number', 'the plain slide keeps its shared background');
    const checked = await run('check');
    // Slides 0 and 1 paint the same background, so it is shot once; the blended slide's layers are then checked against a whole shot.
    assert.ok(checked.shots.includes('1:foreground') && checked.shots.includes('1:full'), checked.shots.join());
  });

  test('chip: a slide whose only painted box is a highlight chip leaves no film behind', async () => {
    await load(
      page(
        'section{background:#0b3a5e;color:#fff}code{background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.2);padding:0 4px;font-family:monospace}p{position:absolute;left:60px;top:300px;font-size:30px;margin:0}',
        '<p>One word <code>tag:</code> and more.</p>',
      ),
    );
    const handles = await tab.$$('section[data-lattice-slide]');
    const host = {
      run: (i, fn, arg) => handles[i].evaluate(fn, arg),
      shoot: async (i, kind) => new Uint8Array(await handles[i].screenshot({ type: 'png', omitBackground: kind === 'foreground' })),
    };
    const { slides } = await captureOfficeSlides(host, 1, { sprites: true });
    const runs = slides[0].frames.flatMap((f) => f.lines.flat());
    assert.ok(runs.find((r) => r.text.includes('tag:'))?.style.highlight, 'the chip is a highlight');
    assert.equal(slides[0].shapes.filter((x) => x.kind === 'picture').length, 0, 'the chip leaves no picture: its own paint is hidden from the capture');
  });

  test('a chip over the decorative layer is a native highlight too, in a color close to the page behind it', async () => {
    const res = await read(
      page(
        '.backdrop{position:absolute;left:0;top:0;width:640px;height:720px;z-index:-1;background:repeating-linear-gradient(90deg,#fff,#fff 10px,#ddd 10px,#ddd 11px)}code{background:rgba(0,100,150,.1);padding:0 4px;font-family:monospace}p{position:absolute;margin:0;font-size:22px}',
        '<div class="backdrop"></div><p style="left:100px;top:100px"><code>OVER_GRID</code></p><p style="left:800px;top:100px"><code>ON_WHITE</code></p>',
      ),
    );
    const runs = res.frames.flatMap((f) => f.lines.flat());
    // Words stay editable with no picture over them: the highlight is an approximate color, not a film.
    assert.ok(runs.find((r) => r.text.includes('OVER_GRID'))?.style.highlight, 'over the grid: highlight');
    assert.ok(runs.find((r) => r.text.includes('ON_WHITE'))?.style.highlight, 'on white: highlight');
    assert.equal(res.shapes.filter((x) => x.kind === 'picture').length, 0, 'no picture film for either chip');
  });

  test('clip: a shape that fills a rounded overflow box\'s padding box does not poke out of the inner corner', async () => {
    const res = await read(page('.host{position:absolute;left:100px;top:100px;width:300px;height:200px;border:10px solid #888;border-radius:30px;overflow:hidden;box-sizing:content-box}.fill{position:absolute;inset:0;background:#c00}', '<div class="host"><div class="fill"></div></div>'), { shapes: true });
    assert.equal(res.shapes.some((s) => s.kind === 'box' && s.fill?.color === '#cc0000' && s.radii?.every((r) => r === 0)), false, 'a square red box would poke out of the rounded padding-box corners');
  });

  test('order: a positioned ::before with a z-index is above a static ::after of the same element', async () => {
    const res = await read(
      page('.k{position:absolute;left:100px;top:100px;width:300px;height:100px;background:#fff}.k::before{content:"";position:absolute;left:10px;top:10px;width:120px;height:60px;z-index:1;background:radial-gradient(#f00,#00f)}.k::after{content:"";position:absolute;left:10px;top:10px;width:200px;height:60px;background:#0a0}', '<div class="k"></div>'),
      { shapes: true, sprites: true },
    );
    const green = res.shapes.findIndex((s) => s.kind === 'box' && s.fill?.color === '#00aa00');
    const grad = res.shapes.findIndex((s) => s.kind === 'picture');
    assert.ok(green >= 0 && grad >= 0, JSON.stringify(res.shapes.map((s) => [s.kind, s.x, s.y])));
    assert.ok(grad > green, 'the z-index 1 pseudo is drawn after the static one');
  });
});
