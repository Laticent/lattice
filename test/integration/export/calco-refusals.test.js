/**
 * Integration: the refusal budget for Calco's editable export.
 *
 * A "refusal" is a painted box that `readSlide` leaves in the picture instead of lifting into a native
 * shape (`ReadResult.refused`, with `diagnose`). Every one is something an owner can still drag as part
 * of a picture, so the count is a ratchet: a change may lower it and may not raise it. The budget is
 * measured on the demo decks the export work was built against, rendered by the real CLI and read in
 * a real Chromium (HARD RULE #23).
 *
 *   node --test test/integration/export/calco-refusals.test.js          # check
 *   CALCO_REFUSALS_BLESS=1 node --test test/integration/export/calco-refusals.test.js   # re-measure
 *
 * Re-measure only in a PR that justifies the new numbers (a lower count ratchets the budget down; a
 * higher one needs the reason in the PR body). Shapes are recorded too, so a drop in lifted shapes
 * shows in the diff even when the refusal count holds.
 *
 * Slow tier: one CLI render per deck and one Chromium launch.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const puppeteer = require('puppeteer');
const { readSlide } = require('@laticent/calco');

const ROOT = path.join(__dirname, '../../..');
const BUDGET = path.join(__dirname, 'calco-refusals.budget.json');
const DECKS = ['card-tags', 'accent-finishes', 'cards-stats-actors-kpi', 'chart-finish', 'backdrop-register'];
const BLESS = process.env.CALCO_REFUSALS_BLESS === '1';

describe('calco refusal budget', () => {
  let browser;
  let tmp;
  const measured = {};
  before(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'calco-refusals-'));
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    for (const deck of DECKS) {
      const html = path.join(tmp, `${deck}.html`);
      execFileSync('node', [path.join(ROOT, 'lattice.js'), path.join(ROOT, 'examples', `${deck}.md`), html], { cwd: ROOT, stdio: 'ignore' });
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720 });
      await page.goto(`file://${html}`, { waitUntil: 'load' });
      await new Promise((r) => setTimeout(r, 1500));
      let refused = 0;
      let shapes = 0;
      const reasons = {};
      for (const slide of await page.$$('section[data-lattice-slide]')) {
        const res = await slide.evaluate(readSlide, { shapes: true, diagnose: true });
        refused += res.refused.length;
        shapes += res.shapes.length;
        for (const r of res.refused) reasons[r.reason] = (reasons[r.reason] || 0) + 1;
      }
      await page.close();
      measured[deck] = { refused, shapes, reasons };
    }
  });
  after(async () => {
    await browser?.close();
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
    if (BLESS) fs.writeFileSync(BUDGET, `${JSON.stringify(measured, null, 2)}\n`);
  });

  for (const deck of DECKS) {
    test(`${deck}: no more refusals than the budget, and no fewer shapes`, (t) => {
      if (BLESS) return t.skip('blessing');
      const budget = JSON.parse(fs.readFileSync(BUDGET, 'utf8'))[deck];
      assert.ok(budget, `no budget for ${deck}: bless it`);
      const got = measured[deck];
      assert.ok(got.refused <= budget.refused, `${deck}: ${got.refused} refusals, budget ${budget.refused}. Now: ${JSON.stringify(got.reasons)}. Was: ${JSON.stringify(budget.reasons)}`);
      assert.ok(got.shapes >= budget.shapes, `${deck}: ${got.shapes} lifted shapes, budget ${budget.shapes}`);
    });
  }
});
