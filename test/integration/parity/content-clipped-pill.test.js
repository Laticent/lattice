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
const { renderHtml } = require('../../helpers/semantic-render');

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

  async function inspect(body, key) {
    const html = renderHtml(deck(body), { key, timeout: 240000 });
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
        contentClipped: s.classList.contains('content-clipped'),
        marker: s.getAttribute('data-lattice-overflow-marker'),
        text: tab ? tab.textContent : null,
        // The whole point: COMPUTED display, not class presence. The broken build
        // stamped every class correctly and rendered nothing.
        visible: tab ? getComputedStyle(tab).display !== 'none' && tab.getBoundingClientRect().width > 0 : false,
      };
    });
    await page.close();
    return v;
  }

  test('ELLIPSIS — cut content with no frame overflow is told to the reader', async () => {
    const v = await inspect(ELLIPSIS, 'pill-ellipsis');
    assert.equal(v.over, false, 'a formatter truncation crosses no box edge — `over` stays geometric');
    assert.equal(v.contentClipped, true, 'the section must carry .content-clipped');
    assert.equal(v.text, 'Content clipped');
    assert.equal(
      v.visible,
      true,
      'REGRESSION: the pill was drawn and then hidden. `base.modifiers.css` gates tab visibility '
      + 'on `section:not(.overflow):not(.content-clipped)`; if either class or either clause is '
      + 'missing, the reader half of #1300 does not exist — the JS stamps everything correctly '
      + 'and the artifact shows nothing.',
    );
  });

  test('SHEAR — an over-stuffed split-panel is reported (the #1299 shape)', async () => {
    const v = await inspect(SHEAR, 'pill-shear');
    assert.equal(v.over, true, 'with `safe` alignment the loss moves to the tail, which grows scrollHeight');
    assert.equal(v.visible, true, 'and the reader is told');
    assert.equal(v.text, 'Content clipped');
  });

  test('CLEAN — a fitting slide carries no pill at all', async () => {
    const v = await inspect(CLEAN, 'pill-clean');
    assert.equal(v.over, false);
    assert.equal(v.contentClipped, false);
    assert.equal(v.visible, false, 'a fitting slide must not be marked — the control for the two above');
  });
});
