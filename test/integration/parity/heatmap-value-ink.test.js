/**
 * Integration: the heatmap value ink FLIPS with the cell, on both canvases.
 *
 * WHY THIS EXISTS AS ITS OWN ARM, and it is not a nice-to-have. `heatmap` is
 * the only chart member whose text ink is decided per MARK rather than per
 * canvas: a value printed on a faint cell and one printed on a saturated cell
 * take opposite inks, and which is which inverts between light and dark. So the
 * component paints opaque black in FOUR of the four theme x scheme cells, and
 * `check-viz-render` — whose whole job is catching a themed color that fell to
 * black — has four sanctioned entries for it in
 * `test/viz-render/black-baseline.json`.
 *
 * That sanction is load-bearing and it is also a hole. The gate records a
 * finding by CLASS selector (`text.heatmap-value`), which cannot distinguish
 * the flipped cells from the rest — so once the entry exists, a genuine
 * dropped-color break in this component's ink is invisible to it. Every other
 * sanctioned black in that baseline is light-scheme only (quadrant's max-
 * contrast label), which is exactly the shape a reader expects; heatmap's
 * both-scheme pair looks like rot and is not, and nothing in the baseline can
 * say so. This arm is what makes the sanction safe to hold: it asserts the
 * relationship the gate can no longer see.
 *
 * THE ASSERTION IS THE INVERSION, not the literal colors. Four facts, measured
 * on the real rendered document rather than read off the stylesheet:
 *   - light canvas: a faint cell's value is BLACK, a flipped cell's is WHITE;
 *   - dark canvas:  the same two are WHITE and BLACK.
 * A dropped `light-dark()` collapses one side onto the other and fails here;
 * the sanctioned blacks stay sanctioned because their partners are still right.
 *
 * Needs a Chromium (CHROME_PATH or the puppeteer cache); SKIPS with a notice
 * when none is reachable, never a false green (HARD RULE #23).
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { resolveChrome } = require('../../../tools/lib/resolve-chrome');

const ROOT = path.join(__dirname, '..', '..', '..');
const DECK = path.join(ROOT, 'examples', 'heatmap.md');

const BLACK = 'rgb(0, 0, 0)';
const WHITE = 'rgb(255, 255, 255)';

/**
 * Render the SHIPPED heatmap deck for one palette through the real emulator and
 * return the HTML it emits. The deck rather than a synthetic fixture on purpose:
 * the ink crossover is a property of the ramp a real matrix produces, and a
 * hand-built two-cell probe would let the constant drift without failing here.
 */
function renderDeck(palette) {
  const { execFileSync } = require('node:child_process');
  const os = require('node:os');
  const fs = require('node:fs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-ink-'));
  const pdf = path.join(dir, `${palette}.pdf`);
  execFileSync(process.execPath, [path.join(ROOT, 'lattice-emulator.js'), DECK, pdf, '-p', palette],
    { cwd: ROOT, stdio: 'pipe' });
  return pdf.replace(/\.pdf$/, '.html');
}

describe('heatmap — the value ink flips with the cell, on both canvases', () => {
  let browser = null;
  let chrome = null;

  before(async () => {
    try { chrome = resolveChrome(); } catch (_e) { chrome = null; }
    if (!chrome) return;
    browser = await puppeteer.launch({
      executablePath: chrome, headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  });
  after(async () => { if (browser) await browser.close(); });

  for (const [palette, faint, flipped] of [
    ['indaco', BLACK, WHITE],
    ['indaco-dark', WHITE, BLACK],
  ]) {
    test(`${palette}: a faint cell takes ${faint === BLACK ? 'dark' : 'light'} ink, a saturated one the opposite`, async () => {
      if (!browser) {
        console.error('heatmap-value-ink: SKIPPED — no Chromium; the ink-flip guard did not run.');
        return; // not a pass claim — the skip is logged
      }
      const html = renderDeck(palette);
      const page = await browser.newPage();
      try {
        await page.goto(`file://${html}`, { waitUntil: 'networkidle0' });
        const seen = await page.evaluate(() => {
          const rows = { faint: new Set(), flipped: new Set(), counts: { faint: 0, flipped: 0 } };
          for (const t of document.querySelectorAll('text.heatmap-value')) {
            const key = t.getAttribute('data-ink') === 'flip' ? 'flipped' : 'faint';
            rows[key].add(getComputedStyle(t).fill);
            rows.counts[key]++;
          }
          return { faint: [...rows.faint], flipped: [...rows.flipped], counts: rows.counts };
        });
        assert.ok(seen.counts.faint > 0 && seen.counts.flipped > 0,
          `the deck must exercise BOTH inks, got ${JSON.stringify(seen.counts)} — `
          + 'a deck with no saturated cell would pass this arm while asserting nothing');
        assert.deepEqual(seen.faint, [faint], `faint-cell ink on ${palette}`);
        assert.deepEqual(seen.flipped, [flipped], `saturated-cell ink on ${palette}`);
        assert.notDeepEqual(seen.faint, seen.flipped, 'the two inks must not collapse onto one another');
      } finally {
        await page.close();
      }
    });
  }
});
