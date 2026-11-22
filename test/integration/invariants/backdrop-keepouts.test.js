/**
 * BACKDROP KEEP-OUTS: `backdrop: clear-footer` and `clear-hero` (lib/core/resolve-backdrop.js,
 * lib/base/base.finish.css § THE KEEP-OUTS). A pattern finish keeps running behind the content
 * and steps aside for the footer band, and on a big-number slide for the hero stack too.
 *
 * Only a browser can check where the clear layer lands: base.finish.css sizes it from the frame
 * insets and the footer row's height, which stage.css owns, and a change to either moves the
 * footer out from under the clear. So this renders each mask and measures the clear layer's
 * content box against the boxes it must cover, and the ones it must leave alone.
 *
 * It also exports the hero slide to PDF and reads the writer's report. The first draft painted
 * the hero clear as a pseudo on the stack, and the PDF writer read it as painting OVER the number,
 * so the number and its caption left the text layer ("15 covered"). The clear now lives in
 * `.backdrop`, and no word may be covered.
 *
 * FALSIFIABLE: on main `clear-footer` and `clear-hero` stamp nothing (unknown words), the clear
 * layer is off, and every keep-out assertion below fails.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { renderHtml } = require('../../helpers/semantic-render');
const { resolveChrome, skipWithoutChrome } = require('../../helpers/chrome');

const CHROME = resolveChrome();
const CONTENT = '`Eyebrow`\n\n## A heading.\n\nA paragraph of body text.\n\n- One\n- Two';
const HERO = '`Net revenue retention`\n\n- 128%\n  - Up from 112% a year ago';
const SPLIT = '`Eyebrow`\n\n## A heading on the panel.\n\nA lede.\n\n- One\n  - Detail.\n- Two\n  - Detail.';
const METRIC = '`ARR`\n\n## $42M\n\n- One\n  - Detail.\n- Two\n  - Detail.';
const COMPARE = '`Decision`\n\n## Two options.\n\nContext.\n\n- A\n  - x\n- B\n  - y';

// [class list, body]
const SLIDES = [
  ['backdrop-clear-footer', CONTENT],
  ['backdrop-clear-hero', CONTENT],
  ['big-number backdrop-clear-hero', HERO],
  ['big-number backdrop-clear-footer', HERO],
  ['backdrop-clear', CONTENT],
  ['backdrop-open', CONTENT],
  // Split slides restate the clear layer's box for `clear`; the keep-outs must win over it.
  ['split-panel backdrop-clear-footer', SPLIT],
  ['split-panel metric backdrop-clear-footer', METRIC],
  ['split-panel mirror backdrop-clear-hero', SPLIT],
  ['split-compare backdrop-clear-footer', COMPARE],
  // A tone slide's 8px rail sits under `.backdrop`; the band must stop at the mask's edge.
  ['tone-pass backdrop-clear-footer', CONTENT],
];
const SPLIT_FIRST = 7;
const TONE = 11;
const DECK = `---
marp: true
theme: indaco
paginate: true
footer: "Q3 operating review"
finish: strata
---

${SLIDES.map(([cls, body]) => `<!-- _class: ${cls} -->\n\n${body}`).join('\n\n---\n\n')}
`;

describe('backdrop keep-outs (real render)', { skip: skipWithoutChrome(CHROME) }, () => {
  let browser;
  let page;
  before(async () => {
    const html = renderHtml(DECK, { key: 'backdrop-keepouts' });
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(`file://${html}`, { waitUntil: 'load', timeout: 60000 });
  }, { timeout: 630000 });
  after(async () => { if (browser) await browser.close(); });

  // Every box in slide coordinates (relative to the section's padding box), so the slides'
  // vertical stacking in the page cancels out.
  const read = (n) => page.evaluate((n) => {
    const sec = document.querySelector(`section[data-lattice-slide="${n}"]`);
    const sr = sec.getBoundingClientRect();
    const ss = getComputedStyle(sec);
    const px = (v) => parseFloat(v) || 0;
    const ox = sr.left + px(ss.borderLeftWidth);
    const oy = sr.top + px(ss.borderTopWidth);
    const box = (r) => r && { l: r.left - ox, r: r.right - ox, t: r.top - oy, b: r.bottom - oy };
    const mask = sec.querySelector(':scope > .backdrop > .backdrop-mask');
    const ms = getComputedStyle(mask, '::before');
    const mr = mask.getBoundingClientRect();
    // Positioned insets compute to used px: the layer's content box is the mask's box minus the
    // insets (negative when the layer reaches past the slide) and the layer's own padding.
    const clear = ms.backgroundImage === 'none' ? null : {
      l: mr.left - ox + px(ms.left) + px(ms.paddingLeft),
      r: mr.right - ox - px(ms.right) - px(ms.paddingRight),
      t: mr.top - oy + px(ms.top) + px(ms.paddingTop),
      b: mr.bottom - oy - px(ms.bottom) - px(ms.paddingBottom),
    };
    // A split panel's own clear layer (its `::before`), for the page number that sits over it.
    const panels = [...sec.querySelectorAll(':scope > :is(.panel-left, .panel-right, .compare-left)')].map((p) => {
      const ps = getComputedStyle(p, '::before');
      if (ps.content === 'none' || ps.backgroundImage === 'none') return null;
      const r = p.getBoundingClientRect();
      // Clipped to the panel's box (clip-path: inset), so the visible part is the content box
      // grown by the bleed and cut back to the panel.
      // The layer's top padding IS one bleed (base.finish.css § THE KEEP-OUTS); the custom
      // property itself reads back as its unresolved `calc()` text.
      const bleed = px(ps.paddingTop);
      return {
        l: r.left - ox, r: r.right - ox, b: r.bottom - oy,
        t: r.top - oy + px(ps.top) + px(ps.paddingTop) - bleed,
        bleed,
      };
    }).filter(Boolean);
    const footText = [...sec.querySelectorAll('footer')].map((f) => f.getBoundingClientRect()).find((r) => r.width > 0);
    const pag = sec.querySelector('.lat-pagination')?.getBoundingClientRect();
    return {
      cls: sec.className,
      bleed: px(ms.paddingTop),
      panels,
      footText: box(footText),
      pag: pag && pag.width > 0 ? box(pag) : null,
      h: sr.height - px(ss.borderTopWidth) - px(ss.borderBottomWidth),
      w: sr.width - px(ss.borderLeftWidth) - px(ss.borderRightWidth),
      content: { l: px(ss.paddingLeft), t: px(ss.paddingTop) },
      footer: box(sec.querySelector(':scope > .cell-footer')?.getBoundingClientRect()),
      stage: box(sec.querySelector(':scope > .cell-stage')?.getBoundingClientRect()),
      hero: box(sec.querySelector(':scope > .cell-stage > ul')?.getBoundingClientRect()),
      clear,
    };
  }, n);

  const fmt = (b) => `x ${b.l.toFixed(1)}–${b.r.toFixed(1)} y ${b.t.toFixed(1)}–${b.b.toFixed(1)}`;
  const contains = (outer, inner) => outer.l <= inner.l + 0.5 && outer.r >= inner.r - 0.5 && outer.t <= inner.t + 0.5 && outer.b >= inner.b - 0.5;

  test('clear-footer: the clear layer covers the footer band to the slide edge, and no more', async () => {
    const m = await read(1);
    assert.ok(m.cls.split(' ').includes('backdrop-clear-footer'), m.cls);
    assert.ok(m.clear, 'the clear layer is off');
    assert.ok(m.footer, 'the slide drew no footer band');
    assert.ok(contains(m.clear, m.footer), `clear ${fmt(m.clear)} misses the footer band ${fmt(m.footer)}`);
    // It starts at the band's top (the footer row is the band's whole height), so the pattern
    // keeps running behind the content above it.
    assert.ok(Math.abs(m.clear.t - m.footer.t) <= 1.5, `clear top ${m.clear.t.toFixed(1)} vs band top ${m.footer.t.toFixed(1)}`);
    assert.ok(m.clear.t >= m.stage.b - 0.5, `clear top ${m.clear.t.toFixed(1)} reaches into the stage (bottom ${m.stage.b.toFixed(1)})`);
    assert.ok(m.clear.b >= m.h - 0.5, `clear bottom ${m.clear.b.toFixed(1)} stops short of the slide edge ${m.h.toFixed(1)}`);
  });

  test('clear-hero off a big-number slide is clear-footer', async () => {
    const [footer, hero] = [await read(1), await read(2)];
    assert.ok(hero.clear, 'the clear layer is off');
    for (const k of ['l', 'r', 't', 'b']) assert.ok(Math.abs(footer.clear[k] - hero.clear[k]) <= 0.5, `${k}: ${hero.clear[k]} vs ${footer.clear[k]}`);
  });

  test('clear-hero on big-number: the clear layer covers the hero stack and the footer band', async () => {
    const m = await read(3);
    assert.ok(m.clear, 'the clear layer is off');
    assert.ok(m.hero, 'no hero stack');
    assert.ok(contains(m.clear, m.hero), `clear ${fmt(m.clear)} misses the hero stack ${fmt(m.hero)}`);
    assert.ok(contains(m.clear, m.footer), `clear ${fmt(m.clear)} misses the footer band ${fmt(m.footer)}`);
    assert.ok(Math.abs(m.clear.t - m.content.t) <= 1.5, `clear top ${m.clear.t.toFixed(1)} vs the content top ${m.content.t.toFixed(1)}`);
  });

  test('clear-footer on big-number leaves the hero stack on the pattern', async () => {
    const m = await read(4);
    assert.ok(m.clear.t >= m.hero.b, `clear top ${m.clear.t.toFixed(1)} reaches the hero stack (bottom ${m.hero.b.toFixed(1)})`);
  });

  test('clear is unchanged: the content box, nothing below it', async () => {
    const m = await read(5);
    assert.ok(Math.abs(m.clear.t - m.content.t) <= 1.5 && Math.abs(m.clear.l - m.content.l) <= 1.5, `clear ${fmt(m.clear)}`);
    assert.ok(m.clear.b <= m.footer.t, `clear bottom ${m.clear.b.toFixed(1)} reaches the footer band (top ${m.footer.t.toFixed(1)})`);
  });

  test('open draws no clear layer', async () => {
    assert.equal((await read(6)).clear, null);
  });

  // The slide layer is clipped to the mask's box after the blur, so on screen it covers its
  // content box grown by one bleed and cut back to the slide.
  const visible = (m, c, bleed) => ({ l: Math.max(0, c.l - bleed), r: Math.min(m.w, c.r + bleed), t: c.t - bleed, b: Math.min(m.h, c.b + bleed) });

  for (let i = 0; i < 4; i++) {
    const n = SPLIT_FIRST + i;
    test(`${SLIDES[n - 1][0]}: the band clears the footer text and the page number, on the slide`, async () => {
      const m = await read(n);
      assert.ok(m.clear, `${m.cls}: the slide's clear layer is off`);
      // On the slide, along the bottom: never a box off the slide or a bar at the top.
      assert.ok(m.clear.t > m.h * 0.75 && m.clear.t < m.h, `${m.cls}: clear ${fmt(m.clear)} on a ${m.h}px slide`);
      assert.ok(m.clear.l <= 0.5 && m.clear.r >= m.w - 0.5, `${m.cls}: clear ${fmt(m.clear)} is not full width (${m.w}px)`);
      // A word is clear when the slide's band holds it and no panel paints over it, or when the
      // panel it sits on holds it in its own band.
      const onPanel = (r) => m.panels.find((p) => r.l < p.r && r.r > p.l);
      const covers = (r) => (onPanel(r) ? contains(onPanel(r), r) : contains(visible(m, m.clear, m.bleed), r));
      for (const [what, r] of [['footer text', m.footText], ['page number', m.pag]]) {
        if (!r) continue;
        assert.ok(covers(r), `${m.cls}: the ${what} ${fmt(r)} sits outside every clear layer (slide ${fmt(m.clear)}, panels ${m.panels.map(fmt).join(' / ') || 'none'})`);
      }
    });
  }

  test('tone slide: the band stops at the mask, so the 8px rail keeps its color', async () => {
    const { PNG } = require('pngjs');
    const at = await page.evaluate((n) => {
      const r = document.querySelector(`section[data-lattice-slide="${n}"]`).getBoundingClientRect();
      return { x: r.left + 3, top: r.top + r.height * 0.5, band: r.bottom - 12 };
    }, TONE);
    const px = async (y) => {
      const p = PNG.sync.read(Buffer.from(await page.screenshot({ clip: { x: at.x, y, width: 1, height: 1 } })));
      return [p.data[0], p.data[1], p.data[2]];
    };
    const [mid, band] = [await px(at.top), await px(at.band)];
    const d = Math.max(...mid.map((v, k) => Math.abs(v - band[k])));
    assert.ok(d <= 8, `the rail is rgb(${mid}) mid-slide but rgb(${band}) in the footer band`);
  });

  test('the PDF keeps the hero and footer words vector under the keep-outs', async () => {
    const { execFileSync } = require('node:child_process');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keepouts-pdf-'));
    const md = path.join(dir, 'keepouts.md');
    fs.writeFileSync(md, DECK);
    const out = execFileSync(process.execPath, [path.join(__dirname, '../../../lattice.js'), md, path.join(dir, 'keepouts.pdf')], { encoding: 'utf8', env: { ...process.env, CHROME_PATH: CHROME || '' } });
    const covered = out.split('\n').filter((l) => /slide \d+:.*\b\d+ covered\b/.test(l));
    assert.deepEqual(covered, [], `words were pushed into the photo as covered:\n${covered.join('\n')}`);
  }, { timeout: 300000 });
});
