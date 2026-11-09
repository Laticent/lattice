/**
 * THE FOOTER BAND's ALLOCATION POLICY, in the real cascade and real Chromium.
 *
 * The band is a shared, finite width with up to THREE marks in it, and for a long time nothing
 * said who yields. Three attempts to arbitrate it at layout time failed, each by re-deriving a
 * plausible number that was not the truth. The policy is an ORDER
 * (engineering/decisions/2026-07-27-footer-band-allocation.md):
 *
 * THREE, not four. The k-of-N split rail used to be a fourth mark competing here, and it was the
 * worst of them — it grows with the run, so a long split pushed the author's words into an
 * ellipsis on every page of it. It is not in this band any more: a split page carries no deck
 * header, footer or section rail at all (2026-09-01-autosplit-splits-on-structure.md § "The
 * chrome a split page carries"), so the rail shares its band with nothing but the page number and
 * this suite's subject exists only on slides the splitter did not touch. That is also why the
 * fixture is prose and atomic layouts: when splitting went structural every list slide in it
 * split, lost its band, and the suite measured ZERO bands.
 *
 *   1. the page number   — never yields
 *   2. the dots          — never yield; bucketed to MAX_DOTS in progress.transform.js, so the
 *                          rail's width is bounded by CONSTRUCTION rather than by a cap
 *   3. the author's text — takes everything left, `…` past that
 *   4. the section name  — gone. Not hidden: not emitted.
 *
 * Rank 4 is the load-bearing one, and the reason this suite's central assertion is about
 * FLEXIBILITY rather than geometry. The rail used to carry the divider's eyebrow, one
 * `white-space: nowrap` string that could not yield. Promoting the footer to a flex item while
 * that string was still there put TWO unshrinkable strings in one row, so flexbox shrank both: an
 * ordinary board deck lost "any person not named on the distribution schedule" from the exported
 * PDF's text layer, and the rail truncated to "SECTION 02 · OPERAT…". That shipped as far as a
 * green PR before the trio caught it. With exactly one flexible item in the row it cannot recur —
 * so "exactly one flexible item" is what gets pinned, not the pixel positions it produces.
 *
 * Measuring this went wrong four times, which is why the assertions are shaped as they are:
 *   · footer BOX vs rail box said 42 pages were broken — an absolute footer's box is its 52cqi
 *     budget, not its text, so most had no ink near the rail;
 *   · the text via a `Range` said the fix made things WORSE — `getClientRects()` returns laid-out
 *     text and `overflow: hidden` clips paint without moving layout, so a correctly-ellipsised run
 *     still measures full width;
 *   · `flex-shrink: 8` on the rail, to make it yield first, drove it to 0px wide, dots and all;
 *   · and the fix itself then clipped every diacritic off accented CAPITALS, which neither box nor
 *     ink geometry can see at all, because the loss is sub-box PAINT.
 * So this suite asserts the properties that GUARANTEE the rendering — in-flow items cannot overlap,
 * only the footer's column can flex, `overflow: hidden` confines ink to the box, and the box must be tall
 * enough to contain that ink — and it verifies the band is genuinely contended first, because
 * every shrink assertion below is vacuous on a band with slack. The first version of this file
 * asserted only that both boxes had width > 0 and let SEVEN of nine mutations through.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const puppeteer = require('puppeteer');
const { ROOT, runEmulator } = require('../../helpers/render');

/** Best-effort Chromium path — mirrors split-envelope-css.test.js. */
function resolveChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  for (const root of [path.join(os.homedir(), '.cache', 'puppeteer', 'chrome'), '/root/.cache/puppeteer/chrome']) {
    if (!fs.existsSync(root)) continue;
    for (const build of fs.readdirSync(root).filter((d) => d.startsWith('linux-')).sort().reverse()) {
      const bin = path.join(root, build, 'chrome-linux64', 'chrome');
      if (fs.existsSync(bin)) return bin;
    }
  }
  return undefined;
}

