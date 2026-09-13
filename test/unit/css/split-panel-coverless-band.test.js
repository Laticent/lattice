/**
 * A COVERLESS `split-panel` SPLIT PAGE PLACES ITS WAYFINDING MARKS, AND RESERVES WHAT THEY COVER.
 *
 * `pullquote` leads with the quotation and carries no `<h2>`, so `readFeature` declines and there
 * is no masthead to build a cover from either: the run is `lat-split-native` BODY pages with no
 * `.cell-footer`. `dockInFooterCell` appends both marks at SECTION level — and on this layout the
 * section IS the panel flex container, so the forward pointer arrives as a flex ITEM of the panel
 * row.
 *
 * This surface was got wrong three times, each by fixing one half:
 *
 *   1. Nothing — at portrait the pointer stacked under the panels into the band and the k-of-N
 *      rail printed through the pill's label (42.1x6.5px), and the pill over the running
 *      footer's ink (206.6x24.5px).
 *   2. `padding-bottom` on the SECTION — closed that at the four tall sizes and at SQUARE cut the
 *      DARK panel short too: a 92.9x629.1px white band under a full-bleed navy field. Reserving
 *      space in a container cannot be right when the mark should not be in the container.
 *   3. The pointer taken out of flow with NO reservation — the panels then get their whole box
 *      back, which is what lets their CONTENT reach the band the opaque pill floats over:
 *      102.2x38.0px of pill fill over a body line, on a page the engine considered to fit. Plus
 *      a `:not(.form)` that left an authored `form` page with every defect of round 1 intact.
 *
 * THIS ARM RENDERS THE REAL DECKS, and that is the point rather than an implementation detail.
 * Three hand-authored fixtures were tried first and all three were unreachable by the defect:
 * without the section's `data-orientation` / `data-family` stamps the panels never stack, and
 * even with them a hand-built `<ul>` places its lone member ~380px above where the engine places
 * it. Each of those fixtures PASSED with the reservation deleted — a fixture that cannot reach
 * the defect certifies it, which is the same mistake, one level down, as a collision sweep that
 * compares marks only to other marks. So the deck goes through `dist/lattice-emulator.js` and
 * the arms measure what a reader gets (HARD RULE #23).
 *
 * WHAT THE RESERVATION IS FOR, measured rather than assumed — and the earlier answer here was
 * wrong in BOTH directions. It said the reservation could not be pinned because no deck reached
 * the band. Then a deck was built that does (three members, 48-word bodies) and the pill printed
 * 321.1x38.0px over the text WITH the reservation and 321.1x38.0px WITHOUT it. Byte-identical.
 * `.panel-right` is `overflow: clip`, and a clip edge is the PADDING box, so content that
 * exceeds the shortened content box spills straight through the reserve. The reservation never
 * stood between the pill and overflowing words, and an arm asserting that it did would have been
 * asserting a falsehood.
 *
 * What it DOES do is reposition content that FITS, and that has two consequences worth pinning,
 * both of which the arms below cover:
 *
 *   · EVERY PAGE OF A RUN RESERVES THE SAME BAND. The last page carries no forward pointer, so
 *     a `:has(> .lat-split-rel)` version of this rule skipped it — and `space-evenly` then
 *     re-centred that page's member block 31-44px off its siblings (125px on `compact`). A
 *     reader pages through seconds apart and the column jumps.
 *   · BOTH PANELS RESERVE IT. `mirror` row-reverses them, so at square the pointer sits over
 *     `.panel-left`; reserving only `.panel-right` put the band on the column the pill does not
 *     cover and printed through 199.5x23.1px of the cite line.
 *
 * Mutation-proved: `position: absolute` (16 of 20 arms fail without it), the absence of
 * `:not(.form)` (4 of 20), and the reservation itself through the two arms below.
 */

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { resolveChrome } = require('../../../tools/lib/resolve-chrome');

const ROOT = path.resolve(__dirname, '../../..');
const EMU = path.join(ROOT, 'dist/lattice-emulator.js');

