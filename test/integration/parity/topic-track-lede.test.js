/**
 * Integration: a plain `topic` under a divider, whose paragraph runs past a phone page, gives the paragraph a lede
 * page (lib/core/carousel.js `lede-page`, lib/core/fit-measure.js `members`; owner, 2026-11-16, "lede page, all";
 * fit-everywhere-model.md §25).
 *
 * A divider before two or more topics gives each topic a derived track (`ul.tile-track`, the deck's section names).
 * The measure counted the track's items as the slide's members, so a long topic had members to page, was never
 * marked `atSeam`, and never reached its lede page: the normal way to write topics clipped (checker, 2026-11-16).
 * Case, on the real CLI export at square:
 *   TRACK   the export clips nothing; the topic splits into a cover that keeps its heading and its track, and a lede
 *           page that carries the paragraph, set light on the dark field (not the body ink it would fall back to)
 *
 * FALSIFIABLE: with the track counted as members the topic stays whole and the export prints OVERFLOW; without the
 * track in `stays` the track moves to the lede page; without the lede-page rule in topic.styles.css the paragraph
 * reads dark on dark. Needs Chromium (CHROME_PATH).
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const puppeteer = require('puppeteer');
const { resolveChrome } = require('../../../tools/lib/resolve-chrome');

const ROOT = path.join(__dirname, '..', '..', '..');
const DECK = `---
theme: indaco
size: square
---

<!-- _class: divider -->

## Part two

---

<!-- _class: topic -->

## Pricing

The first half named the problem. The second half prices it: what each option costs this quarter and next, who carries the risk while it runs, which of the three options the finance team can fund from the existing budget without a reforecast, and the one decision the board has to make before the next meeting. The first half named the problem. The second half prices it: what each option.

---

<!-- _class: topic -->

## Risk

Short.
`;

let dir;
let log;
let pages;
before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'topic-track-lede-'));
  const md = path.join(dir, 'deck.md');
  fs.writeFileSync(md, DECK);
  const pdf = path.join(dir, 'deck.pdf');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), md, pdf, '--keep-html'], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
  if (r.status !== 0) throw new Error(`export failed: ${r.stderr}`);
  log = `${r.stdout}${r.stderr}`;
  const browser = await puppeteer.launch({ executablePath: resolveChrome?.() || process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1080 });
    await page.goto(`file://${pdf.replace(/\.pdf$/, '.html')}`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    pages = await page.evaluate(() => [...document.querySelectorAll('section.topic')].map((s) => {
      const p = s.querySelector(':scope > p');
      // Any CSS color (rgb, oklch, color-mix) to sRGB bytes through a canvas, then a luminance on 0..255.
      const ctx = document.createElement('canvas').getContext('2d');
      const lum = (c) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data; return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      return {
        cls: s.className,
        track: !!s.querySelector(':scope > ul.tile-track'),
        text: s.textContent,
        ink: p ? lum(getComputedStyle(p).color) : null,
        field: lum(getComputedStyle(s).backgroundColor),
      };
    }));
  } finally {
    await browser.close();
  }
});
after(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

test('TRACK: the long topic splits, its cover keeps the track, its lede page reads light on dark', () => {
  assert.doesNotMatch(log, /OVERFLOW/, log);
  const cover = pages.find((p) => /\btopic-cover\b/.test(p.cls));
  const lede = pages.find((p) => /\btopic-lede\b/.test(p.cls));
  assert.ok(cover && lede, `the topic splits: ${pages.map((p) => p.cls).join(' | ')}`);
  assert.ok(cover.track, 'the cover keeps the track');
  assert.ok(!lede.track, 'the lede page carries no track');
  assert.match(lede.text, /The first half named the problem/);
  assert.ok(lede.ink - lede.field > 100, `the paragraph is light on the dark field (ink ${Math.round(lede.ink)}, field ${Math.round(lede.field)})`);
});
