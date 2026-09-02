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
 *   · The signal is a PILL, and the mark was STRANDED before it became one. The old rule was a
 *     full-width flex row with the mark as a flex sibling: two items whose text overflows leave
 *     no free space for `justify-content: flex-end`, so the mark stayed at the row's left edge
 *     while `text-align: right` pushed line one to the far right — a 972px row with the arrow at
 *     x=0 and its text starting at x=390.
 *
 *     THE FIX IS NOT "DON'T USE FLEX", and an earlier revision of this suite asserted exactly
 *     that and would now reject the correct layout. The pill is a flex row. What makes it safe is
 *     that it SHRINK-WRAPS: `align-self: flex-end` sizes the box to its content, and a box with
 *     no free space has none to strand the mark across. So the assertion is "the box does not
 *     stretch", which is the actual mechanism, and it holds whether the inside is flex or not.
 *
 *     A geometric assertion was tried and abandoned, and it is worth saying why so nobody
 *     re-adds it. The mark is a pseudo-element with no node to measure, so the only available
 *     reading is line one's own left edge — and on a right-aligned box that sits well inside the
 *     box BY DESIGN (7.5em on the fixture, with the mark correctly adjacent to it). The
 *     measurement cannot tell a correctly right-aligned line from a stranded mark.
 *
 *   · The label is wrapped in `.lat-split-label`, and the last test below is why: `text-overflow`
 *     never applies to a flex CONTAINER, so the 7-in-98 signals longer than 40 characters could
 *     be clipped mid-word but never ellipsised without an element to carry it. That span also
 *     guards a HARD RULE #1 regression — `closingSignal` in auto-split.js used to hand-build this
 *     same div, and it was the one pointer in the deck that came out unwrapped.
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
  // …and it has NO `.cell-stage`. Counted on a real render of `examples/split-horizontal.md`:
  // eight premise body pages, every one of them carrying the signal as a DIRECT child of the
  // section. This fixture used to wrap every shape in a `.cell-stage`, which made the premise row
  // describe a DOM that shape has never emitted — and the shrink-wrap assertion then failed on it
  // for a reason that does not exist in production (measured there: a 346px pill in a 1080px
  // section, 105px off the right edge, exactly as intended).
  { name: 'non-Form layout (premise)', cls: 'premise lat-split-native', role: 'body', stage: false },
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
    // THE SIGNAL'S MARKUP COMES FROM THE KERNEL, not from this file. It was hand-written here,
    // and the copy drifted the moment the real one grew a label span — this suite then asserted a
    // shape the engine had stopped emitting, and passed. `signalMarkup` is the one builder both
    // relationship.js and auto-split.js's closing pointer call, so a fixture built from it cannot
    // describe markup that does not ship.
    const { signalMarkup } = require('../../../lib/core/relationship');
    const sections = PAGES.map((p, i) =>
      // A REAL WIDTH, because the shrink-wrap assertion is a ratio and a zero-width harness makes
      // it degenerate: with no width the section collapses to its content, the stage collapses to
      // the pill, and "the pill is as wide as its stage" reads as a stretched bar when it is
      // actually shrink-wrapped. The non-Form `premise` shape failed exactly that way — it is the
      // one page whose section is not a Form and so takes no width of its own here.
      `<section class="${p.cls}" data-split-role="${p.role}" data-split-run="1" data-lattice-slide="${i + 1}"`
      + ` style="width:960px;display:flex;flex-direction:column">`
      + (p.stage === false ? '' : `<div class="cell-stage" style="display:flex;flex-direction:column">`)
      + `<ul><li>member</li></ul>`
      + signalMarkup('Something', 'next').replace('class="lat-split-rel"', `class="lat-split-rel" id="sig${i}"`)
      + (p.stage === false ? '' : `</div>`)
      + `</section>`).join('');
    await page.setContent(`<style>${css}</style><main>${sections}</main>`, { waitUntil: 'load' });
  });

  after(async () => { if (browser) await browser.close(); });

  for (const [i, shape] of PAGES.entries()) {
    test(`${shape.name} — the signal is chrome, not body text`, async (t) => {
      if (!exe) return t.skip('no Chromium — set CHROME_PATH (the SessionStart hook exports it)');
      const got = await page.evaluate((id) => {
        const el = document.getElementById(id);
        const cs = getComputedStyle(el);
        const mark = getComputedStyle(el, '::after');   // the mark TRAILS the label since 2026-09-02
        return {
          display: cs.display,
          alignSelf: cs.alignSelf,
          fontFamily: cs.fontFamily,
          fontSize: cs.fontSize,
          background: cs.backgroundColor,
          borderWidth: cs.borderTopWidth,
          borderRadius: cs.borderTopLeftRadius,
          width: el.getBoundingClientRect().width,
          stageWidth: el.parentElement.getBoundingClientRect().width,
          hasLabelSpan: !!el.querySelector('.lat-split-label'),
          bodyFontSize: getComputedStyle(el.closest('section')).fontSize,
          markWidth: mark.width,
        };
      }, `sig${i}`);

      // SHRINK-WRAPPED, not stretched. This is the whole anti-stranding guarantee: a box sized
      // to its content has no free space for the mark to be stranded across.
      assert.notEqual(got.alignSelf, 'stretch',
        'the signal stretches to its column, which is what stranded its mark at the left edge');
      assert.ok(got.width < got.stageWidth,
        `the signal is ${Math.round(got.width)}px in a ${Math.round(got.stageWidth)}px stage — `
        + 'it is not shrink-wrapped, so it is a bar rather than a pill');
      // A pill: it has a fill and a border, so it reads as furniture rather than as body text.
      assert.notEqual(got.background, 'rgba(0, 0, 0, 0)', 'the pill has no fill');
      assert.notEqual(got.borderWidth, '0px', 'the pill has no border');
      assert.ok(parseFloat(got.borderRadius) > 0, 'the pill has no radius');
      // Smaller than the slide's body text — the whole point is that it cannot be mistaken for
      // the member's own words.
      assert.ok(parseFloat(got.fontSize) < parseFloat(got.bodyFontSize),
        `signal ${got.fontSize} is not smaller than body ${got.bodyFontSize}`);
      // The label is an element, so it can ellipsise (see the header note and the last test).
      assert.ok(got.hasLabelSpan, 'the label is not wrapped, so it can never ellipsise');
      // And the mark itself has a box.
      assert.notEqual(got.markWidth, 'auto', 'the drawn mark has no box');
      assert.notEqual(parseFloat(got.markWidth), 0, 'the drawn mark collapsed to zero width');
    });
  }

});
