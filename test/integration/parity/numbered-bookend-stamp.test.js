/**
 * The `numbered` bookend stamp paints, on BOTH render paths, WITH `silent`.
 *
 * `divider numbered` / `closing numbered` used to write the numeral onto
 * `section::after` — the pseudo the engine reserves for the page number — and two
 * separate owners took it back:
 *
 *  1. `packTheme` (lib/engine/css.js) mirrors Marpit's pagination plugin and comments
 *     out every `content` on a `section…::after` rule that isn't
 *     `attr(data-lattice-pagination)`. That mask runs over the whole inlined base
 *     bundle, so the counter was stripped from the stylesheet the docs Playground, the
 *     Studio and lib/runtime load — while the unpacked emulator/CLI path kept it. One
 *     modifier, two render paths, two different pictures.
 *  2. `silent` / `no-paginate` null the same pseudo with
 *     `section.silent.silent::after { content: none }` at an equal (0,2,2) specificity
 *     from a later file, so `divider silent numbered` — the sample shipped in
 *     `divider.docs.md`, in the manifest and in `divider.gallery.md` — stamped nothing
 *     anywhere.
 *
 * The numeral now rides the slide HEADING's pseudo, which neither owner can reach.
 *
 * WHY THIS IS NOT A CSS TEXT MATCH. `test/unit/engine/engine.test.js` already pins the
 * packed RULE, and a rule-level assertion is exactly what certified the bug for as long
 * as it existed: the previous arm asserted the counter must NOT survive the pack. What
 * a text match cannot see is whether the declaration reaches a pixel — a pseudo can be
 * live and still collapse to nothing (see the finish-`::after` entry in
 * engineering/gotchas/css.md). So this drives the two REAL surfaces in Chromium and
 * ends on a PIXEL comparison against an un-numbered control slide (HARD RULE #23).
 *
 * Slow tier (Chromium; the second surface also spawns the emulator).
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const puppeteer = require('puppeteer');

const { resolveChrome, skipWithoutChrome } = require('../../helpers/chrome.js');

const ROOT = path.join(__dirname, '..', '..', '..');
const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
const OUT = path.join(ROOT, '.scratch', 'numbered-bookend-stamp');
const TIMEOUT = 300000;

// Slide 1 is the CONTROL: an identical dark divider with no `numbered`. Every other
// slide adds exactly one thing, so a failure names its own cause. The heading text is
// deliberately short and the deck is unpaginated, which keeps the top-right corner —
// where the numeral lands — empty canvas on the control.
const DECK = `---
marp: true
theme: indaco
header: "Deck header"
footer: "Deck footer"
---

<!-- _class: divider -->

## Control.

---

<!-- _class: divider numbered -->

## Stamped.

---

<!-- _class: divider silent numbered -->

## Stamped under silent.

---

<!-- _class: divider light numbered -->

## Stamped on the light canvas.

---

<!-- _class: closing numbered -->

## A closing does not take the modifier.

---

<!-- _class: divider silent -->

## Silent, unstamped.
`;

/**
 * What each slide's heading `::after` must resolve to. `null` = no stamp at all.
 *
 * The last row is the one worth reading twice: `closing numbered` must stamp NOTHING.
 * `numbered` is a divider modifier — a bookend is not a section — and the class is
 * still spellable, so only a rendered assertion catches it coming back. The
 * `divider light` row asserts the SAME counter as the dark dividers, which is the
 * other half of the same decision: one series, no restart.
 */
const EXPECTED = [
  // Header VISIBLE here, and asserted: it proves the deck's `header:` really reaches a
  // divider, so the `display: none` asserted on every stamped row below is doing work
  // rather than describing a deck that never had a header to begin with.
  { cls: 'divider', counter: null, header: 'block', footer: 'block' },
  { cls: 'divider numbered', counter: 'lat-divider' },
  { cls: 'divider silent numbered', counter: 'lat-divider' },
  { cls: 'divider light numbered', counter: 'lat-divider' },
  { cls: 'closing numbered', counter: null },
  // `silent` WITHOUT `numbered`: proves the chrome assertions above are reading the
  // modifier and not just `silent`, which suppresses header and footer on its own.
  { cls: 'divider silent', counter: null, header: 'none', footer: 'none' },
];
/**
 * The slide the pixel arm toggles. It compares this section against ITSELF with
 * `numbered` removed, so there is no second index — see the arm for why a two-section
 * comparison could not fail.
 */
