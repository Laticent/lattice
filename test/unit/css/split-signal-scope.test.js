/**
 * Unit: the split wayfinding signal is styled on EVERY page a split emitted.
 *
 * The one-line "→ next: …" / "→ continues" adornment is a RUN-level fact — it tells the reader
 * the run has not ended — so its styling has to follow the ELEMENT, not the class of whatever
 * built the page. It did not: the treatment was keyed on `section.form.lat-split-native`, which
 * only the PLAIN envelope's body pages carry. The ten carousel strategies give their pages their
 * own classes (`content compare-split compare-split-points form`), so all of them missed it.
 *
 * The visible cost was larger than a font. Measured on `examples/read-across-carousel.pdf`, a
 * `compare-prose` body page rendered its signal as PLAIN BODY TEXT at full size with no mark —
 * two pages after the identical signal read as muted chrome. Neither the unit suite, the
 * integration tier, CI, nor two adversarial passes saw it; rasterizing the deck did.
 *
 * So this asks the browser, on every page shape, for the properties that make the signal read as
 * chrome rather than as content.
 *
 * TWO OF THOSE PROPERTIES CHANGED on 2026-09-02, in the owner's redesign of the split furniture,
 * and this suite was pinning the mechanism rather than the behavior:
 *   · `display: flex` -> `block`. The flex row was what STRANDED the mark: two flex items whose
 *     text overflows leave no free space for `justify-content: flex-end`, so the mark stayed at
 *     the row's left edge while `text-align: right` pushed line one to the far right — a 972px
 *     row with the arrow at x=0 and its text starting at x=390. The mark is now an inline
 *     `::before` inside the text flow, so it is right-aligned WITH line one at any width.
 *
 *     The replacement assertion is STRUCTURAL — "not a flex container", plus "the mark is an
 *     inline-block" — and that is deliberate, not a shortcut. A geometric version was written
 *     first: wrap a long signal, then measure how far line one starts from the box's left edge.
 *     It cannot work. The mark is a pseudo-element with no node to measure, so the only available
 *     reading is line one's own left edge — and on a right-aligned block that sits well inside
 *     the box BY DESIGN (7.5em on the fixture, with the mark correctly adjacent to it). The
 *     measurement cannot tell a correctly right-aligned line from a stranded mark. The structural
 *     pair can, because it removes the mechanism: a non-flex box whose mark is an inline box in
 *     the text flow has no way to place that mark anywhere but against line one. Mutation-checked
 *     — flipping the bundle's rule back to `display: flex` fails all five shapes below.
 *   · The separating hairline is gone. The signal is a margin marker at the page's bottom-right
 *     now, not a banded row, so it separates itself by position; a rule under it was drawing a
 *     box around nothing. base.modifiers.css carries the before/after measurements.
 */

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { resolveChrome } = require('../../../tools/lib/resolve-chrome');

const ROOT = path.resolve(__dirname, '../../..');
// The DEFAULT-theme bundle, not the bare one:  is
// invalid at computed-value time when the token is undefined, so a themeless page would report a
// missing hairline that a real render has.
const CSS = path.join(ROOT, 'dist/lattice-default.css');

/** The two page shapes a split emits, as the engine actually writes them. */
const PAGES = [
  { name: 'plain envelope body', cls: 'content form lat-split-native', role: 'body' },
  { name: 'carousel strategy body (compare-prose)', cls: 'content compare-split compare-split-points form', role: 'body' },
  { name: 'carousel strategy body (split-panel)', cls: 'content split-panel-split split-panel-points form', role: 'body' },
  { name: 'closing page', cls: 'content lat-split-closing form', role: 'closing' },
  // A NON-FORM layout. `premise` renders as `class="premise lat-split-native"` with no `form`,
  // and the first widening of this rule still required `.form` — so premise pages kept rendering
  // their signal as plain body text, and this suite certified the fix because every fixture above
  // was a Form page. A gate whose fixtures come only from the shapes already seen confirms the
  // fix on exactly those shapes.
  { name: 'non-Form layout (premise)', cls: 'premise lat-split-native', role: 'body' },
];

describe('the split signal reads as chrome on every page a split emitted', () => {
  const exe = resolveChrome();
  let browser;
  let page;

  before(async () => {
    if (!exe) return;
    const puppeteer = require('puppeteer-core');
    browser = await puppeteer.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    page = await browser.newPage();
    const css = fs.readFileSync(CSS, 'utf8');
    const sections = PAGES.map((p, i) =>
      `<section class="${p.cls}" data-split-role="${p.role}" data-split-run="1" data-lattice-slide="${i + 1}">`
      + `<div class="cell-stage"><ul><li>member</li></ul>`
      + `<div class="lat-split-rel" data-mark="next" id="sig${i}">next: Something</div></div></section>`).join('');
    await page.setContent(`<style>${css}</style><main>${sections}</main>`, { waitUntil: 'load' });
  });

  after(async () => { if (browser) await browser.close(); });

  for (const [i, shape] of PAGES.entries()) {
    test(`${shape.name} — the signal is chrome, not body text`, async (t) => {
      if (!exe) return t.skip('no Chromium — set CHROME_PATH (the SessionStart hook exports it)');
      const got = await page.evaluate((id) => {
        const el = document.getElementById(id);
        const cs = getComputedStyle(el);
        const before = getComputedStyle(el, '::before');
        return {
          display: cs.display,
          fontFamily: cs.fontFamily,
          fontSize: cs.fontSize,
          textAlign: cs.textAlign,
          bodyFontSize: getComputedStyle(el.closest('section')).fontSize,
          markDisplay: before.display,
          markWidth: before.width,
        };
      }, `sig${i}`);

      // A BLOCK, so the mark can be an inline box on line one. Asserted as "not flex" rather than
      // as "block" because what matters is that the mark cannot become a stranded flex SIBLING;
      // any block-level box gets that right.
      assert.ok(!got.display.includes('flex'),
        `the signal is a ${got.display} container, which strands its mark at the row's left edge`);
      // Right-aligned: it is a margin marker in the page's bottom-right corner.
      assert.equal(got.textAlign, 'right', 'the signal is not right-aligned');
      // Smaller than the slide's body text — the whole point is that it cannot be mistaken for
      // the member's own words.
      assert.ok(parseFloat(got.fontSize) < parseFloat(got.bodyFontSize),
        `signal ${got.fontSize} is not smaller than body ${got.bodyFontSize}`);
      // And the mark itself is an inline box on the text's own line, with real width.
      assert.equal(got.markDisplay, 'inline-block',
        'the drawn mark is not inline, so it cannot ride line one with the text');
      assert.notEqual(got.markWidth, 'auto', 'the drawn mark has no box');
      assert.notEqual(parseFloat(got.markWidth), 0, 'the drawn mark collapsed to zero width');
    });
  }

});
