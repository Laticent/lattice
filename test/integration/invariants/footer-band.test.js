/**
 * THE FOOTER BAND's ALLOCATION POLICY, in the real cascade and real Chromium.
 *
 * The band is a shared, finite width with up to four marks in it, and for a long time nothing
 * said who yields. Three attempts to arbitrate it at layout time failed, each by re-deriving a
 * plausible number that was not the truth. The policy is now an ORDER
 * (engineering/decisions/2026-07-27-footer-band-allocation.md):
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
 * So this suite asserts the properties that GUARANTEE the rendering — flex items cannot overlap,
 * only one item can flex, `overflow: hidden` confines ink to the box, and the box must be tall
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
      // Ink extent of an element's text via a Range: this is LAID-OUT text, so it is the right
      // tool for "does the box contain its own ink" and the WRONG tool for "is the text clipped".
      const inkHeight = (el) => {
        const r = document.createRange();
        r.selectNodeContents(el);
        const rs = [...r.getClientRects()];
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
        const box = (el) => { const b = el.getBoundingClientRect(); return { left: b.left, right: b.right, height: b.height, width: b.width }; };
        promoted.push({
          page: i + 1,
          position: cs.position,
          display: cs.display,
          overflow: cs.overflow,
          textOverflow: cs.textOverflow,
          whiteSpace: cs.whiteSpace,
          maxWidth: cs.maxWidth,
          flexGrow: cs.flexGrow,
          lineHeight: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2,
          footer: box(footer),
          footerClientW: footer.clientWidth,
          footerScrollW: footer.scrollWidth,
          footerClientH: footer.clientHeight,
          footerInkH: inkHeight(footer),
          rail: box(rail),
          railHasLabel: !!rail.querySelector('.seg'),
          // Every OTHER item in the row, with the two properties that decide whether it can take
          // width from the footer. This is the assertion that makes the export regression
          // structurally impossible rather than merely absent today.
          others: [...cell.children].filter((k) => k !== footer).map((k) => {
            const kcs = getComputedStyle(k);
            return { cls: k.className || k.tagName, grow: kcs.flexGrow, shrink: kcs.flexShrink, width: k.getBoundingClientRect().width };
          }),
          // The dots' own shape — an `on` dot is a pill, an off dot a circle, and a squeezed
          // row used to flatten both into indistinguishable slivers.
          dots: [...rail.querySelectorAll('.dot')].map((d) => {
            const b = d.getBoundingClientRect();
            return { on: d.classList.contains('on'), w: b.width, h: b.height };
          }),
          band: box(cell),
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
    // flexbox resolves that by shrinking BOTH — which is how a confidentiality footer lost
    // "any person not named on the distribution schedule" from the exported PDF while the
    // section label it was competing with truncated too. Every wayfinding mark is `flex: 0 0 auto`
    // and bounded by construction; the author's words take the remainder.
    for (const b of bands) {
      assert.equal(b.flexGrow, '1', `p${b.page}: the footer must absorb the row's free space`);
      for (const o of b.others) {
        assert.equal(o.grow, '0',
          `p${b.page}: \`${o.cls}\` can GROW (flex-grow: ${o.grow}) — it will take width the author's footer needs`);
        assert.equal(o.shrink, '0',
          `p${b.page}: \`${o.cls}\` can SHRINK (flex-shrink: ${o.shrink}) — so it is negotiating for width, `
          + 'and flexbox resolves a two-string negotiation by truncating both');
      }
    }
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

  test('the footer is a real flex ITEM that ellipsises rather than clipping mid-word', () => {
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
      // The band packs `flex-end`, so a footer that stops short detaches from the page's left
      // margin — out of line with the header and the body. Cheap, and it is the visible symptom.
      assert.ok(Math.abs(b.footer.left - b.band.left) < 1,
        `p${b.page}: the footer starts at ${b.footer.left.toFixed(1)} but the band's left margin is `
        + `${b.band.left.toFixed(1)} — it no longer lines up with the header and the body.`);
    }
  });

  test('the footer and the section rail never overlap', () => {
    for (const b of bands) {
      assert.ok(b.footer.right <= b.rail.left + 1,
        `p${b.page}: footer box ends at ${b.footer.right.toFixed(1)} but the rail starts at ${b.rail.left.toFixed(1)}`);
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
