/**
 * CHROME SUPPRESSION invariants — the author-facing chrome-control matrix
 * (design/design-system.md §6.5; engineering/decisions/2026-07-03-claim-*).
 *
 * Renders ONE Form deck through the real emulator and asserts, via computed
 * `display`, that each chrome token actually hides its element ON A FORM DECK —
 * the default composition. This is a REAL-SURFACE guard (HARD RULE #23): the
 * suppression is a CSS-cascade fact (some rules are unlayered and beat @layer
 * universal), which jsdom cannot evaluate — only a browser laying out the real
 * lattice.css can.
 *
 * Why it exists: `no-footer`/`silent` silently FAILED to hide the running footer
 * on Form decks for a full release — the migrated footer nests in `.cell-footer`
 * and an unlayered `display:flex` beat the direct-child `> footer` rule. Nothing
 * tested chrome hiding on the Form frame, so it went unnoticed. This locks it in.
 *
 * Needs Chromium (CHROME_PATH / puppeteer cache) + the emulator.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { renderHtml } = require('../../helpers/semantic-render');

/** Best-effort Chromium path — mirrors component-invariants.test.js. */
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

// A Form deck (default composition) with a running header + footer + page numbers
// set deck-wide, then slides that opt out via each chrome token (1-based slide
// indices in `data-lattice-slide`). A leading divider establishes a SECTION so the
// progress rail renders on the content slides that follow (the rail is a no-op
// outside a section); the divider is a sovereign frame, so slides 2+ are the ones
// under test.
const DECK = `---
marp: true
theme: indaco
header: "Running Header"
footer: "Footer Text"
paginate: true
---

# Section One
<!-- _class: divider -->

---

<!-- _class: content -->
## Baseline
All chrome present: header, footer, page number, rail.

---

<!-- _class: content no-header -->
## No header
Header gone; footer + page number stay.

---

<!-- _class: content no-footer -->
## No footer
Footer gone; the PAGE NUMBER must stay (only the footer text hides, not the band).

---

<!-- _class: content no-paginate -->
## No page number
Pagination gone; footer stays.

---

<!-- _class: content no-progress -->
## No rail
The section rail is gone.

---

<!-- _class: content silent -->
## Silent
Header, footer, and page number all gone at once.
`;

// Is the element for `selector` on slide `n` present AND visibly displayed
// (display !== none, and it has layout boxes)? Returns { present, shown }.
async function probe(page, n, selector) {
  return page.evaluate(({ n, selector }) => {
    const sec = document.querySelector(`section[data-lattice-slide="${n}"]`);
    if (!sec) return { present: false, shown: false };
    const el = sec.querySelector(selector);
    if (!el) return { present: false, shown: false };
    const cs = getComputedStyle(el);
    const shown = cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length > 0;
    return { present: true, shown };
  }, { n, selector });
}

// The running footer text (migrated Form nesting or legacy direct child).
const FOOTER = '.cell-footer > footer, :scope > footer';
const HEADER = ':scope > header';
const RAIL = '.tile-progress';
const PAGINATION = '.lat-pagination';

describe('chrome suppression on a Form deck (real render)', () => {
  let browser;
  let page;
  before(async () => {
    const html = renderHtml(DECK, { key: 'chrome-suppression' });
    browser = await puppeteer.launch({
      executablePath: resolveChrome(),
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    page = await browser.newPage();
    await page.goto(`file://${html}`, { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(async () => {
      try {
        await Promise.all([...document.fonts].map((f) => f.load().catch(() => {})));
        await document.fonts.ready;
      } catch { /* Font Loading API absent — proceed */ }
    });
  }, { timeout: 630000 });
  after(async () => { if (browser) await browser.close(); });

  test('baseline (slide 2): header, footer, page number, rail all present', async () => {
    assert.equal((await probe(page, 2, HEADER)).shown, true, 'header should show');
    assert.equal((await probe(page, 2, FOOTER)).shown, true, 'footer should show');
    assert.equal((await probe(page, 2, PAGINATION)).shown, true, 'page number should show');
    assert.equal((await probe(page, 2, RAIL)).shown, true, 'rail should show');
  });

  test('no-header (slide 3): header hidden, footer + page number stay', async () => {
    assert.equal((await probe(page, 3, HEADER)).shown, false, 'header must be hidden');
    assert.equal((await probe(page, 3, FOOTER)).shown, true, 'footer must remain');
    assert.equal((await probe(page, 3, PAGINATION)).shown, true, 'page number must remain');
  });

  test('no-footer (slide 4): footer hidden on a Form deck, page number RETAINED', async () => {
    // The regression guard: the footer bug hid nothing here for a whole release,
    // and hiding the whole band (the naive fix) would also kill the page number.
    assert.equal((await probe(page, 4, FOOTER)).shown, false, 'footer must be hidden on the Form frame');
    assert.equal((await probe(page, 4, PAGINATION)).shown, true, 'page number must survive — only the footer text hides');
  });

  test('no-paginate (slide 5): page number hidden, footer stays', async () => {
    assert.equal((await probe(page, 5, PAGINATION)).shown, false, 'page number must be hidden');
    assert.equal((await probe(page, 5, FOOTER)).shown, true, 'footer must remain');
  });

  test('no-progress (slide 6): section rail hidden', async () => {
    assert.equal((await probe(page, 6, RAIL)).shown, false, 'rail must be hidden');
  });

  test('silent (slide 7): header, footer, and page number all hidden', async () => {
    assert.equal((await probe(page, 7, HEADER)).shown, false, 'header must be hidden');
    assert.equal((await probe(page, 7, FOOTER)).shown, false, 'footer must be hidden');
    assert.equal((await probe(page, 7, PAGINATION)).shown, false, 'page number must be hidden');
  });
});