const PIXEL_STAMPED = 2;

/**
 * Read every slide's heading-pseudo `content` off a laid-out page.
 *
 * Chromium returns the UNRESOLVED `counter(name, style)` string here rather than the
 * digits it paints, which is why the pixel arm below exists as well: this half proves
 * the declaration survived the cascade, that half proves it reaches the canvas.
 */
function readStamps(page, sectionSelector) {
  return page.evaluate((sel) => {
    return [...document.querySelectorAll(sel)].map((s) => {
      const heading = s.querySelector('h1, h2');
      const header = s.querySelector(':scope > header');
      // Both frames: the legacy `> footer` and the Form migration's `.cell-footer > footer`.
      const footer = s.querySelector(':scope > footer, :scope > .cell-footer > footer');
      return {
        cls: [...s.classList].filter((c) => c !== 'form').join(' '),
        content: heading ? getComputedStyle(heading, '::after').content : '<no heading>',
        header: header ? getComputedStyle(header).display : '<no header>',
        footer: footer ? getComputedStyle(footer).display : '<no footer>',
      };
    });
  }, sectionSelector);
}

function assertStamps(rows, surface) {
  assert.equal(rows.length, EXPECTED.length, `${surface}: slide count`);
  rows.forEach((row, i) => {
    const want = EXPECTED[i];
    assert.equal(row.cls, want.cls, `${surface}: slide ${i + 1} classes`);
    if (want.counter === null) {
      // Chromium reports `none` — not the `normal` initial value — for a pseudo that
      // generates no box, which is what "nothing declared a stamp here" looks like. A
      // stray stamp on a plain divider would be the modifier leaking, a different
      // defect, and worth failing on.
      assert.equal(row.content, 'none', `${surface}: "${want.cls}" grew a stamp it must not have`);
      if (want.header) assert.equal(row.header, want.header, `${surface}: "${want.cls}" header display`);
      if (want.footer) assert.equal(row.footer, want.footer, `${surface}: "${want.cls}" footer display`);
      return;
    }
    assert.match(
      row.content,
      new RegExp(`^counter\\(${want.counter},`),
      `${surface}: "${want.cls}" lost its stamp (computed content: ${row.content})`
    );
    // The masthead owns the top band, so a numbered divider stands the header AND the
    // footer down. Asserted as computed `display`, not class presence — and the deck
    // declares both, so the plain-divider row above (which asserts `block` for each)
    // proves this assertion is doing work rather than describing a deck that never had
    // chrome to begin with.
    assert.equal(row.header, 'none', `${surface}: "${want.cls}" still paints a running header under the masthead`);
    assert.equal(row.footer, 'none', `${surface}: "${want.cls}" still paints a footer`);
  });
}

