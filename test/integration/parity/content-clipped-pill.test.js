/**
 * The READER actually SEES the "Content clipped" pill on a slide that loses content
 * WITHOUT overflowing its frame — and the block-start shear is caught at all.
 *
 * This is the real-surface half of #1299/#1300, and it exists because the JS half
 * shipped without it and was silently useless. `base.modifiers.css` hides any tab under
 * `section:not(.overflow)`, and `.overflow` is — correctly — pure geometry. So when the
 * watchers learned to draw the pill on `tell` (which can now be true while `over` is
 * false: an ellipsed label, a line-clamped card, a sheared panel head), the CSS set the
 * pill they had just drawn to `display: none`. Every unit test passed. The export
 * console said the right thing. A `matrix-grid` axis label sliced mid-word rendered
 * with no pill at all. It took rasterizing the artifact to see it (HARD RULE #23 — the
 * HARD RULE #25 inversion pass found it by looking at the PDF, not the diff).
 *
 * So this drives the REAL export and asserts computed `display`, not class presence.
 * A class assertion would have passed against the broken build.
 *
 * Three cases, one per mechanism this change set claims to close:
 *   · ELLIPSIS  — a formatter truncation that crosses no box edge (`over: false`)
 *   · SHEAR     — content thrown off the BLOCK-START edge, which does not grow
 *                 scrollHeight, so every scroll-dims measure reads zero (#1299)
 *   · CLEAN     — the control: no pill, or the other two prove nothing
 *
 * Needs Chromium + the emulator (renders the deck, inspects the laid-out DOM).
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { execFileSync } = require('node:child_process');

// Rendered by invoking the emulator DIRECTLY rather than through
// test/helpers/semantic-render, because these cases turn on `--overflow-marker`, which
// is a CLI/export setting with no deck-level key (the front-matter key was deliberately
// removed — 2026-07-30-overflow-marker-register.md §"It is a setting, not a deck
// register"). Widening the shared helper for one suite's flag is the worse trade.
const ROOT = path.join(__dirname, '..', '..', '..');
const OUT = path.join(ROOT, '.scratch', 'pill-levels');

function renderAt(markdown, key, level) {
  fs.mkdirSync(OUT, { recursive: true });
  const md = path.join(OUT, `${key}.md`);
  const pdf = path.join(OUT, `${key}.pdf`);
  fs.writeFileSync(md, markdown);
  const args = [path.join(ROOT, 'lattice-emulator.js'), md, pdf, '-q'];
  if (level) args.push(`--overflow-marker=${level}`);
  execFileSync(process.execPath, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], timeout: 240000 });
  const html = pdf.replace(/\.pdf$/, '.html');
  if (!fs.existsSync(html)) throw new Error(`emulator produced no HTML sidecar for ${key}`);
  return html;
}

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

const deck = (body) => `---\nmarp: true\ntheme: indaco\n---\n\n${body.trim()}\n`;
// The same deck with an ordinary, over-long running footer — the shape that made the
// reader pill paint an opaque capsule across the confidentiality line it was reporting.
// 211 characters — the shape 2026-07-27-footer-band-allocation.md measures as its worked
// case (it uses a 199-character line; ~two thirds survives at hd, ~a quarter in portrait).
// Long enough that the landscape band, which takes ~119, truncates it beyond argument —
// a marginal fixture would make the assertions below pass for the wrong reason.
const FOOTER_TEXT = 'CONFIDENTIAL — this document is provided solely to the named recipient and may not be copied, distributed, disclosed or otherwise made available to any other party without the prior written consent of the issuer';
const deckWithFooter = (body) => `---\nmarp: true\ntheme: indaco\nfooter: "${FOOTER_TEXT}"\n---\n\n${body.trim()}\n`;

// An ellipsed label. The section fits, the cell fits; only the <strong> loses text —
// and it has no element children, which is the shape that made this case unreachable
// until the clipSuspect test moved above the childless skip.
const ELLIPSIS = `<!-- _class: content -->

## A slide that cuts content without overflowing its frame.

<div style="display:flex"><strong style="display:block;max-width:9em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Advanced beginner practitioner level</strong></div>
`;

// The #1299 shape: split-panel's left panel over-stuffed. With `safe` alignment the
// loss moves to the TAIL and grows scrollHeight; the point of the assertion is that
// the slide is reported at all, on the surface a reader looks at.
const SHEAR = `<!-- _class: split-panel -->

\`Program review\`

## Quarterly program review for the regional distribution network and its downstream partners across four operating territories, with a trailing clause that pushes this heading well past what the panel can hold

The program has been running for eleven quarters and now covers a materially wider footprint than the original charter contemplated, which is the reason this review exists at all, and the reason the panel below it can no longer contain the copy it has been handed.

- Throughput
  - Median order-to-dock time fell from 41 hours to 26 hours.
- Cost
  - Unit handling cost is down 12% year over year.
`;

const CLEAN = `<!-- _class: content -->

## A slide that fits.

Two short lines of body copy, well inside the frame.
`;

describe('the reader SEES the content-clipped pill (real export, computed style)', () => {
  const chrome = resolveChrome();
  let browser;

  if (!chrome) {
    test('SKIPPED — no Chromium available', { skip: true }, () => {});
    return;
  }
  process.env.CHROME_PATH = chrome;

  before(async () => {
    browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'] });
  });
  after(async () => {
    if (browser) await browser.close();
  });

  async function inspect(body, key, level) {
    const html = renderAt(deck(body), key, level);
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(`file://${html}`, { waitUntil: 'networkidle0' });
    // The export's inline watcher settles on fonts, so give it a beat before reading.
    await page.evaluate(() => document.fonts.ready);
    await new Promise((r) => setTimeout(r, 1200));
    const v = await page.$eval('section', (s) => {
      const tab = s.querySelector(':scope > .marker-rail > .overflow-tab');
      return {
        over: s.classList.contains('overflow'),
        clipMarked: s.classList.contains('clip-marked'),
        marker: s.getAttribute('data-lattice-overflow-marker'),
        text: tab ? tab.textContent : null,
        // The whole point: COMPUTED display, not class presence. The broken build
        // stamped every class correctly and rendered nothing.
        visible: tab ? getComputedStyle(tab).display !== 'none' && tab.getBoundingClientRect().width > 0 : false,
        // The AUTHOR bug was never about display — the tab was visible. It was
        // `position: static`, so it sat IN FLOW and took height from the cell being
        // probed. Assert the property that actually matters — on the RAIL, which is the
        // positioned box now that the two markers share one capsule.
        position: (() => {
          const rail = s.querySelector(':scope > .marker-rail');
          return rail ? getComputedStyle(rail).position : null;
        })(),
      };
    });
    await page.close();
    return v;
  }

  // Renders a deck WITH a running footer and reports the geometry of both boxes.
  async function inspectFooter(body, key, level) {
    const html = renderAt(deckWithFooter(body), key, level);
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(`file://${html}`, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    await new Promise((r) => setTimeout(r, 1200));
    const v = await page.$eval('section', (s) => {
      const tab = s.querySelector(':scope > .marker-rail > .overflow-tab');
      const ft = s.querySelector('.cell-footer > footer, :scope > footer');
      const tr = tab ? tab.getBoundingClientRect() : null;
      const fr = ft ? ft.getBoundingClientRect() : null;
      return {
        clipMarked: s.classList.contains('clip-marked'),
        hasFooter: !!ft,
        tabVisible: !!(tab && getComputedStyle(tab).display !== 'none' && tr && tr.width > 0),
        tabBox: tr?.width ? { top: Math.round(tr.top), bottom: Math.round(tr.bottom), left: Math.round(tr.left), right: Math.round(tr.right) } : null,
        footerBox: fr?.width ? { top: Math.round(fr.top), bottom: Math.round(fr.bottom) } : null,
        // Do the two boxes intersect? That is the regression, stated geometrically.
        overlaps: !!(tr && fr && tr.left < fr.right && tr.right > fr.left
          && tr.top < fr.bottom && tr.bottom > fr.top),
        footerClipped: !!(ft && ft.scrollWidth > ft.clientWidth + 1),
      };
    });
    await page.close();
    return v;
  }

  test('FOOTER — an over-long running footer is NOT pilled at reader level', async () => {
    // The regression both HARD RULE #25 lenses found independently, by rasterizing a
    // committed golden rather than reading the diff: the reader pill sits bottom-center,
    // which IS the footer band, and it is opaque. Once detection widened to cuts without
    // overflow, one ordinary `footer:` in front matter put a capsule across the
    // confidentiality line on EVERY page — the marker destroying readable content in
    // order to report that content was destroyed. Detection is unchanged (see the author
    // case below); only the reader treatment yields.
    const v = await inspectFooter(CLEAN, 'pill-footer-reader');
    assert.equal(v.hasFooter, true, 'the fixture must actually carry a running footer');
    assert.equal(v.footerClipped, true, 'and it must actually be truncated, or this proves nothing');
    assert.equal(v.tabVisible, false,
      'REGRESSION: a footer-only cut must not draw a reader pill — it lands on the footer and a '
      + 'reader can neither edit a footer nor scroll a PDF');
    assert.equal(v.overlaps, false, 'and nothing may overlap the footer band');
  });

  test('FOOTER — the AUTHOR is still told, and the tab still clears the band', async () => {
    // Detection is general; treatment is not. The doc that prices the footer ellipsis
    // asks in the same section to be told about it, so `author` keeps the tab.
    const v = await inspectFooter(CLEAN, 'pill-footer-author', 'author');
    assert.equal(v.footerClipped, true);
    assert.equal(v.tabVisible, true, 'the author must still hear about a deleted confidentiality line');
    assert.equal(v.overlaps, false, 'but the tab must never sit on top of the text it reports');
  });

  test('READER BERTH — the delivered pill sits bottom-center, BELOW the running footer', async () => {
    // THE ONE ASSERTION THIS PLACEMENT NEEDS, because the pill has been here before and it
    // was a defect. The original bottom-center pill sat INSIDE the footer band and painted
    // an opaque capsule across the confidentiality line on every page of any deck carrying
    // an ordinary `footer:` — found by rasterizing a committed golden, not by a gate.
    //
    // `bottom: 0` is a different berth from that one, and the difference is the entire
    // safety argument: the footer sits at `bottom: var(--frame-inset-y)`, so the strip
    // below it is frame margin no component writes into. That is a GEOMETRIC claim about
    // two boxes, so it is asserted geometrically rather than trusted to a comment.
    //
    // The fixture cuts content in the BODY (an ellipsed `<strong>`) as well as carrying an
    // over-long footer — the footer-only case is deliberately not pilled at all (the test
    // above), so it could not detect a pill landing in the wrong place.
    const v = await inspectFooter(ELLIPSIS, 'reader-berth-footer');
    assert.equal(v.hasFooter, true, 'the fixture must actually carry a running footer');
    assert.equal(v.tabVisible, true, 'a body-content cut must still be told to the reader');
    assert.ok(v.tabBox && v.footerBox, `both boxes must be measurable — got ${JSON.stringify(v)}`);
    assert.equal(
      v.overlaps, false,
      'REGRESSION: the reader pill is back on the running footer. This is the #1300 defect '
      + 'verbatim — an opaque capsule across the confidentiality line on every delivered page.',
    );
    assert.ok(
      v.tabBox.top >= v.footerBox.bottom,
      `the pill must sit BELOW the footer, not above or across it. pill=${JSON.stringify(v.tabBox)} `
      + `footer=${JSON.stringify(v.footerBox)}. Above the footer is the body copy on a full slide, `
      + 'which is where two earlier fixes put it.',
    );
    // Flush against the bottom edge, and centered. A 720px-tall frame at hd.
    assert.ok(
      720 - v.tabBox.bottom <= 12,
      `the pill is ${720 - v.tabBox.bottom}px above the frame's bottom edge — it should be flush. `
      + '`top: auto` must release the author berth, or the box is over-constrained and `bottom` '
      + 'is ignored, leaving the pill at the top.',
    );
    const center = (v.tabBox.left + v.tabBox.right) / 2;
    assert.ok(
      Math.abs(center - 640) <= 2,
      `the pill is centered on x=${center}, not on the frame's own center (640). The centering `
      + 'travels in the rail\'s own `transform`, declared once. The per-stamp reserve tokens '
      + 'that used to share that declaration are deleted — no stamp shares the capsule\'s band.',
    );
  });

  test('ELLIPSIS — cut content with no frame overflow is told to the reader', async () => {
    const v = await inspect(ELLIPSIS, 'pill-ellipsis');
    assert.equal(v.over, false, 'a formatter truncation crosses no box edge — `over` stays geometric');
    assert.equal(v.clipMarked, true, 'the section must carry .clip-marked');
    assert.equal(v.text, 'Content clipped');
    assert.equal(
      v.visible,
      true,
      'REGRESSION: the pill was drawn and then hidden. `base.modifiers.css` gates tab visibility '
      + 'on `section:not(.clip-marked)`; if the class is not stamped, the reader half of #1300 '
      + 'does not exist — the JS stamps everything correctly and the artifact shows nothing.',
    );
  });

  test('SHEAR — an over-stuffed split-panel is reported (the #1299 shape)', async () => {
    const v = await inspect(SHEAR, 'pill-shear');
    assert.equal(v.over, true, 'with `safe` alignment the loss moves to the tail, which grows scrollHeight');
    assert.equal(v.visible, true, 'and the reader is told');
    assert.equal(v.text, 'Content clipped');
  });

  test('AUTHOR — the capsule is ABSOLUTE, so the marker cannot take height from the cell', async () => {
    // `author` is the DEFAULT on every live surface (preview, Studio, Playground), and it
    // was the level this suite did not test — which is how a marker that rendered IN FLOW,
    // stealing 50px of the very `.cell-stage` being probed, survived a green suite. The
    // marker manufacturing the clip it reports is the failure the probe's own header
    // names; assert the property, at the level where it broke.
    //
    // The property is asserted on `.marker-rail` now: the two markers are static segments
    // of one capsule and the rail is what is positioned, so the rail is what could fall
    // into flow. Same invariant, one element up.
    const v = await inspect(ELLIPSIS, 'pill-author', 'author');
    assert.equal(v.clipMarked, true);
    assert.equal(v.visible, true);
    assert.equal(v.position, 'absolute',
      'REGRESSION: a static capsule sits in flow and takes height from the cell it reports on');
  });

  test('OFF — nothing is drawn and no class survives the strip', async () => {
    const v = await inspect(ELLIPSIS, 'pill-off', 'off');
    assert.equal(v.visible, false, 'off promises to leave nothing');
    assert.equal(v.clipMarked, false, 'and that includes the class, not just the tab');
  });

  test('CLEAN — a fitting slide carries no pill at all', async () => {
    const v = await inspect(CLEAN, 'pill-clean');
    assert.equal(v.over, false);
    assert.equal(v.clipMarked, false);
    assert.equal(v.visible, false, 'a fitting slide must not be marked — the control for the two above');
  });

  // ── THE CAPSULE TRUTH TABLE ──────────────────────────────────────────────────
  // The clip marker and the type-floor marker are ONE object now: `.marker-rail`, a
  // centered flex row at the slide's bottom edge holding up to two segments
  // (lib/core/fit-berth.js). The rail is the positioned box; the segments are static
  // children of it.
  //
  // WHAT THAT CHANGED ABOUT THIS SUITE, because two assertions inverted rather than moved.
  // These markers used to STACK — two centered pills, the second translated down by its
  // own height — so the canary asserted they never shared a row. Sharing a row is now the
  // design, and the thing that must not happen is that they OVERLAP or come apart. Same
  // defect, opposite predicate; a straight port of the old assertion would have passed on
  // a broken capsule.
  //
  // THIS SUITE EXISTS BECAUSE THE PLACEMENT SHIPPED BROKEN FIVE TIMES AND NO GATE SAW IT.
  // All five were the same shape — boxes competing for one corner of the slide, with
  // arithmetic to keep them apart:
  //   1. the reader pill was moved into the top-right corner on a survey that missed the
  //      status stamp, and `stamp-notch` swallowed it whole — a SILENT CLIP, the one
  //      outcome this register exists to prevent;
  //   2. the first de-collision pushed all 21 stamp CLASS NAMES by a fixed row, measured
  //      wrong on 8 of the 13 SHAPES (six sit ~43px lower and were pushed INTO);
  //   3. the rewrite that fixed that used UNITLESS `calc()` fallbacks — `calc(100% + 0)`
  //      mixes <percentage> with <number>, which is invalid, so the whole `transform` was
  //      discarded and both pills landed in the same band again;
  //   4. the logo reserve then landed a pill INSIDE the mark it existed to clear;
  //   5. moving to the top band left the second row sitting on the running header.
  // Every one passed `npm test`, `build:check`, the pixel gate and CI, because the machine
  // gates verify INTERNAL CONSISTENCY and none of these violated it. Only computed style
  // on a real export answers this, so that is what this asserts.
  //
  // The capsule ended the whole class: two segments in one container cannot collide with
  // each other, and one centered box has one neighbor set to clear instead of four.
  const CORNER = (cls) => `<!-- _class: ${cls} -->

## A slide that cuts content and shrinks its figure.

<div style="display:flex"><strong style="display:block;max-width:9em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Advanced beginner practitioner level</strong></div>

<svg viewBox="0 0 400 40" width="40" height="4"><text x="4" y="30" font-size="12">tiny</text></svg>
`;

  // The author's `logo:` mark was the corner's fourth occupant and the one the engine does
  // not own the geometry of (#1404). It stays a fixture: the capsule berths at the bottom
  // and the mark sits at the top-right frame inset, so they must clear each other outright,
  // with no reserve to compute and nothing to keep in step.
  //
  // The logo src is ABSOLUTE on purpose: renderAt writes the deck into
  // `.scratch/pill-levels/`, and a relative `logo:` resolves against the OUTPUT directory
  // rather than the deck (#1406), so a relative path would render no logo at all and the
  // assertion would pass for the wrong reason.
  const LOGO_SRC = path.join(ROOT, 'test', 'fixtures', 'acme-logo.svg');
  const deckWithLogo = (body) =>
    `---\nmarp: true\ntheme: indaco\nlogo: ${LOGO_SRC}\n---\n\n${body.trim()}\n`;
  const deckWithBrandLogo = (body) =>
    `---\nmarp: true\ntheme: indaco\nlogo: ${LOGO_SRC}\nlogo-style: brand\n---\n\n${body.trim()}\n`;

  async function corners(cls, key, build = deck) {
    const html = renderAt(build(CORNER(cls)), key, 'author');
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(`file://${html}`, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    await new Promise((r) => setTimeout(r, 1200));
    const v = await page.$eval('section', (s) => {
      // NULL for a box that does not PAINT, not a zero-rect. `getBoundingClientRect()` on
      // a `display: none` element is all zeros, and an object of zeros is TRUTHY — so
      // `assert.ok(v.clip)` passed for a segment that was not drawn, and `deepEqual` called
      // two absent boxes equal. Every independence row below would then have proved
      // nothing about the thing it names.
      const box = (e) => {
        if (!e) return null;
        const r = e.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return null;
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) };
      };
      const stampTop = getComputedStyle(s, '::before').content !== 'none' ? 0 : null;
      return {
        cls: s.className,
        stamp: stampTop !== null,
        rail: box(s.querySelector(':scope > .marker-rail')),
        railPosition: (() => {
          const r = s.querySelector(':scope > .marker-rail');
          return r ? getComputedStyle(r).position : null;
        })(),
        clip: box(s.querySelector(':scope > .marker-rail > .overflow-tab')),
        leg: box(s.querySelector(':scope > .marker-rail > .illegible-tab')),
        logo: box(s.querySelector(':scope > img.deck-logo')),
      };
    });
    await page.close();
    return v;
  }

  const disjoint2d = (a, b) =>
    !a || !b || a.bottom <= b.top || b.bottom <= a.top || a.right <= b.left || b.right <= a.left;

  test('CAPSULE — the two segments are ADJACENT: one row, touching, not overlapping', async () => {
    // The inversion. These used to be two pills that had to stay in different rows; they
    // are two segments of one capsule that have to stay in the SAME row and meet exactly.
    // A gap reads as two pills again; an overlap is the old defect wearing a new shape.
    const v = await corners('content', 'capsule-plain');
    assert.ok(v.clip && v.leg, `both segments must be drawn — got ${JSON.stringify(v)}`);
    assert.equal(v.clip.top, v.leg.top, 'same row: tops must agree');
    assert.equal(v.clip.bottom, v.leg.bottom, 'same row: bottoms must agree');
    assert.equal(
      v.clip.right, v.leg.left,
      `the segments must MEET exactly — clip ends at ${v.clip.right}, type-floor starts at `
      + `${v.leg.left}. A gap means the rail stopped being a flex row; an overlap means a `
      + 'segment is positioning itself again.',
    );
    // Clip first, type-floor second — severity order, and nothing else pins it.
    assert.ok(v.clip.left < v.leg.left, 'the clip fact reads first');
    // And the capsule is exactly its two segments, no slack.
    assert.equal(v.rail.left, v.clip.left, 'the rail starts at the first segment');
    assert.equal(v.rail.right, v.leg.right, 'and ends at the last');
  });

  test('CAPSULE — the RAIL is absolute, so the marker cannot take height from the cell', async () => {
    // The invariant moved up one element with the positioning. An in-flow marker takes
    // space in the very box it is reporting on — that once cost 50px of the `.cell-stage`
    // being probed, letting the marker manufacture the clip it reported.
    const v = await corners('content', 'capsule-abs');
    assert.equal(v.railPosition, 'absolute',
      'REGRESSION: a static rail sits in flow and takes height from the cell it reports on');
  });

  test('CAPSULE — no stamp shape displaces the marker, notch included', async () => {
    // The whole reason the berth moved, and then merged. `confidential` with no shape class
    // is the default corner tab; `stamp-flag` and `stamp-pin` are the tall off-axis shapes
    // that once needed a 200% reserve; `stamp-notch` is the full-width top band that was
    // the LAST shape still reserving anything. The capsule berths at the bottom edge, so a
    // stamp painted along the top shares no band with it and must move it by nothing.
    const plain = await corners('content', 'capsule-ref');
    assert.ok(plain.rail, 'the reference render must draw the capsule');
    for (const [cls, key, painted] of [
      ['content confidential', 'capsule-stamp-default', true],
      ['content confidential stamp-flag', 'capsule-stamp-flag', true],
      ['content confidential stamp-pin', 'capsule-stamp-pin', true],
      ['content confidential stamp-notch', 'capsule-stamp-notch', true],
      // A shape class with no semantic class paints NOTHING — `--stamp-label` comes from
      // the semantic class alone — so this row must not assert a stamp it does not have.
      ['content stamp-notch', 'capsule-shape-only', false],
    ]) {
      const v = await corners(cls, key);
      assert.ok(v.rail && v.clip && v.leg, `the capsule must be DRAWN on "${cls}" — got ${JSON.stringify(v)}`);
      assert.equal(v.stamp, painted,
        `the "${cls}" fixture must ${painted ? 'actually paint' : 'not paint'} a stamp, or the row proves nothing`);
      assert.deepEqual(
        v.rail, plain.rail,
        `REGRESSION: "${cls}" displaced the marker capsule. No stamp shares the capsule's `
        + 'band, so none may reserve anything — reserving for one is how four rounds of '
        + 'corner arithmetic went wrong, and the reserve tokens are deliberately gone.',
      );
    }
  });

  test('CAPSULE — the deck logo never overlaps the marker, and never moves it', async () => {
    // Two claims. CLEARANCE: the mark sits at the top-right frame inset and the capsule at
    // the bottom edge, so they cannot meet — asserted on both axes, because a y-only test
    // would call an exact overlap disjoint. INDEPENDENCE: with no reserve to compute, the
    // capsule lands in the same place whether the deck has a corner mark, a brand-plated
    // one, a repositioned one, or none. That is what replaced `--corner-logo-reserve`.
    const ref = await corners('content', 'capsule-logo-none');
    const moved = (body) =>
      `---\nmarp: true\ntheme: indaco\nlogo: ${LOGO_SRC}\nlogo-x: 50\nlogo-y: 84\n---\n\n${body.trim()}\n`;
    for (const [cls, key, build] of [
      ['content', 'capsule-logo-plain', deckWithLogo],
      ['content confidential', 'capsule-logo-stamp', deckWithLogo],
      ['content confidential', 'capsule-logo-brand', deckWithBrandLogo],
      ['content', 'capsule-logo-moved', moved],
    ]) {
      const v = await corners(cls, key, build);
      assert.ok(v.logo, `the ${key} fixture must actually render a logo — an absolute src is required here (#1406)`);
      assert.ok(v.rail, `the capsule must be drawn — got ${JSON.stringify(v)}`);
      assert.ok(
        disjoint2d(v.logo, v.rail),
        `REGRESSION: the marker capsule overlaps the deck logo on "${key}". `
        + `logo=${JSON.stringify(v.logo)} rail=${JSON.stringify(v.rail)}. The capsule is opaque, `
        + "so an overlap SLICES the author's mark.",
      );
      assert.deepEqual(
        v.rail, ref.rail,
        `REGRESSION: the logo displaced the capsule on "${key}". The centered bottom berth `
        + 'reserves nothing for the mark — if this moved, something reintroduced a reserve.',
      );
    }
  });


  // ── THE PRESET SWEEP — the gate this file did not have, and the one that mattered ──
  //
  // EVERY fixture above renders at 1280×720 and never sets `size:`. That is how three
  // defects shipped past 14 green tests: on the four non-landscape presets the delivered
  // pill printed an opaque capsule ACROSS the running footer's confidentiality line —
  // by 13.1px at square, 22.9 portrait, 24.5 story, 25.2 mobile — and the Fix-Me tag
  // landed on the type-floor segment. Landscape passed by 0.8–3.1px, which read as a
  // margin and was a coincidence.
  //
  // The mechanism is worth stating because it is not obvious from the CSS: `--fs-meta`
  // carries a per-preset multiplier (1.17 at hd, 2.78 at portrait) so body text stays
  // legible on a phone, while `--frame-inset-y` — the strip the footer reserves — tracks
  // the frame. The marker inherited the phone bump and outgrew the strip.
  //
  // Four presets, not seven: `square`/`portrait`/`story`/`mobile` share one
  // `--frame-inset-y` (20.3px), so `portrait` and `mobile` stand for that class, and
  // `hd` + `standard` cover landscape's two scales including the tightest.
  const FOOTER_PRESETS = [
    ['hd', undefined, 1280, 720],
    ['standard', 'standard', 960, 720],
    ['portrait', 'portrait', 1080, 1350],
    ['mobile', 'mobile', 1080, 2340],
  ];
  for (const [name, size, vw, vh] of FOOTER_PRESETS) {
    test(`PRESET ${name} — the delivered pill never crosses the running footer`, { timeout: 180000 }, async () => {
      const fm = `---\nmarp: true\ntheme: indaco\n${size ? `size: ${size}\n` : ''}footer: "${FOOTER_TEXT}"\n---\n\n`;
      const html = renderAt(fm + ELLIPSIS.trim() + '\n', `preset-${name}`);
      const page = await browser.newPage();
      await page.setViewport({ width: vw, height: vh });
      await page.goto(`file://${html}`, { waitUntil: 'networkidle0' });
      await page.evaluate(() => document.fonts.ready);
      await new Promise((r) => setTimeout(r, 1200));
      const v = await page.$eval('section', (s) => {
        const R = (e) => {
          if (!e) return null;
          const r = e.getBoundingClientRect();
          return r.width ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right } : null;
        };
        const ft = s.querySelector('.cell-footer > footer, :scope > footer');
        return {
          footer: R(ft),
          rail: R(s.querySelector(':scope > .marker-rail')),
          // The SEGMENT's computed size, not the rail's. The rail is where the cap is
          // declared today, but a test that reads the declaring element measures whatever
          // happens to declare it — on a build where the rail declares nothing it silently
          // reads the inherited BODY size and reports a defect at a preset that has none.
          // The label's own box is the thing under test, on any build.
          fontPx: parseFloat(getComputedStyle(s.querySelector(':scope > .marker-rail > .overflow-tab')).fontSize),
        };
      });
      await page.close();

      assert.ok(v.footer, `${name}: the fixture must render a running footer`);
      assert.ok(v.rail, `${name}: the pill must be drawn — a body-content cut is told to the reader`);
      // THE INVARIANT: the capsule occupies the strip the footer reserves and no more, so
      // its top edge may MEET the footer's bottom edge and may never pass it.
      assert.ok(
        v.rail.top >= v.footer.bottom - 0.5,
        `${name}: REGRESSION — the delivered pill overlaps the running footer by `
        + `${(v.footer.bottom - v.rail.top).toFixed(1)}px. footer=${JSON.stringify(v.footer)} `
        + `rail=${JSON.stringify(v.rail)}. This is #1300 verbatim: an opaque capsule across the `
        + 'confidentiality line of every delivered page. The capsule must be bounded by '
        + '`height: var(--frame-inset-y)`, and its font capped as a fraction of that strip — '
        + 'NOT sized from `--fs-meta`, which carries a per-preset phone-reading multiplier.',
      );
      // …and it must still be READABLE. A marker shrunk to nothing fails the same way a
      // hidden one does, and the first fix for the overlap did exactly that (7px on a
      // 1080-wide frame) by subtracting a bumped `--sp-2xs` from the strip.
      const pct = (v.fontPx / vw) * 100;
      assert.ok(
        pct >= 0.9 && pct <= 1.6,
        `${name}: the pill's label is ${v.fontPx.toFixed(2)}px = ${pct.toFixed(2)}% of frame `
        + 'width; every preset should land near hd\'s 1.17%. Too small is an unreadable marker, '
        + 'too large is the overlap coming back.',
      );
    });
  }

  // ── The capsule sits CENTERED and FLUSH against the bottom edge ──────────────────
  //
  // The gate this file needed and did not have. Every relative assertion above — segments
  // adjacent, clear of the logo, undisplaced by a stamp — once passed while both markers
  // had fallen out of their berth entirely and were printing across the headline, 92px
  // down and 1040px in from the right. The cause was a unitless `--slide-radius: 0`
  // reaching `calc()` (#1649): a unitless zero is a <number> there, so the length was
  // invalid at computed-value time and the offsets fell back to `auto`.
  //
  // That inset is gone from this berth, but the rail still resolves its centering through
  // `transform: translateX(-50%)` against `left: 50%` — one invalid value away from the
  // same failure. So the guard is an absolute measurement, not a comment.
  //
  // A section renders at the viewport origin here, so the frame's center is 640 and its
  // bottom is 720.
  const EDGE_TOL = 12;
  const CENTER_TOL = 2;
  test('the marker capsule sits centered on the frame, flush to its bottom edge', async () => {
    const v = await corners('content', 'capsule-berth');
    assert.ok(v.rail, 'expected the capsule to render');
    const center = (v.rail.left + v.rail.right) / 2;
    assert.ok(
      Math.abs(center - 640) <= CENTER_TOL,
      `the capsule is centered on x=${center}, not on the frame's own center (640). The berth `
      + 'is `left: 50%` plus `translateX(-50%)`; an invalid transform discards the centering.',
    );
    assert.ok(
      720 - v.rail.bottom <= EDGE_TOL,
      `the capsule is ${720 - v.rail.bottom}px above the frame's bottom edge — it should be flush.`,
    );
  });


  // ── The FIX-ME berth is now the SOLE consumer of the typed `--slide-radius` ──────
  //
  // This assertion is inherited, not new, and inheriting it was the point. The two
  // berths above used to inset by `calc(var(--slide-radius, 0px) * 0.45)` so they cleared
  // a rounded deck's arc, and #1649 shipped a UNITLESS `--slide-radius: 0`: a unitless
  // zero is a <number> inside calc(), so the length was invalid at computed-value time,
  // `top`/`right` fell back to `auto`, and both markers dropped out of the corner and
  // printed across the headline on EVERY square deck — while thirteen relative assertions
  // in this file passed.
  //
  // Centering those two deleted their insets, which would have deleted the gate with
  // them. `.fixme-tab` still insets (bottom-right is a corner, and an alarm must not be
  // sliced by a shape the deck chose), so the trap is still live on exactly one berth and
  // needs exactly one absolute measurement. `resolve-corners.test.js` does not cover it —
  // its `/--slide-radius:\s*0/` matches `0px` and a bare `0` identically.
  //
  // SQUARE is the case under test, deliberately: it is the default, every deck that
  // predates the corners register, and the one a rounded-deck check cannot see.
  const CORNER_SQUARE_TOL = 12; // the berth insets 0 on square; allow the tab's own padding
  test('the Fix-Me berth stays on the frame\'s bottom-right corner on a square deck', async () => {
    // `.fit-marked` is FORCED here rather than earned, and that is deliberate. The Fix-Me
    // register is drawn by the live-preview watcher only (`drawFitLabel`, gated on
    // `policy.authorTags` in lib/runtime/index.js); the export's inline watcher never
    // calls it and only STRIPS the class — verified against a real export of
    // `examples/overflow-fix-me.md`, where no slide carries `.fit-marked` and no tab
    // paints. So no deck, however over-stuffed, can earn this register on the surface
    // this file drives.
    //
    // That does not make the assertion synthetic in the sense HARD RULE #23 warns about.
    // The defect under test is a COMPUTED-VALUE trap in CSS — a unitless `--slide-radius`
    // making `calc(var(--slide-radius) * 0.45)` invalid, so `bottom`/`right` fall back to
    // `auto` and the berth drops into flow. The class is precisely and only what reveals
    // the tab, so forcing it exercises the same cascade the preview does, in the same real
    // Chromium, on a real export document. What it does NOT cover is whether the watcher
    // stamps the class, which is a different register's concern and has its own tests.
    const html = renderAt(deck(CORNER('content')), 'berth-square-fixme', 'author');
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(`file://${html}`, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    await new Promise((r) => setTimeout(r, 1200));
    const v = await page.$eval('section', (s) => {
      s.classList.add('fit-marked');
      const e = s.querySelector(':scope > .fixme-tab');
      if (!e) return {};
      e.textContent = 'Fix Me';
      const r = e.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return {};
      return {
        position: getComputedStyle(e).position,
        fixme: { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) },
      };
    });
    await page.close();
    assert.ok(v.fixme, 'expected the Fix-Me tab to paint once `.fit-marked` is on the section');
    assert.equal(v.position, 'absolute',
      'REGRESSION: an in-flow Fix-Me tab takes height from the very cell it reports on');
    const fromRight = 1280 - v.fixme.right;
    const fromBottom = 720 - v.fixme.bottom;
    assert.ok(
      fromRight <= CORNER_SQUARE_TOL,
      `Fix-Me tab is ${fromRight}px in from the frame's right edge on a SQUARE deck — it should `
      + 'be on it. A berth inset that resolves to an invalid length falls back to `auto` and '
      + 'drops the marker into flow. Check that `--slide-radius` is declared `0px`, not `0`.',
    );
    assert.ok(
      fromBottom <= CORNER_SQUARE_TOL,
      `Fix-Me tab is ${fromBottom}px above the frame's bottom edge on a SQUARE deck — same cause.`,
    );
  });


});
