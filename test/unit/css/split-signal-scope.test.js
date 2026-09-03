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
 *     no free space has none to strand the mark across.
 *
 *     SO THE ASSERTION IS GEOMETRY — where the box actually lands — and the two readings it
 *     replaced were both vacuous. An independent checker demonstrated it: `align-self`'s computed
 *     value is the specified keyword whatever the parent does, so `notEqual(alignSelf,'stretch')`
 *     can never fail once the rule sets `flex-end`; and `width < stageWidth` is true of ANY
 *     shrink-wrapped box, at the left edge or the right. Varying only the parent's display on
 *     this suite's own fixture, both assertions passed on a pill sitting at x=40 with 821px of
 *     air to its right — the exact stranding this file exists to catch. `rightGap` fails there,
 *     and does not fail on the correct layout.
 *
 *     The anchor is a property of the PARENT, and this suite pins the parent it is given, not the
 *     one production emits. Every real pointer parent is a flex column — verified over 4 decks x 4
 *     sizes with `CSS.getMatchedStylesForNode` — but nothing in the CSS guarantees it, and for
 *     `premise` it holds only because a separate, unrelated rule makes that section a column on
 *     exactly the families that can split. A gate that could see that lives on a real render, not
 *     here; what this file can say is that GIVEN the parent production emits, the rule
 *     right-anchors, and that is what it now says.
 *
 *     A geometric assertion on the MARK was tried and abandoned, and that is a different thing
 *     worth keeping straight so nobody re-adds it. The mark is a pseudo-element with no node to
 *     measure, so the only available reading was line one's own left edge — which on a
 *     right-aligned box sits well inside it BY DESIGN. That measurement cannot tell a correctly
 *     right-aligned line from a stranded mark. The BOX's own edges can.
 *
 *   · The label is wrapped in `.lat-split-label`, and the `ellipsises` test below is why:
 *     `text-overflow` never applies to a flex CONTAINER, so a label past the pill's width could
 *     be clipped mid-word but never ellipsised without an element to carry it.
 *
 *   · `box-sizing: border-box` is asserted with the ellipsis, because the two failed together.
 *     The engine has no global border-box reset, so under `content-box` the pill's `max-width:
 *     100%` caps the CONTENT width and the padding plus border is added outside it — and because
 *     the box is right-anchored, the excess goes LEFT, off the page. Reproduced on a split
 *     `verdict-grid`: a 1019px pill in a 972px column with its first character off-page.
 *     `comparison` is the reachable case because it is the one relationship whose label has no
 *     length budget. The long-label fixture below is that shape, minus the component.
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
    // The LONG-LABEL shape, on the plain envelope. `comparison` is the one relationship whose
    // label has no length budget — `relationship.js` joins every criterion badge with no
    // `LABEL_MAX` — so this is the string a split `verdict-grid` really produces, minus the
    // component.
    const long = `<section class="content form lat-split-native" data-split-role="body" data-split-run="9"`
      + ` data-lattice-slide="99" style="width:960px;display:flex;flex-direction:column">`
      + `<div class="cell-stage" style="display:flex;flex-direction:column">`
      + `<ul><li>member</li></ul>`
      // ALL SIX criteria, not a shortened stand-in. Narrowing the column instead does nothing:
      // `--pill-fs` is a `cqi` length resolved against the SECTION, so the font shrinks with the
      // column and the label-to-column ratio is invariant. The length has to come from the label,
      // and this is the whole string `verdict-grid` really emits for a six-by-six comparison.
      + signalMarkup(
        'Option 1 of 6 · comparing SOC 2 Type II attestation · Residency in the EU and UK · '
        + 'Self-serve onboarding path · Twenty-four hour support · Per-seat annual pricing · '
        + 'Single sign-on with SCIM', 'count')
        .replace('class="lat-split-rel"', 'class="lat-split-rel" id="siglong"')
      + `</div></section>`;
    await page.setContent(`<style>${css}</style><main>${sections}${long}</main>`, { waitUntil: 'load' });
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
          fontFamily: cs.fontFamily,
          fontSize: cs.fontSize,
          background: cs.backgroundColor,
          borderWidth: cs.borderTopWidth,
          borderRadius: cs.borderTopLeftRadius,
          width: el.getBoundingClientRect().width,
          stageWidth: el.parentElement.getBoundingClientRect().width,
          // Measured against the parent's CONTENT box, not its border box: the `premise` page's
          // parent is the SECTION, whose 40px padding is the slide's margin and is not slack.
          ...(() => {
            const r = el.getBoundingClientRect();
            const p = el.parentElement.getBoundingClientRect();
            const ps = getComputedStyle(el.parentElement);
            const l = p.left + parseFloat(ps.borderLeftWidth) + parseFloat(ps.paddingLeft);
            const rt = p.right - parseFloat(ps.borderRightWidth) - parseFloat(ps.paddingRight);
            return { leftOffset: r.left - l, rightGap: rt - r.right };
          })(),
          hasLabelSpan: !!el.querySelector('.lat-split-label'),
          bodyFontSize: getComputedStyle(el.closest('section')).fontSize,
          markWidth: mark.width,
        };
      }, `sig${i}`);

      // SHRINK-WRAPPED, not stretched. This is the whole anti-stranding guarantee: a box sized
      // to its content has no free space for the mark to be stranded across.
      assert.ok(got.width < got.stageWidth,
        `the signal is ${Math.round(got.width)}px in a ${Math.round(got.stageWidth)}px stage — `
        + 'it is not shrink-wrapped, so it is a bar rather than a pill');
      // AND RIGHT-ANCHORED. Shrink-wrap alone is not the guarantee: a shrink-wrapped box at the
      // LEFT edge is the stranding, wearing a pill. Measured off the box's own edges, which is
      // the only reading that can tell the two apart.
      assert.ok(got.rightGap <= 1,
        `the signal sits ${Math.round(got.rightGap)}px off its column's right edge — it is not `
        + 'right-anchored, so the marker is loose in the middle of the page');
      assert.ok(got.leftOffset > got.rightGap,
        `the signal is ${Math.round(got.leftOffset)}px from the left and ${Math.round(got.rightGap)}px `
        + 'from the right — it has drifted to the left edge');
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

  test("a label past the pill's width ellipsises INSIDE the column, never outside it", async (t) => {
    if (!exe) return t.skip('no Chromium — set CHROME_PATH (the SessionStart hook exports it)');
    const got = await page.evaluate(() => {
      const el = document.getElementById('siglong');
      const lbl = el.querySelector('.lat-split-label');
      const r = el.getBoundingClientRect();
      const p = el.parentElement.getBoundingClientRect();
      const ps = getComputedStyle(el.parentElement);
      const l = p.left + parseFloat(ps.borderLeftWidth) + parseFloat(ps.paddingLeft);
      const rt = p.right - parseFloat(ps.borderRightWidth) - parseFloat(ps.paddingRight);
      return {
        boxSizing: getComputedStyle(el).boxSizing,
        textOverflow: getComputedStyle(lbl).textOverflow,
        clipped: lbl.scrollWidth > lbl.clientWidth + 1,
        height: r.height,
        oneLine: r.height < parseFloat(getComputedStyle(el).fontSize) * 2.2,
        leftOffset: r.left - l,
        rightGap: rt - r.right,
        width: r.width,
        colWidth: rt - l,
      };
    });

    // It CLIPS rather than wraps — a pill that wraps has stopped being a pill.
    assert.ok(got.clipped, 'a label longer than the pill did not clip, so it wrapped instead');
    assert.equal(got.textOverflow, 'ellipsis', 'the clip carries no ellipsis, so it cuts mid-word');
    assert.ok(got.oneLine, `the pill is ${Math.round(got.height)}px tall — it has wrapped`);
    // AND IT STAYS INSIDE THE COLUMN. Under `content-box` this is exactly where it failed:
    // `max-width: 100%` capped the CONTENT box, the padding and border were added outside it, and
    // the right-anchor pushed the excess LEFT — off the page, taking the rounded cap and the first
    // characters with it. `scrollWidth` cannot see that: leftward overflow is invisible to it in
    // LTR, which is why this is read off the box's own edges.
    assert.equal(got.boxSizing, 'border-box',
      'the pill is content-box, so its padding and border land outside its max-width');
    assert.ok(got.leftOffset >= -0.5,
      `the pill starts ${Math.round(got.leftOffset)}px OUTSIDE its column's left edge — its cap and `
      + 'first characters are off the page');
    assert.ok(got.width <= got.colWidth + 0.5,
      `the pill is ${Math.round(got.width)}px in a ${Math.round(got.colWidth)}px column`);
  });

});