describe('numbered bookend stamp — both render paths', { skip: skipWithoutChrome(resolveChrome()), timeout: TIMEOUT }, () => {
  let browser;
  before(async () => {
    browser = await puppeteer.launch({ executablePath: resolveChrome(), args: ['--no-sandbox'] });
  });
  after(async () => {
    if (browser) await browser.close();
  });

  test('the packed browser path (Playground / Studio / lib/runtime) stamps every numbered bookend', async () => {
    const engine = require(path.join(ROOT, 'lib', 'engine'));
    const { composeCss } = require(path.join(ROOT, 'lib', 'engine', 'css.js'));
    const out = engine.render(DECK, 'indaco', { preview: true });
    // THE PRODUCTION SURFACE for every browser host: the scoped stylesheet, not the
    // unscoped bundle the emulator inlines. The mask that broke this lives in here.
    const css = composeCss({
      themeCss: fs.readFileSync(path.join(ROOT, 'themes', 'indaco.css'), 'utf8'),
      baseLatticeCss: fs.readFileSync(path.join(ROOT, 'dist', 'lattice.css'), 'utf8'),
      sizeName: out.sizeName,
    });
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 1280, height: 720 });
      await page.setContent(
        `<!doctype html><html><head><style>${css}\n` +
          'html,body{margin:0}.lattice>section{width:1280px;height:720px}</style></head>' +
          `<body><article class="lattice">${out.html}</article></body></html>`,
        { waitUntil: 'networkidle0' }
      );
      assertStamps(await readStamps(page, 'article.lattice > section'), 'packed');

      // THE PIXEL ARM — and it compares ONE section against ITSELF, which is the whole
      // point of the shape.
      //
      // The first cut cropped the same corner from TWO DIFFERENT sections (`divider
      // silent` vs `divider silent numbered`) and asserted the buffers differ. That
      // assertion cannot fail: the dark canvas carries a gradient, so two sections
      // rasterize ±1 per channel regardless of the stamp. Measured with the stamp killed
      // outright (`content: none`, i.e. the exact pre-fix picture) it still "passed" —
      // 338 differing pixels, all ±1, spread across the whole crop and none of them
      // anywhere near the numeral. The one arm bought to satisfy HARD RULE #23 could not
      // fail for the reason it existed.
      //
      // So: screenshot the numbered section, strip `numbered` from THAT SAME element,
      // screenshot again. Same element, same position, same rasterization — the numeral
      // is now the only thing that can differ, and byte equality means it painted
      // nothing. The guard below proves the harness can still detect sameness.
      const sections = await page.$$('article.lattice > section');
      const stampedEl = sections[PIXEL_STAMPED];
      // THE CROP ISOLATES THE NUMERAL, and that is load-bearing too. A crop wide enough
      // to include the HAIRLINE passes on the rule alone: mutation-tested with
      // `color: transparent` — numeral invisible, rule still painting — and a full-corner
      // crop reported "differs" and went green. At 1280x720 (1cqi = 12.8px) the mark is
      // laid out `left: 9.375cqi = 120`, `top: 5cqi = 64`, `--fs-hero = 114.7` tall, then
      // 20.5 of padding and the 1px rule at y ~199. So this window — x 100..340,
      // y 50..190 — holds the digits and stops short of the rule.
      const corner = async (el) => {
        const box = await el.boundingBox();
        return page.screenshot({
          clip: { x: box.x + 100, y: box.y + 50, width: 240, height: 140 },
          captureBeyondViewport: true,
        });
      };

      const withStamp = await corner(stampedEl);
      // FALSIFIABILITY GUARD: the same element twice, untouched, must be byte-identical.
      // Without this the arm below could pass on rasterization noise all over again.
      assert.equal(
        Buffer.compare(withStamp, await corner(stampedEl)),
        0,
        'two screenshots of one unchanged element differ — the pixel harness is noisy and its verdict means nothing'
      );

      await stampedEl.evaluate((el) => el.classList.remove('numbered'));
      const withoutStamp = await corner(stampedEl);
      await stampedEl.evaluate((el) => el.classList.add('numbered'));

      assert.notEqual(
        Buffer.compare(withStamp, withoutStamp),
        0,
        'removing `numbered` from the section changed nothing where the numeral sits — the stamp is declared but paints no pixels'
      );
    } finally {
      await page.close();
    }
  });

  // The mark's BAND, measured rather than trusted.
  //
  // The masthead is `position: absolute` and the headline block is flex-CENTERED, so the
  // two lay out independently: as the heading wraps to more lines the block grows in both
  // directions from the middle and its top edge climbs toward the mark. Before the band
  // was reserved it reached it — at five lines the numeral struck through the eyebrow and
  // the hairline cut the first line of copy — and NOTHING SAW IT, because an absolutely
  // positioned pseudo lying on top of the copy is an OVERLAP, and every overflow channel
  // in the engine measures content spilling PAST the frame.
  //
  // So this asserts the geometric invariant directly: the top of the flowed block never
  // crosses the bottom of the mark, at any heading length. It measures the BLOCK, not the
  // heading — the eyebrow is the first thing up there, and an earlier cut of the authoring
  // rule measured the h2 alone and read a line late as a result.
  const BAND_DECK = ['---', 'marp: true', 'theme: indaco', 'paginate: true', '---'].join('\n') +
    [3, 6, 9, 12, 15, 18, 24, 30]
      .map((n) => `\n\n<!-- _class: divider numbered -->\n\n\`section\`\n\n## ${'model '.repeat(n).trim()}\n\n---`)
      .join('')
      .replace(/\n---$/, '');

  test('a heading of any length stays clear of the section mark', async () => {
    const engine = require(path.join(ROOT, 'lib', 'engine'));
    const { composeCss } = require(path.join(ROOT, 'lib', 'engine', 'css.js'));
    const out = engine.render(BAND_DECK, 'indaco', { preview: true });
    const css = composeCss({
      themeCss: fs.readFileSync(path.join(ROOT, 'themes', 'indaco.css'), 'utf8'),
      baseLatticeCss: fs.readFileSync(path.join(ROOT, 'dist', 'lattice.css'), 'utf8'),
      sizeName: out.sizeName,
    });
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 1280, height: 720 });
      await page.setContent(
        `<!doctype html><html><head><style>${css}\n` +
          'html,body{margin:0}.lattice>section{width:1280px;height:720px}</style></head>' +
          `<body><article class="lattice">${out.html}</article></body></html>`,
        { waitUntil: 'networkidle0' }
      );
      const rows = await page.evaluate(() => {
        return [...document.querySelectorAll('article.lattice > section')].map((s, i) => {
          const sr = s.getBoundingClientRect();
          const h = s.querySelector('h2');
          let blockTop = Infinity;
          for (const c of s.children) {
            if (c.hasAttribute('data-lattice-berth')) continue;
            const st = getComputedStyle(c);
            if (st.position === 'absolute' || st.position === 'fixed') continue;
            const r = c.getBoundingClientRect();
            if (!r.height) continue;
            blockTop = Math.min(blockTop, r.top - sr.top);
          }
          // THE PAINTED BOTTOM EDGE, not the content box — and the difference is the
          // whole assertion. The pseudo is `content-box`, so `height` counts the
          // NUMERAL only; beneath it sit `padding-bottom` (--_mark-rule-gap) and the
          // `border-bottom` that IS the hairline — the very thing the copy must clear.
          // Measured at 1280x720/indaco: top 64 + height 114.672 = 178.67 content-box,
          // against a painted 200.15. The first cut of this arm used the content-box
          // sum and so carried 21.48px of hidden slack; a checker shrank the band to
          // `--_mark-top + --fs-hero + 1px` and this test PASSED on a render whose
          // hairline struck straight through the eyebrow. Anything added below the
          // numeral must be added here too.
          const a = getComputedStyle(h, '::after');
          const px = (v) => parseFloat(v) || 0;
          return {
            slide: i + 1,
            chars: h.textContent.trim().length,
            blockTop,
            markBottom: px(a.top) + px(a.height) + px(a.paddingBottom) + px(a.borderBottomWidth),
          };
        });
      });
      assert.equal(rows.length, 8, 'the band deck did not render the slides it declares');
      // A range wide enough that the block is pinned by the band on the long end and
      // freely centered on the short end — if BOTH ends read the same the deck stopped
      // exercising the wrap and this test has gone vacuous.
      assert.ok(rows[0].blockTop > rows.at(-1).blockTop + 40,
        'every heading laid out at the same height — the deck is no longer wrapping, so ' +
        'the clearance assertion below proves nothing');
      for (const r of rows) {
        assert.ok(r.blockTop > r.markBottom,
          `a ${r.chars}-character heading put the block top at ${r.blockTop.toFixed(1)}px, ` +
          `at or above the mark's PAINTED bottom edge at ${r.markBottom.toFixed(1)}px — the copy is ` +
          'in the mark\'s band. Reserve more of it (`--_mark-band`, base.modifiers.css).');
      }
    } finally {
      await page.close();
    }
  });

  test('the emulator / CLI export path stamps every numbered bookend', async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const md = path.join(OUT, 'deck.md');
    const html = path.join(OUT, 'deck.html');
    fs.writeFileSync(md, DECK);
    // `.html` output is a real browser render (auto-split and the overflow passes run);
    // it only skips the PDF encode, so it is the export DOM at a fraction of the cost.
    execFileSync(process.execPath, [EMULATOR, md, '-o', html, '-p', 'indaco', '-q'], {
      cwd: ROOT,
      stdio: 'pipe',
    });
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 1280, height: 720 });
      await page.goto(`file://${html}`, { waitUntil: 'networkidle0' });
      assertStamps(await readStamps(page, 'section[data-lattice-slide]'), 'emulator');
    } finally {
      await page.close();
    }
  });
});
