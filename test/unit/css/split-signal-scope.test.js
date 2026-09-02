/**
 * Unit: the split wayfinding signal is styled on EVERY page a split emitted.
 *
 * The one-line "→ next: …" / "→ continues" adornment is a RUN-level fact — it tells the reader
 * the run has not ended — so its styling has to follow the ELEMENT, not the class of whatever
 * built the page. It did not: the treatment was keyed on `section.form.lat-split-native`, which
 * only the PLAIN envelope's body pages carry. The ten carousel strategies give their pages their
 * own classes (`content compare-split compare-split-points form`), so all of them missed it.
 *
 * The visible cost was larger than a font: the rule carries `display: flex`, which is what lays
 * the drawn mark out. Measured on `examples/read-across-carousel.pdf`, a `compare-prose` body page
 * rendered its signal as PLAIN BODY TEXT at full size with no mark and no hairline, jammed under
 * the card — two pages after the identical signal read as muted mono chrome. Neither the unit
 * suite, the integration tier, CI, nor two adversarial passes saw it; rasterizing the deck did.
 *
 * So this asks the browser, on both page shapes, for the three properties that make the signal
 * read as chrome rather than as content.
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
          borderTopWidth: cs.borderTopWidth,
          bodyFontSize: getComputedStyle(el.closest('section')).fontSize,
          markWidth: before.width,
        };
      }, `sig${i}`);

      // `display: flex` is what lays the drawn mark out beside the text; without it the mark
      // collapses and the line reads as a paragraph.
      assert.equal(got.display, 'flex', 'the signal is not a flex row, so its mark cannot lay out');
      // Smaller than the slide's body text — the whole point is that it cannot be mistaken for
      // the member's own words.
      assert.ok(parseFloat(got.fontSize) < parseFloat(got.bodyFontSize),
        `signal ${got.fontSize} is not smaller than body ${got.bodyFontSize}`);
      // The hairline that separates wayfinding from content.
      assert.notEqual(got.borderTopWidth, '0px', 'the separating hairline is missing');
      // And the mark itself has a box.
      assert.notEqual(got.markWidth, 'auto', 'the drawn mark has no box');
      assert.notEqual(parseFloat(got.markWidth), 0, 'the drawn mark collapsed to zero width');
    });
  }
});
