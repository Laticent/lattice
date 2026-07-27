/**
 * THE FOOTER BAND under contention (real cascade, real Chromium).
 *
 * The footer Cell exists to retire "three absolutes at the same baseline with no shared budget"
 * (design/forms.md §6). One mark never finished that migration: the running `footer:` text stayed
 * `position: absolute` with a fixed `--footerleft-w` (52cqi) budget, while the docked section rail
 * is an in-flow flex item with a `white-space: nowrap` label. Neither side can yield to the other,
 * so on a deck whose footer string AND section label are both long they simply collide — on the
 * shipped 117-page gallery, p78 painted "…tint-edge at-right" through "THE ANNEXES · APPROVED
 * DECORATION", 105.2px of real ink overlap.
 *
 * Promoting the footer to a flex item on EVERY docked band was tried and reverted: it deletes text
 * from the exported PDF (engineering/decisions/2026-07-27-footer-band-allocation.md). So this suite
 * guards the scope that ships — split bands and split covers — and the un-split band's allocation
 * policy is an open question, deliberately NOT asserted here.
 *
 * Measuring this went wrong three times, which is why the assertions are shaped as they are:
 *   · footer BOX vs rail box said 42 pages were broken — an absolute footer's box is its 52cqi
 *     budget, not its text, so most had no ink near the rail;
 *   · the text via a `Range` said the fix made things WORSE — `getClientRects()` returns laid-out
 *     text and `overflow: hidden` clips paint without moving layout, so a correctly-ellipsised run
 *     still measures full width;
 *   · and the fix itself then clipped every diacritic off accented CAPITALS, which neither box nor
 *     ink geometry can see at all, because the loss is sub-box PAINT.
 * So this suite asserts the properties that GUARANTEE the rendering — flex items cannot overlap,
 * `overflow: hidden` confines ink to the box, and the box must be tall enough to contain that ink —
 * and it verifies the band is genuinely contended first, because every shrink assertion below is
 * vacuous on a band with slack. The first version of this file asserted only that both boxes had
 * width > 0 and let SEVEN of nine mutations through.
 *
 * MUTATION SCORE, measured, not asserted (`.scratch/mutate-footer.sh` in the authoring session —
 * remove one declaration from the promoted-footer rule, rebuild the CSS, re-run):
 *   died      · position: static, display: block, white-space: nowrap, line-height: 1.45,
 *              overflow: hidden, text-overflow: ellipsis, max-width: none  (7 of 10)
 *   SURVIVES  · inset: auto      — inert beside `position: static` in the same block, and that one
 *                                  IS pinned, so nothing reachable changes when it goes.
 *   SURVIVES  · min-width: 0     — inert beside `overflow: hidden`: css-flexbox-1 §4.5 suppresses
 *                                  the automatic minimum size when main-axis overflow is not
 *                                  `visible`. Measured identical widths (491.8/291.6) either way.
 *                                  Kept as the paired idiom, not because this suite guards it.
 *   SURVIVES  · flex: 1 1 auto   — only `flex-grow` differs from the initial `0 1 auto`, and this
 *                                  footer always overflows its share, so growth never applies.
 * Two of the three survivors are provably unreachable; the third is cosmetic. Stated here rather
 * than rounded up, because a mutation score is exactly the kind of number this file exists to
 * distrust.
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

describe('footer band — a contended band keeps both marks legible', () => {
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
        if (cs.position !== 'static') return; // an un-promoted (absolute) footer is out of scope
        // Only the SPLIT band promotes the footer (plus a split cover) — that is the scope the
        // engine ships, after widening it to every docked band was reverted for deleting text from
        // the exported PDF. So require the k-of-N rail, not merely a section rail.
        if (!s.querySelector('.lat-split-rail')) return;
        const rail = s.querySelector('.tile-progress');
        const seg = s.querySelector('.tile-progress .seg');
        if (!rail || !seg) return;
        const box = (el) => { const b = el.getBoundingClientRect(); return { left: b.left, right: b.right, height: b.height, width: b.width }; };
        promoted.push({
          page: i + 1,
          position: cs.position,
          display: cs.display,
          overflow: cs.overflow,
          textOverflow: cs.textOverflow,
          whiteSpace: cs.whiteSpace,
          maxWidth: cs.maxWidth,
          lineHeight: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2,
          footer: box(footer),
          footerClientW: footer.clientWidth,
          footerScrollW: footer.scrollWidth,
          footerClientH: footer.clientHeight,
          footerInkH: inkHeight(footer),
          rail: box(rail),
          segClientW: seg.clientWidth,
          segScrollW: seg.scrollWidth,
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
    assert.ok(bands.length >= 2, `expected slides with a promoted footer band, got ${bands.length}`);
    // The load-bearing precondition. Without over-subscription nothing shrinks, so `min-width: 0`,
    // `flex`, `white-space`, `text-overflow` and the shrink priority are all exercised by nothing —
    // which is precisely how seven of nine mutations to those declarations survived this suite's
    // first version. Demand that SOMETHING is actually clipped on the page.
    const clipped = bands.filter((b) => b.footerScrollW > b.footerClientW || b.segScrollW > b.segClientW);
    assert.ok(clipped.length > 0,
      'the band has slack — nothing is clipped, so the shrink assertions would pass vacuously. '
      + `Lengthen the footer string or the divider eyebrow. Measured: ${JSON.stringify(bands.map((b) => ({ p: b.page, f: `${b.footerScrollW}/${b.footerClientW}`, s: `${b.segScrollW}/${b.segClientW}` })))}`);
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
    // What `max-width: none` is for, and why it has to be pinned as a PROPERTY rather than caught
    // by geometry. The un-promoted footer carries `max-width: var(--footerleft-w, 52cqi)`
    // (stage.css) and the promotion overrides it, because a cap and a flex share are two answers to
    // the same question. Restore the cap and the footer truncates 106px earlier than the row would
    // have made it — but NOTHING moves: the section rail simply grows into the slack (measured
    // 171.5px → 277.9px, still under its own cap), so the footer stays flush to the left margin and
    // every box stays where it was. The loss is only the author's words, and only in the ellipsis.
    for (const b of bands) {
      assert.equal(b.maxWidth, 'none',
        `p${b.page}: the footer is capped at ${b.maxWidth} on top of its flex share — the row can no `
        + 'longer allocate the band, and the cap silently wins.');
      // The other direction: a cap that the rail could NOT absorb would leave dead space, and the
      // band packs `flex-end`, so the footer's text would detach from the page's left margin — out
      // of line with the header and the body. Cheap to assert, and it is the visible symptom.
      assert.ok(Math.abs(b.footer.left - b.band.left) < 1,
        `p${b.page}: the footer starts at ${b.footer.left.toFixed(1)} but the band's left margin is `
        + `${b.band.left.toFixed(1)} — it no longer lines up with the header and the body.`);
    }
    // NOT asserted here, deliberately: the docked rail's own `min-width: 0` (stage.css) is a
    // shrink-PRIORITY lever, not a correctness one. Remove it and the rail's automatic minimum
    // becomes max-content — it has no `overflow: hidden` to suppress that the way the footer does —
    // and 113px moves from the author's footer (611.9 → 491.8) to the generated rail (141 → 254 of
    // label). Both marks are clipped either way and nothing overlaps, so the difference is purely
    // who yields first, which is the open question this branch refuses to settle by accident
    // (engineering/decisions/2026-07-27-footer-band-allocation.md). `footer.width > rail.width`
    // below is the one priority claim the engine actually makes, and it holds in both states.
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

  test('neither mark is crushed out of existence', () => {
    // NOT a shrink-priority assertion — that is an open design question, and the obvious lever is
    // wrong: `flex-shrink: 8` on the rail drove it to 0px wide (dots and all) rather than making it
    // yield gracefully. What must hold is weaker and more important: both marks survive with a
    // usable share of the band, and the footer — the author's own words — keeps the larger one.
    for (const b of bands) {
      assert.ok(b.footer.width > b.rail.width,
        `p${b.page}: the generated rail (${b.rail.width.toFixed(1)}px) is wider than the author's footer `
        + `(${b.footer.width.toFixed(1)}px) — wayfinding should yield first`);
      assert.ok(b.footer.width >= b.band.width * 0.25,
        `p${b.page}: the footer collapsed to ${b.footer.width.toFixed(1)}px of a ${b.band.width.toFixed(1)}px band`);
      assert.ok(b.rail.width > 0,
        `p${b.page}: the section rail was crushed to ${b.rail.width.toFixed(1)}px — the label and its dots are gone`);
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
    // The promote rule ties with all four hide rules on specificity (both (0,3,2) — `:has()`
    // contributes its most specific argument), so which wins is decided by bundle file order
    // alone. Widening the promote selector made that tie live on far more pages.
    assert.equal(hidden.length, 2, `expected the silent + no-footer slides to hide their footer, got ${hidden.length}`);
    assert.ok(hidden.some((h) => /\bsilent\b/.test(h.cls)), 'the `silent` slide still shows its footer');
    assert.ok(hidden.some((h) => /\bno-footer\b/.test(h.cls)), 'the `no-footer` slide still shows its footer');
  });
});
