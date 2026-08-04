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
});
