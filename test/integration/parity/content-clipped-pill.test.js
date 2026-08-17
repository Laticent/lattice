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
      const tab = s.querySelector(':scope > .overflow-tab');
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
        // probed. Assert the property that actually matters.
        position: tab ? getComputedStyle(tab).position : null,
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
      const tab = s.querySelector(':scope > .overflow-tab');
      const ft = s.querySelector('.cell-footer > footer, :scope > footer');
      const tr = tab ? tab.getBoundingClientRect() : null;
      const fr = ft ? ft.getBoundingClientRect() : null;
      return {
        clipMarked: s.classList.contains('clip-marked'),
        hasFooter: !!ft,
        tabVisible: !!(tab && getComputedStyle(tab).display !== 'none' && tr && tr.width > 0),
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

  test('AUTHOR — the tab is ABSOLUTE, so the marker cannot take height from the cell', async () => {
    // `author` is the DEFAULT on every live surface (preview, Studio, Playground), and it
    // was the level this suite did not test — which is how a tab that rendered IN FLOW,
    // stealing 50px of the very `.cell-stage` being probed, survived a green suite. The
    // marker manufacturing the clip it reports is the failure the probe's own header
    // names; assert the property, at the level where it broke.
    const v = await inspect(ELLIPSIS, 'pill-author', 'author');
    assert.equal(v.clipMarked, true);
    assert.equal(v.visible, true);
    assert.equal(v.position, 'absolute',
      'REGRESSION: a static tab sits in flow and takes height from the cell it reports on');
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

  // ── THE CORNER TRUTH TABLE ───────────────────────────────────────────────────
  // Three absolutely-positioned boxes want `top: 0; right: 0`: the status stamp
  // (base.variants.css, on `section::before`), the clip tab, and the legibility tab.
  // They de-collide by stacking, and the arithmetic lives in `--corner-stack` /
  // `--clip-stack`.
  //
  // THIS SUITE EXISTS BECAUSE THAT RULE SHIPPED BROKEN THREE TIMES AND NO GATE SAW IT:
  //   1. the reader pill was moved into the corner on a survey that missed the stamp;
  //   2. the first de-collision pushed all 21 stamp CLASS NAMES by a fixed row, which
  //      was measured wrong on 8 of the 14 SHAPES (six sit ~43px lower and were pushed
  //      INTO);
  //   3. the rewrite that fixed that used UNITLESS `calc()` fallbacks — `calc(100% + 0)`
  //      mixes <percentage> with <number>, which is invalid, so the whole `transform`
  //      was discarded and both tabs landed in the same band again.
  //
  // Every one of those passed `npm test`, `build:check`, the pixel gate and CI, because
  // no committed golden carries a stamp AND a marker tab — the machine gates verify
  // INTERNAL CONSISTENCY, which none of these violated. Only computed style on a real
  // export can answer this, so that is what this asserts.
  const CORNER = (cls) => `<!-- _class: ${cls} -->

## A slide that cuts content and shrinks its figure.

<div style="display:flex"><strong style="display:block;max-width:9em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Advanced beginner practitioner level</strong></div>

<svg viewBox="0 0 400 40" width="40" height="4"><text x="4" y="30" font-size="12">tiny</text></svg>
`;

  // The corner's FOURTH occupant is the author's logo, and it is the one the engine
  // does not own the geometry of (#1404). Rendered with a stamp, the reserve used to
  // land the clip tab at y 23→46 on top of a mark occupying y 24→75 — and the tab is
  // opaque, so it sliced the mark's top off. `logo:` + `confidential` is close to the
  // modal delivered board deck.
  //
  // The logo src is ABSOLUTE on purpose: renderAt writes the deck into
  // `.scratch/pill-levels/`, and a relative `logo:` resolves against the OUTPUT
  // directory rather than the deck (#1406), so a relative path here would silently
  // render no logo at all and the assertion below would pass for the wrong reason.
  const LOGO_SRC = path.join(ROOT, 'test', 'fixtures', 'acme-logo.svg');
  const deckWithLogo = (body) =>
    `---\nmarp: true\ntheme: indaco\nlogo: ${LOGO_SRC}\n---\n\n${body.trim()}\n`;
  // `logo-style: brand` puts the mark on a plate — `padding: 0.4cqi` at
  // `box-sizing: content-box`, so the BOX is 0.8cqi wider than the reserve's
  // `6.25cqi * scale` term, and the gap token absorbing it is only 0.625cqi. Measured, the
  // tab overlapped the plate by 1px: the same one-pixel near-miss that hid the original
  // defect through five adversarial rounds, in the one variant the first canary did not
  // cover. (HARD RULE #25 checker + red team, independently.)
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
      const box = (e) => {
        if (!e) return null;
        const r = e.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) };
      };
      const stampTop = getComputedStyle(s, '::before').content !== 'none'
        ? 0 : null;   // the stamp paints at top:0 when a semantic class is present
      return {
        cls: s.className,
        stamp: stampTop !== null,
        clip: box(s.querySelector(':scope > .overflow-tab')),
        leg: box(s.querySelector(':scope > .illegible-tab')),
        logo: box(s.querySelector(':scope > img.deck-logo')),
      };
    });
    await page.close();
    return v;
  }

  const disjoint = (a, b) => !a || !b || a.bottom <= b.top || b.bottom <= a.top;
  // The logo case needs BOTH axes: the tabs clear it horizontally (they stack to its
  // left), so a y-only test would call an exact overlap disjoint.
  const disjoint2d = (a, b) =>
    !a || !b || a.bottom <= b.top || b.bottom <= a.top || a.right <= b.left || b.right <= a.left;

  test('CORNER — the clip tab and the legibility tab never share a band', async () => {
    // The row the unitless-calc bug broke: no stamp, both tabs drawn. Before the fix
    // the legibility tab computed `transform: none` and sat on top of the clip tab.
    const v = await corners('content', 'corner-plain');
    assert.ok(v.clip && v.leg, `both tabs must be drawn — got ${JSON.stringify(v)}`);
    assert.ok(
      disjoint(v.clip, v.leg),
      `REGRESSION: the two marker tabs overlap. clip=${JSON.stringify(v.clip)} `
      + `leg=${JSON.stringify(v.leg)}. An invalid calc() drops the whole transform, so `
      + 'check that the --corner-stack / --clip-stack fallbacks are TYPED (0%, not 0).',
    );
  });

  test('CORNER — a status stamp pushes both tabs clear of itself', async () => {
    // The row round 4 found: `confidential` paints at top:0/right:0 at z-index 100,
    // over the tabs' 50, and swallowed the pill whole on `stamp-notch`.
    const v = await corners('content confidential', 'corner-stamp');
    assert.equal(v.stamp, true, 'the fixture must actually paint a stamp');
    assert.ok(v.clip && v.leg, `both tabs must be drawn — got ${JSON.stringify(v)}`);
    assert.ok(v.clip.top > 0, 'REGRESSION: the clip tab did not clear the status stamp');
    assert.ok(
      disjoint(v.clip, v.leg),
      `REGRESSION: tabs overlap under a stamp. clip=${JSON.stringify(v.clip)} leg=${JSON.stringify(v.leg)}`,
    );
  });

  test('CORNER — a shape that does NOT sit in the corner reserves nothing', async () => {
    // The row round 5 found: six stamp shapes sit ~43px below the corner, and pushing
    // the tab for them moved it INTO the stamp instead of clear of it. `stamp-seal` is
    // one; with no semantic class it paints nothing at all, so it must reserve nothing.
    const plain = await corners('content', 'corner-ref');
    // `stamp-tab` is the DEFAULT register and the one `stamp:` front matter appends to
    // every section in the deck, so it is the shape that actually reserved a row for a
    // stamp that paints nothing. (An earlier version of this test used `stamp-seal`,
    // which was explicitly zeroed and so passed for the wrong reason.)
    const shape = await corners('content stamp-tab', 'corner-shape');
    assert.deepEqual(
      shape.clip, plain.clip,
      'REGRESSION: a non-corner stamp shape displaced the clip tab. The shape class must '
      + 'MODIFY the reserve, never create one — the semantic class is what paints.',
    );
  });

  test('CORNER — the deck logo and the marker tabs never overlap, stamp or no stamp', async () => {
    for (const [cls, key] of [['content', 'corner-logo-plain'], ['content confidential', 'corner-logo-stamp']]) {
      const v = await corners(cls, key, deckWithLogo);
      assert.ok(v.logo, `the ${key} fixture must actually render a logo — an absolute src is required here (#1406)`);
      assert.ok(v.clip && v.leg, `both tabs must be drawn — got ${JSON.stringify(v)}`);
      assert.ok(
        disjoint2d(v.logo, v.clip),
        `REGRESSION: the clip tab overlaps the deck logo on "${cls}". logo=${JSON.stringify(v.logo)} `
        + `clip=${JSON.stringify(v.clip)}. The tab is opaque, so an overlap SLICES the author's mark. `
        + 'The tabs clear it horizontally via --corner-logo-reserve, which needs BOTH the '
        + '`data-logo-corner` attribute (stamped by every logo injector) and `--logo-scale` declared '
        + 'on the SECTION — a custom property on the img itself is invisible to these rules (#1404).',
      );
      assert.ok(
        disjoint2d(v.logo, v.leg),
        `REGRESSION: the legibility tab overlaps the deck logo on "${cls}". logo=${JSON.stringify(v.logo)} `
        + `leg=${JSON.stringify(v.leg)}`,
      );
      assert.ok(disjoint(v.clip, v.leg), `the two tabs must still not overlap each other on "${cls}"`);
    }
  });

  test('CORNER — a BRAND-plated logo is cleared too, plate and all', async () => {
    const v = await corners('content confidential', 'corner-logo-brand', deckWithBrandLogo);
    assert.ok(v.logo, 'the fixture must render a logo');
    assert.ok(v.clip, 'the clip tab must be drawn');
    assert.ok(
      disjoint2d(v.logo, v.clip),
      `REGRESSION: the clip tab overlaps the BRAND plate. logo=${JSON.stringify(v.logo)} `
      + `clip=${JSON.stringify(v.clip)}. \`logo-style: brand\` grows the mark's box by 0.8cqi `
      + '(content-box padding) which --corner-logo-reserve must add — the plain reserve is short by '
      + 'more than the gap token can absorb.',
    );
  });

  test('CORNER — a repositioned logo releases the corner, so the tabs reclaim the full width', async () => {
    // `logo-x`/`logo-y` move the mark anywhere on the slide and flip it to left-anchoring.
    // The corner is free again, so reserving width for it would push the marker left for
    // nothing — and a reserve that never releases is how chrome creeps into the body.
    const moved = (body) =>
      `---\nmarp: true\ntheme: indaco\nlogo: ${LOGO_SRC}\nlogo-x: 50\nlogo-y: 84\n---\n\n${body.trim()}\n`;
    const v = await corners('content', 'corner-logo-moved', moved);
    const ref = await corners('content', 'corner-logo-none');
    assert.ok(v.logo, 'the fixture must still render a logo, just not in the corner');
    assert.deepEqual(
      v.clip, ref.clip,
      'REGRESSION: a repositioned logo still reserved corner width. `data-logo-corner` must be '
      + 'withheld when BOTH placement axes are set (plugins.js deckLogoInCorner / the runtime mirror).',
    );
  });


  // ── The corner berths sit ON the corner, on a SQUARE deck ────────────────────────
  //
  // The gate this file needed and did not have. Every assertion above is RELATIVE —
  // tabs disjoint from each other, clear of the logo, stacked in order — so all 13
  // passed while both tabs had fallen out of the corner entirely and were printing
  // across the headline, 92px down and 1040px in from the right.
  //
  // The cause was a unitless `--slide-radius: 0` reaching `calc(var(--slide-radius) *
  // 0.45)` in the berth insets (#1649): a unitless zero is a <number> inside calc(),
  // so the length was invalid at computed-value time and `top`/`right` fell back to
  // `auto`. That is the SAME typed-fallback trap this file's own `--corner-stack` note
  // records, re-created in the rule block below it — which is why the guard has to be
  // an absolute measurement and not another comment.
  //
  // SQUARE is the case under test, deliberately: it is the default, every deck that
  // predates the corners register, and the one a rounded-deck check cannot see.
  // The RIGHT edge is the assertion that carries both markers, because both are pinned to
  // it: the defect drove them to `right: 1040px`, a fifth of the way across the slide.
  // Only the FIRST berth is also pinned to the top — the illegible tab deliberately stacks
  // one tab-height below it (`--clip-stack`), which the ordering tests above already cover.
  const CORNER_SQUARE_TOL = 12; // the berths inset 0 on square; allow the tab's own padding
  for (const [name, cls, pinnedToTop] of [
    ['overflow', 'clip', true],
    ['illegible', 'leg', false],
  ]) {
    test(`the ${name} berth stays on the frame's right edge on a square deck`, async () => {
      const v = await corners('', `berth-square-${cls}`);
      const tab = v[cls];
      assert.ok(tab, `expected the ${name} tab to render`);
      // A section renders at the viewport origin here, so the frame's right edge is the
      // viewport width.
      const fromRight = 1280 - tab.right;
      assert.ok(
        fromRight <= CORNER_SQUARE_TOL,
        `${name} tab is ${fromRight}px in from the frame's right edge on a SQUARE deck — it should be on it. ` +
          'A berth inset that resolves to an invalid length falls back to `auto` and drops the marker into flow.',
      );
      if (pinnedToTop) {
        assert.ok(
          tab.top <= CORNER_SQUARE_TOL,
          `${name} tab is ${tab.top}px below the frame top on a SQUARE deck — it should be on the corner.`,
        );
      }
    });
  }

});