// ONE member per page is what a split page carries, and it is the shape that reaches the band:
// `.panel-right > ul` is `justify-content: space-evenly`, so a lone member sits in the middle of
// a column box that runs to the slide's bottom edge. Four members is the shape that does NOT
// reproduce — they spread, and none lands there.
const deck = (size, cls) => `---
marp: true
theme: indaco
size: ${size}
---

<!-- _class: split-panel pullquote${cls ? ` ${cls}` : ''} -->
<!-- _footer: "pullquote · split-panel pullquote — a running footer long enough to reach across." -->

> pullquote gives half the slide to one voice, and the other half to what it means.

\`split-panel pullquote · the layout, quoted\`

- The quote claims
  - Display italic on the dark panel; keep it under twenty-five words.
- The column interprets
  - Two items that say why the words matter, not who said them again.
- A third reading
  - And a third clause to match.
`;

const SIZES = ['portrait', 'square', 'story', 'mobile'];

describe('split-panel: a coverless split page places its marks and reserves the band', () => {
  const exe = resolveChrome();
  let browser;
  let p;
  let dir;
  const rendered = new Map();

  before(async () => {
    if (!exe) return;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-spband-'));
    for (const size of SIZES) {
      for (const cls of ['', 'form', 'mirror']) {
        const key = `${size}|${cls}`;
        const md = path.join(dir, `${size}${cls}.md`);
        const html = path.join(dir, `${size}${cls}.html`);
        fs.writeFileSync(md, deck(size, cls));
        execFileSync(process.execPath, [EMU, md, html, '-q'], { stdio: 'ignore' });
        rendered.set(key, html);
      }
    }
    const puppeteer = require('puppeteer-core');
    browser = await puppeteer.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    p = await browser.newPage();
  });

  after(async () => {
    if (browser) await browser.close();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  /** Every coverless split page in the rendered deck, with the geometry the arms ask about. */
  const measure = async (size, cls) => {
    await p.goto(`file://${rendered.get(`${size}|${cls}`)}`, { waitUntil: 'networkidle0' });
    return p.evaluate(() => {
      const ink = (el) => {
        const b = el.getBoundingClientRect();
        if (!(el.textContent || '').trim()) return b;
        const rg = document.createRange(); rg.selectNodeContents(el);
        const i = rg.getBoundingClientRect();
        if (!i.width || !i.height) return b;
        return new DOMRect(Math.max(b.left, i.left), Math.max(b.top, i.top),
          Math.min(b.right, i.right) - Math.max(b.left, i.left), Math.min(b.bottom, i.bottom) - Math.max(b.top, i.top));
      };
      const over = (a, b) => {
        const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        return ox > 0.5 && oy > 0.5 ? { ox: +ox.toFixed(1), oy: +oy.toFixed(1) } : null;
      };
      const out = [];
      document.querySelectorAll('section.split-panel.lat-split-native').forEach((s, i) => {
        const ptr = s.querySelector('.lat-split-rel');
        if (!ptr) return;
        const sr = s.getBoundingClientRect();
        const pi = ink(ptr);
        const rail = s.querySelector('.lat-split-rail');
        const foot = s.querySelector('footer');
        const pl = s.querySelector('.panel-left').getBoundingClientRect();
        const pr = s.querySelector('.panel-right').getBoundingClientRect();
        const content = [...s.querySelectorAll('.panel-right li, .panel-right strong, .panel-right p')]
          .filter((e) => [...e.childNodes].some((x) => x.nodeType === 3 && x.textContent.trim()))
          .map((e) => ({ t: e.textContent.trim().slice(0, 40), r: ink(e) }));
        const hit = content.map((c) => (over(pi, c.r) ? { ...over(pi, c.r), t: c.t } : null)).find(Boolean) || null;
        out.push({
          page: i + 1,
          position: getComputedStyle(ptr).position,
          insideSlide: pi.right <= sr.right + 0.5 && pi.left >= sr.left - 0.5,
          bleeds: Math.abs(pl.left - sr.left) < 0.5 && Math.abs(pr.right - sr.right) < 0.5
            && Math.abs(Math.min(pl.top, pr.top) - sr.top) < 0.5
            && Math.abs(Math.max(pl.bottom, pr.bottom) - sr.bottom) < 0.5,
          overRail: rail ? over(pi, rail.getBoundingClientRect()) : null,
          overFooter: foot ? over(pi, ink(foot)) : null,
          overContent: hit,
        });
      });
      return out;
    });
  };

  /** The member block's vertical mid-line per page — the thing that drifts when one page of a
   *  run reserves a different band from its siblings. */
  const measureContent = async (size, cls) => {
    await p.goto(`file://${rendered.get(`${size}|${cls}`)}`, { waitUntil: 'networkidle0' });
    return p.evaluate(() => {
      const out = [];
      document.querySelectorAll('section.split-panel.lat-split-native').forEach((s, i) => {
        const ul = s.querySelector('.panel-right > ul');
        if (!ul) return;
        const sr = s.getBoundingClientRect();
        const r = ul.getBoundingClientRect();
        out.push({ page: i + 1, mid: +(((r.top + r.bottom) / 2) - sr.top).toFixed(1) });
      });
      return out;
    });
  };

  for (const size of SIZES) {
    for (const cls of ['', 'form']) {
      const label = `${size}${cls ? ' + authored form' : ''}`;

      test(`${label}: the run splits coverless, and the pointer is placed rather than laid out`, async (t) => {
        if (!exe) return t.skip('no Chromium — set CHROME_PATH');
        const pages = await measure(size, cls);
        assert.ok(pages.length >= 2, `the run did not split (${pages.length} page(s))`);
        for (const x of pages) {
          assert.equal(x.position, 'absolute',
            `page ${x.page}: the pointer is a flex item of the panel row — at square it becomes a third COLUMN`);
          assert.ok(x.insideSlide, `page ${x.page}: the pointer ran past the slide edge`);
        }
      });

      test(`${label}: the pointer covers no mark and no content`, async (t) => {
        if (!exe) return t.skip('no Chromium — set CHROME_PATH');
        for (const x of await measure(size, cls)) {
          assert.equal(x.overRail, null, `page ${x.page}: pointer over the k-of-N rail — ${JSON.stringify(x.overRail)}`);
          assert.equal(x.overFooter, null, `page ${x.page}: pointer over the running footer — ${JSON.stringify(x.overFooter)}`);
          assert.equal(x.overContent, null, `page ${x.page}: the opaque pill covers body text — ${JSON.stringify(x.overContent)}`);
        }
      });
    }

    // Full bleed is what the section-level reservation destroyed, and only at square — where the
    // panels are side-by-side columns rather than stacked halves. An authored `form` is inset by
    // the Form frame by design, so this is the non-Form shape only.
    test(`${size}: the panels still reach every slide edge`, async (t) => {
      if (!exe) return t.skip('no Chromium — set CHROME_PATH');
      for (const x of await measure(size, '')) {
        assert.ok(x.bleeds, `page ${x.page}: a reservation cut the panels short of the slide edge`);
      }
    });

    // THE RUN'S PAGES AGREE. This is what the reservation actually buys, and it is measured on
    // the member block's own mid-line rather than on a mark, because the drift it removes is
    // CONTENT drift — invisible to a sweep that tracks the pointer, the rail and the page number,
    // which is how it shipped.
    test(`${size}: every page of the run places its content identically`, async (t) => {
      if (!exe) return t.skip('no Chromium — set CHROME_PATH');
      const mids = await measureContent(size, '');
      assert.ok(mids.length >= 2, `the run did not split (${mids.length} page(s))`);
      const spread = Math.max(...mids.map((m) => m.mid)) - Math.min(...mids.map((m) => m.mid));
      assert.ok(spread <= 1, `the member block moves ${spread.toFixed(1)}px between pages of one run`
        + ` — ${JSON.stringify(mids)}`);
    });

    // …INCLUDING UNDER `mirror`, which row-reverses the panels. At square that swaps which column
    // the pointer sits over, so a reservation on one named panel lands on the wrong one.
    test(`${size}: mirror reverses the panels and the band is still reserved where the pill is`, async (t) => {
      if (!exe) return t.skip('no Chromium — set CHROME_PATH');
      for (const x of await measure(size, 'mirror')) {
        assert.equal(x.overContent, null,
          `page ${x.page}: under mirror the pill covers body text — ${JSON.stringify(x.overContent)}`);
      }
      const mids = await measureContent(size, 'mirror');
      const spread = Math.max(...mids.map((m) => m.mid)) - Math.min(...mids.map((m) => m.mid));
      assert.ok(spread <= 1, `under mirror the member block moves ${spread.toFixed(1)}px between pages`);
    });
  }
});