describe('footer band — a contended band keeps every mark legible', () => {
  const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'footer-band-contended.md');
  let browser;
  let bands;
  let hidden;

  before(async () => {
    browser = await puppeteer.launch({ executablePath: resolveChrome(), args: ['--no-sandbox', '--allow-file-access-from-files'] });
    const pdf = runEmulator(FIXTURE, { timeout: 120000 });
    const page = await browser.newPage();
    // The deck's own `portrait` canvas — the viewport the emulator measures at. Reading the band at some
    // other size lays it out differently and reports numbers for a slide nobody renders.
    await page.setViewport({ width: 1080, height: 1350 });
    await page.goto('file://' + path.resolve(pdf.replace(/\.pdf$/, '.html')), { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 2500));
    const read = await page.evaluate(() => {
      const promoted = [];
      const suppressed = [];
      // Ink extent of an element's TEXT via a Range: this is LAID-OUT text, so it is the right
      // tool for "does the box contain its own ink" and the WRONG tool for "is the text clipped".
      // Text nodes only, deliberately. A Range over an element's whole contents also returns rects
      // for replaced elements, and the footer is allowed — required — to clip a tall inline `<img>`
      // rather than grow the band. Including it would turn the diacritic assertion into a
      // band-height assertion, which is a different test that lives below.
      const inkHeight = (el) => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        const rs = [];
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (!n.nodeValue.trim()) continue;
          const r = document.createRange();
          r.selectNodeContents(n);
          rs.push(...r.getClientRects());
        }
        if (!rs.length) return 0;
        return Math.max(...rs.map((x) => x.bottom)) - Math.min(...rs.map((x) => x.top));
      };
      document.querySelectorAll('section[data-lattice-slide]').forEach((s, i) => {
        const cell = s.querySelector(':scope > .cell-footer');
        if (!cell) return;
        const footer = cell.querySelector(':scope > footer');
        if (!footer) return;
        const cs = getComputedStyle(footer);
        if (cs.display === 'none') { suppressed.push({ page: i + 1, cls: s.className }); return; }
        const rail = cell.querySelector(':scope > .tile-progress');
        if (!rail) return;
        const box = (el) => { const b = el.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, height: b.height, width: b.width }; };
        promoted.push({
          page: i + 1,
          position: cs.position,
          display: cs.display,
          overflow: cs.overflow,
          textOverflow: cs.textOverflow,
          whiteSpace: cs.whiteSpace,
          maxWidth: cs.maxWidth,
          bandDisplay: getComputedStyle(cell).display,
          // The band's resolved columns in px, named lines dropped: footer · split · rail · page.
          tracks: getComputedStyle(cell).gridTemplateColumns.split(/\s+/).filter((t) => /px$/.test(t)).map(parseFloat),
          hasPag: !!cell.querySelector(':scope > .lat-pagination'),
          footerColumn: cs.gridColumnStart,
          lineHeight: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2,
          footer: box(footer),
          footerClientW: footer.clientWidth,
          footerScrollW: footer.scrollWidth,
          footerClientH: footer.clientHeight,
          footerInkH: inkHeight(footer),
          rail: box(rail),
          railHasLabel: !!rail.querySelector('.seg'),
          // The rail's own rect is NOT where its ink is. `overflow` on the rail is `visible`, so a
          // `max-width` narrower than the dots does not clip them — it spills them leftward, out of
          // the reported box and over the footer. Comparing the two BOXES is the first wrong
          // measurement this whole investigation catalogs, and it shipped here once more: a
          // clamped rail overlapped the footer by 82.8px while its rect said it started 35px clear.
          // `scrollWidth` is no help either (it reported 194 against 194). So take the LEFTMOST DOT.
          inkLeft: (() => {
            const ds = [...rail.querySelectorAll('.dot')].map((d) => d.getBoundingClientRect().left);
            return ds.length ? Math.min(...ds, rail.getBoundingClientRect().left) : rail.getBoundingClientRect().left;
          })(),
          // Every OTHER item in the row, with the two properties that decide whether it can take
          // width from the footer. This is the assertion that makes the export regression
          // structurally impossible rather than merely absent today.
          others: [...cell.children].filter((k) => k !== footer).map((k) => {
            const width = k.getBoundingClientRect().width;
            // Its own content width, read by letting it size to its content for one measurement.
            const prev = k.style.width;
            k.style.width = 'max-content';
            const natural = k.getBoundingClientRect().width;
            k.style.width = prev;
            return { cls: k.className || k.tagName, pag: k.classList.contains('lat-pagination'), width, natural };
          }),
          // The dots' own shape — an `on` dot is a pill, an off dot a circle, and a squeezed
          // row used to flatten both into indistinguishable slivers.
          dots: [...rail.querySelectorAll('.dot')].map((d) => {
            const b = d.getBoundingClientRect();
            return { on: d.classList.contains('on'), w: b.width, h: b.height };
          }),
          band: box(cell),
          // The reserve the rail is supposed to fit inside, resolved to px on this canvas. The
          // rail's natural width against its own berth is the quantity that has been wrong three
          // times in this change's history, so it is asserted directly rather than inferred from
          // whether anything happens to overlap today.
          centerW: (() => {
            const probe = document.createElement('div');
            probe.style.cssText = 'position:absolute;visibility:hidden;width:var(--footer-center-w)';
            cell.appendChild(probe);
            const w = probe.getBoundingClientRect().width;
            probe.remove();
            return w;
          })(),
        });
      });
      return { promoted, suppressed };
    });
    bands = read.promoted;
    hidden = read.suppressed;
    await page.close();
  });
  after(async () => { if (browser) await browser.close(); });

  test('the fixture is GENUINELY contended — every assertion below depends on it', () => {
    assert.ok(bands.length >= 2, `expected slides with a footer band, got ${bands.length}`);
    // The load-bearing precondition. Without over-subscription nothing shrinks, so `flex`,
    // `white-space`, `text-overflow` and `min-width` are all exercised by nothing — which is
    // precisely how seven of nine mutations to those declarations survived this suite's first
    // version. Demand that the footer is actually clipped on the page.
    const clipped = bands.filter((b) => b.footerScrollW > b.footerClientW);
    assert.ok(clipped.length > 0,
      'the band has slack — nothing is clipped, so the shrink assertions would pass vacuously. '
      + `Lengthen the footer string. Measured: ${JSON.stringify(bands.map((b) => ({ p: b.page, f: `${b.footerScrollW}/${b.footerClientW}` })))}`);
  });

  test('the footer is the row\'s ONLY flexible item', () => {
    // THE central invariant, and the one that would have caught the reverted attempt. A second
    // item that can grow or shrink turns the row into a negotiation between two strings, and
    // a two-string negotiation truncates both — which is how a confidentiality footer lost
    // "any person not named on the distribution schedule" from the exported PDF while the
    // section label it was competing with truncated too. The band is a GRID since 2026-11-08
    // (stage.css `.cell-footer`, engineering/decisions/2026-11-08-anchor-chrome.md), so the rule
    // lives in its columns: the footer's is the only flexible one (`minmax(0, 1fr)`), every
    // wayfinding mark is exactly its content wide (an `auto` column), and the page number's column
    // is a fixed reserve, the same width on every slide whatever its digits.
    const pagWidths = new Set();
    for (const b of bands) {
      assert.equal(b.bandDisplay, 'grid', `p${b.page}: the footer band is a grid`);
      assert.equal(b.footerColumn, 'footer', `p${b.page}: the footer sits in the band's flexible column`);
      for (const o of b.others) {
        if (o.pag) {
          pagWidths.add(o.width.toFixed(2));
          continue;
        }
        assert.ok(Math.abs(o.width - o.natural) < 0.5,
          `p${b.page}: \`${o.cls}\` is ${o.width.toFixed(1)}px in a ${o.natural.toFixed(1)}px content box — `
          + 'a mark that grows takes width the footer needs; one that shrinks is negotiating for it');
      }
    }
    assert.ok(pagWidths.size <= 1, `the page number's column changed width across pages: ${[...pagWidths].join(', ')}`);
  });

  test('only the footer\'s COLUMN flexes, and the rail holds still on every page', () => {
    // The item-width check above cannot see a COLUMN that grows: a `1fr` rail column with the rail
    // pinned to its end takes the footer's width while the rail stays content-wide (the checker's
    // mutation, 2026-11-08). So read the resolved columns. The split and rail columns are exactly
    // their marks wide, or zero; the page-number column is one width on every page, drawn or not;
    // and so the rail's distance from the band's end is ONE number across the deck, including the
    // page with no number and the `compact` page, the two places it used to move.
    const railInsets = new Set();
    const railLifts = new Set();
    const pagCols = new Set();
    for (const b of bands) {
      assert.equal(b.tracks.length, 4, `p${b.page}: the band resolved ${b.tracks.length} columns, not 4: ${b.tracks.join(' ')}`);
      const [, split, rail, pag] = b.tracks;
      const railNatural = b.others.find((o) => /tile-progress/.test(o.cls))?.natural ?? 0;
      const splitNatural = b.others.find((o) => /lat-split-rail/.test(o.cls))?.natural ?? 0;
      assert.ok(Math.abs(rail - railNatural) < 0.5, `p${b.page}: the rail's column is ${rail.toFixed(1)}px for a ${railNatural.toFixed(1)}px rail — it flexes`);
      assert.ok(Math.abs(split - splitNatural) < 0.5, `p${b.page}: the split column is ${split.toFixed(1)}px for a ${splitNatural.toFixed(1)}px counter — it flexes`);
      pagCols.add(pag.toFixed(1));
      railInsets.add((b.band.right - b.rail.right).toFixed(1));
      railLifts.add((b.band.bottom - b.rail.bottom).toFixed(1));
    }
    assert.ok(bands.some((b) => !b.hasPag), 'the fixture lost its railed page with no page number');
    assert.equal(pagCols.size, 1, `the page-number column changed width: ${[...pagCols].join(', ')}`);
    assert.equal(railInsets.size, 1, `the rail moved across pages: its inset from the band's end was ${[...railInsets].join(', ')}px`);
    // And it holds its HEIGHT: the fixture's page whose footer carries an inline image is where it used
    // to drop (3px at hd, 6px in story) when the image moved the band's shared baseline.
    assert.equal(railLifts.size, 1, `the rail moved up or down across pages: its lift off the band's bottom was ${[...railLifts].join(', ')}px`);
  });

  test('the section rail carries NO label — rank 4 of the order', () => {
    // The rail's eyebrow is not hidden, it is not emitted (progress.transform.js). Hiding it in
    // CSS would leave a node that can still contribute width, and the whole policy rests on the
    // row having exactly one string in it.
    for (const b of bands) {
      assert.equal(b.railHasLabel, false,
        `p${b.page}: the section rail is carrying a label again — that is the unshrinkable string `
        + 'whose removal is what makes promoting the footer safe.');
    }
  });

  test('the footer is a real in-flow ITEM that ellipsises rather than clipping mid-word', () => {
    for (const b of bands) {
      assert.equal(b.position, 'static', `p${b.page}: an absolute footer cannot participate in the row`);
      assert.match(b.overflow, /hidden|clip/, `p${b.page}: ink must be confined to the box for ellipsis to mean anything`);
      assert.equal(b.textOverflow, 'ellipsis', `p${b.page}: a mid-word clip with no ellipsis reads as a rendering bug`);
      assert.equal(b.whiteSpace, 'nowrap', `p${b.page}: the band has room for exactly one line`);
      // `text-overflow` computes to `ellipsis` on a flex CONTAINER too but never applies, so the
      // computed value alone cannot distinguish "ellipsises" from "clips mid-word". Pin the display.
      assert.equal(b.display, 'block', `p${b.page}: a flex container ignores text-overflow — the clip would be mid-word`);
    }
  });

  test('the ROW decides the footer\'s width — no budget is re-imposed on top of it', () => {
    // A cap and a flex share are two answers to the same question, and the cap wins silently.
    // The footer carried `max-width: var(--footerleft-w, 52cqi)` before the band had an order;
    // restoring it truncates the footer earlier than the row would have, and NOTHING moves to
    // show for it, because the wayfinding marks simply sit further left. The loss is only the
    // author's words, and only inside the ellipsis — so it has to be pinned as a property.
    for (const b of bands) {
      assert.equal(b.maxWidth, 'none',
        `p${b.page}: the footer is capped at ${b.maxWidth} on top of its flex share — the row can no `
        + 'longer allocate the band, and the cap silently wins.');
      // The footer's column starts at the band's left, so a footer that stops short detaches from the page's left
      // margin — out of line with the header and the body. Cheap, and it is the visible symptom.
      assert.ok(Math.abs(b.footer.left - b.band.left) < 1,
        `p${b.page}: the footer starts at ${b.footer.left.toFixed(1)} but the band's left margin is `
        + `${b.band.left.toFixed(1)} — it no longer lines up with the header and the body.`);
    }
  });

  test('the footer and the section rail never overlap — measured against the DOTS', () => {
    // Against `inkLeft`, not `rail.left`. Flex items cannot overlap, but a `max-width` on a flex
    // CONTAINER whose `overflow` is `visible` lets its contents escape the box — so the rail's rect
    // can sit clear of the footer while its dots are painted straight through the author's words.
    // That is not hypothetical: a revision of this change cut `--footer-center-w` to 20cqi on
    // arithmetic that used `section.compact`'s `--sp-sm` instead of the default, and every portrait
    // deck with 8+ sections overprinted. The rail's rect said it cleared by 35px; the dots were
    // 82.8px inside the footer. The trio's inversion pass found it on a raster.
    for (const b of bands) {
      assert.ok(b.footer.right <= b.inkLeft + 1,
        `p${b.page}: the footer's box ends at ${b.footer.right.toFixed(1)} but the leftmost DOT is at `
        + `${b.inkLeft.toFixed(1)} — the rail is painting over the author's footer text. `
        + `(The rail's own rect starts at ${b.rail.left.toFixed(1)}, which is why box-vs-box misses this.)`);
    }
  });

  test('the rail FITS the berth reserved for it — the constant that keeps being wrong', () => {
    // `--footer-center-w` is the rail's reserved width. It governs the ABSOLUTE placement
    // (progress-center.css) and the undocked split rail's dodge, neither of which the docked
    // `max-width: none` reaches — so an under-sized value still spills dots over the footer there.
    // This has been set wrong twice: once from `section.compact`'s `--sp-sm` instead of the
    // default (18.69 → a 20-unit token → 82.8px of dots through the footer on every portrait deck
    // of 8+ sections), and once from a re-measurement taken as a percentage of the SLIDE rather
    // than in the token's own `--_sec-1cqi` unit (28.95 → a 30-unit token, still 21px short).
    // Assert the relationship instead of the number, so the next canvas or dot-size change cannot
    // silently invalidate it.
    for (const b of bands) {
      assert.ok(b.rail.width <= b.centerW + 1,
        `p${b.page}: the rail is ${b.rail.width.toFixed(1)}px but its reserved berth `
        + `(--footer-center-w) is only ${b.centerW.toFixed(1)}px. The reserve is not a clip — the `
        + 'dots will spill leftward over the footer wherever the cap actually applies. Re-measure a '
        + 'full 10-dot rail IN PORTRAIT, in --_sec-1cqi units, and raise the token.');
    }
  });

  test('the rail\'s box CONTAINS its dots — a cap here spills, it does not clip', () => {
    // The direct form of the same defect, independent of whether the footer happens to be long
    // enough to be hit. `--footer-center-w` is a RESERVE, and a reserve smaller than what it
    // reserves for is worse than none: `overflow: visible` + `justify-content: flex-end` sends the
    // excess leftward across the band. Re-measure in PORTRAIT if MAX_DOTS changes — portrait's
    // larger `--canvas-scale` makes the rail 28.95cqi against 19.33cqi at `hd`.
    for (const b of bands) {
      assert.ok(b.inkLeft >= b.rail.left - 1,
        `p${b.page}: the rail's dots start at ${b.inkLeft.toFixed(1)}, outside its own box at `
        + `${b.rail.left.toFixed(1)} — something capped the rail below the width its dots need.`);
    }
  });

  test('the box CONTAINS its own ink — a clipping box must not shave the diacritics', () => {
    // The failure no geometric test could see: `overflow: hidden` on the base footer's
    // `line-height: 1` gives a 12.7px box around 17px of ink, so everything above cap height is
    // painted away — `ÜBERPRÜFUNG` printed as `UBERPRUFUNG`. Box and ink extents are both
    // unchanged by it, because the loss is sub-box paint. This is the assertion that catches it.
    for (const b of bands) {
      assert.ok(b.footerClientH + 0.5 >= b.footerInkH,
        `p${b.page}: the footer clips its own text vertically — ${b.footerClientH}px box around `
        + `${b.footerInkH.toFixed(1)}px of ink. Anything above cap height (É À Ü, a <sup>) is shaved off.`);
    }
  });

  test('a dot keeps its shape — the "you are here" pill stays a pill', () => {
    // `.dot` carried the default `flex-shrink: 1`, so on a contended band the current-section pill
    // collapsed from 39×13 to an 11×13 circle and the off dots to 3×13 slivers — losing the one
    // difference that says where you are. Found by the trio's inversion pass, on a raster.
    for (const b of bands) {
      assert.ok(b.dots.length > 0, `p${b.page}: the rail lost its dots entirely`);
      for (const d of b.dots) {
        assert.ok(d.w > 0.5 && d.h > 0.5, `p${b.page}: a dot measured ${d.w.toFixed(1)}×${d.h.toFixed(1)} — crushed`);
        if (d.on) {
          assert.ok(d.w > d.h * 1.5,
            `p${b.page}: the current-section dot is ${d.w.toFixed(1)}×${d.h.toFixed(1)} — it has lost the `
            + 'elongated pill shape that distinguishes it from the others');
        } else {
          assert.ok(Math.abs(d.w - d.h) < 1,
            `p${b.page}: an off dot is ${d.w.toFixed(1)}×${d.h.toFixed(1)} — no longer round`);
        }
      }
    }
  });

  test('the author\'s words keep the larger share of the band', () => {
    for (const b of bands) {
      assert.ok(b.footer.width > b.rail.width,
        `p${b.page}: the generated rail (${b.rail.width.toFixed(1)}px) is wider than the author's footer `
        + `(${b.footer.width.toFixed(1)}px) — wayfinding must not outrank the author`);
      assert.ok(b.footer.width >= b.band.width * 0.25,
        `p${b.page}: the footer collapsed to ${b.footer.width.toFixed(1)}px of a ${b.band.width.toFixed(1)}px band`);
      assert.ok(b.rail.width > 0,
        `p${b.page}: the section rail was crushed to ${b.rail.width.toFixed(1)}px — the dots are gone`);
    }
  });

  test('the promoted footer does not grow the band', () => {
    // An absolute footer had a definite height from `inset-block: 0`; an in-flow auto-height item
    // does not, so a taller inline run (an image, a <sup>) could push the band up and make the
    // wayfinding marks jump page to page. Nothing else measures this band: `--footer-h` is a static
    // token, and `flowedSpill` skips absolute children so the overflow probe never sees the cell.
    const heights = [...new Set(bands.map((b) => Math.round(b.band.height)))];
    assert.equal(heights.length, 1, `the band height varies across slides: ${heights.join(', ')}px`);
    for (const b of bands) {
      assert.ok(b.band.height <= b.lineHeight * 2.2,
        `p${b.page}: band is ${b.band.height.toFixed(1)}px against a ${b.lineHeight.toFixed(1)}px line — the footer grew it`);
    }
  });

  test('`silent` and `no-footer` still suppress the footer text', () => {
    // The promote rule ties with all four hide rules on specificity, so which wins is decided by
    // bundle file order alone — and the promotion now applies to EVERY band, so that tie is live
    // on every railed page rather than only on split ones.
    assert.equal(hidden.length, 2, `expected the silent + no-footer slides to hide their footer, got ${hidden.length}`);
    assert.ok(hidden.some((h) => /\bsilent\b/.test(h.cls)), 'the `silent` slide still shows its footer');
    assert.ok(hidden.some((h) => /\bno-footer\b/.test(h.cls)), 'the `no-footer` slide still shows its footer');
  });
});

describe('footer band — each mark pays for itself, and the band clears a bottom-right logo', () => {
  // #3095 made the band a grid with a `column-gap`, which a grid charges around EMPTY columns too, so
  // a slide with no rail lost up to three gaps of footer room and ten corpus decks' footers ended in an
  // ellipsis (overflow nightly run 81). The fix moved each gap onto its mark as padding. That fix then
  // ran the footer into a bottom-right logo, which the empty gaps had cleared only by accident, and a
  // specificity slip in it re-sliced `center`'s grid. Each of the three is asserted here.
  const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'footer-band-room.md');
  let browser;
  let slides;

  before(async () => {
    browser = await puppeteer.launch({ executablePath: resolveChrome(), args: ['--no-sandbox', '--allow-file-access-from-files'] });
    const pdf = runEmulator(FIXTURE, { timeout: 120000 });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto('file://' + path.resolve(pdf.replace(/\.pdf$/, '.html')), { waitUntil: 'networkidle0' });
    // Wait for a signal, not a duration (HARD RULE #32): the band is laid out once the fonts are.
    await page.evaluate(() => document.fonts.ready);
    slides = await page.evaluate(() => [...document.querySelectorAll('section')]
      .filter((s) => !s.parentElement.closest('section'))
      .map((s, i) => {
        const cell = s.querySelector(':scope > .cell-footer');
        const footer = cell?.querySelector(':scope > footer');
        const logo = s.querySelector(':scope > img.deck-logo');
        const cs = cell && getComputedStyle(cell);
        return {
          page: i + 1,
          cls: s.className,
          tracks: cs ? cs.gridTemplateColumns.split(' ').filter((t) => /px$/.test(t)).map(parseFloat) : [],
          contentW: cell ? cell.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) : 0,
          footerRight: footer ? footer.getBoundingClientRect().right : null,
          logoLeft: logo ? logo.getBoundingClientRect().left : null,
          railShown: !!(cell && [...cell.children].some((k) => k.classList.contains('tile-progress') && getComputedStyle(k).display !== 'none')),
        };
      }));
    await page.close();
  });
  after(async () => { if (browser) await browser.close(); });

  const find = (re) => {
    const s = slides.find((x) => re.test(x.cls));
    assert.ok(s, `the fixture lost its ${re} slide`);
    return s;
  };

  test('the fixture draws a rail where it should — the assertions below depend on it', () => {
    const railed = slides.filter((x) => x.railShown);
    assert.ok(railed.some((x) => !/progress-rail-center|no-progress|logo-bottom-right/.test(x.cls)), 'no plain slide draws a rail');
    assert.ok(railed.some((x) => /progress-rail-center/.test(x.cls)), 'the center slide draws no rail');
  });

  test('a slide without a rail charges the footer no gap for the empty columns', () => {
    const s = find(/\bno-progress\b/);
    assert.equal(s.tracks.length, 4, `p${s.page}: ${s.tracks.join(' ')}`);
    const [footer, split, rail, pag] = s.tracks;
    assert.equal(split, 0, `p${s.page}: the empty split column is ${split}px`);
    assert.equal(rail, 0, `p${s.page}: the empty rail column is ${rail}px`);
    assert.ok(Math.abs(footer + pag - s.contentW) < 0.5,
      `p${s.page}: footer ${footer} + page column ${pag} != band ${s.contentW}: something else takes the footer's room`);
  });

  test('a bottom-right logo hides the rail and number, and the footer ends short of it', () => {
    const s = find(/\blogo-bottom-right\b/);
    assert.ok(s.logoLeft != null && s.footerRight != null, `p${s.page}: the logo or the footer is missing`);
    assert.ok(!s.railShown, `p${s.page}: the rail still shows under a bottom-right logo`);
    assert.ok(s.footerRight <= s.logoLeft,
      `p${s.page}: the footer box ends at ${s.footerRight.toFixed(1)}px, past the logo's left edge at ${s.logoLeft.toFixed(1)}px`);
  });

  test('`center` keeps its own five-track grid', async () => {
    // Read the property that defines center, not a track count: a re-sliced band still resolves five values
    // (four named columns plus an implicit fifth for the items center places there), but its edge tracks are
    // no longer equal, so the rail is off the band's center.
    const symmetric = (t) => t.length === 5 && Math.abs(t[0] - t[4]) < 0.5;
    const s = find(/\bprogress-rail-center\b/);
    assert.ok(symmetric(s.tracks), `p${s.page}: center's tracks are not symmetric: ${s.tracks.join(' ')}`);
    // The fixed-column rule and center's grid can tie on specificity, and then the BUNDLE's order decides,
    // which differs from deck to deck: the fixture above kept five tracks with a guard that re-sliced
    // examples/progress-rail.md's center slide into four (2026-11-09). So read that deck too.
    const pdf = runEmulator(path.join(ROOT, 'examples', 'progress-rail.md'), { timeout: 120000 });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto('file://' + path.resolve(pdf.replace(/\.pdf$/, '.html')), { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    const tracks = await page.evaluate(() => {
      const s = [...document.querySelectorAll('section.progress-rail-center')].find((x) => x.querySelector(':scope > .cell-footer > .tile-progress'));
      return s ? getComputedStyle(s.querySelector(':scope > .cell-footer')).gridTemplateColumns.split(' ').filter((t) => /px$/.test(t)).map(parseFloat) : [];
    });
    await page.close();
    assert.ok(symmetric(tracks), `examples/progress-rail.md's center slide: tracks ${tracks.join(' ')} are not center's symmetric five`);
  });
});
