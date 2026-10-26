/**
 * Integration: the refusal budget for Calco's editable export.
 *
 * A "refusal" is a painted box that `readSlide` leaves in a picture instead of lifting into a native
 * shape (`ReadResult.refused`, with `diagnose`), and each cluster of such content is one picture of its
 * own (`sprites`). Every one is something an owner cannot edit as a shape, so both counts are a ratchet: a change may lower it and may not raise it. The budget is
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
// `deck@finish` renders that deck under another chart finish (its front matter's `marks:` replaced). Etch and
// tone repaint the status marks as a wash inside an ink ring, which is where a picture can creep in that pigment never
// shows (#2887: a fill clipped under an inset ring exported 9 pills as pictures, under etch and tone only).
const DECKS = ['card-tags', 'accent-finishes', 'cards-stats-actors-kpi', 'struck-elevation', 'marks', 'marks@etch', 'marks@tone', 'backdrop-register', 'state-marks', 'policy-recommendation'];
const withFinish = (src, finish) => {
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(src);
  const keep = fm ? fm[1].split('\n').filter((l) => !/^marks:/.test(l)).join('\n') : '';
  return `---\n${keep ? `${keep}\n` : ''}marks: ${finish}\n---\n${fm ? src.slice(fm[0].length) : `\n${src}`}`;
};
const BLESS = process.env.CALCO_REFUSALS_BLESS === '1';

describe('calco refusal budget', () => {
  let browser;
  let tmp;
  const measured = {};
  before(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'calco-refusals-'));
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    for (const deck of DECKS) {
      const [name, finish] = deck.split('@');
      let md = path.join(ROOT, 'examples', `${name}.md`);
      if (finish) {
        md = path.join(tmp, `${name}-${finish}.md`);
        fs.writeFileSync(md, withFinish(fs.readFileSync(path.join(ROOT, 'examples', `${name}.md`), 'utf8'), finish));
      }
      const html = path.join(tmp, `${deck.replace('@', '-')}.html`);
      execFileSync('node', [path.join(ROOT, 'lattice.js'), md, html], { cwd: ROOT, stdio: 'ignore' });
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720 });
      await page.goto(`file://${html}`, { waitUntil: 'load' });
      await new Promise((r) => setTimeout(r, 1500));
      let refused = 0;
      let shapes = 0;
      let pictures = 0;
      const reasons = {};
      for (const slide of await page.$$('section[data-lattice-slide]')) {
        const res = await slide.evaluate(readSlide, { shapes: true, diagnose: true, sprites: true });
        refused += res.refused.length;
        shapes += res.shapes.filter((sh) => sh.kind !== 'picture').length;
        pictures += res.shapes.filter((sh) => sh.kind === 'picture').length;
        for (const r of res.refused) reasons[r.reason] = (reasons[r.reason] || 0) + 1;
      }
      await page.close();
      measured[deck] = { refused, shapes, pictures, reasons };
    }
  });
  after(async () => {
    await browser?.close();
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
    if (BLESS) fs.writeFileSync(BUDGET, `${JSON.stringify(measured, null, 2)}\n`);
  });

  for (const deck of DECKS) {
    test(`${deck}: no more refusals or pictures than the budget, and no fewer shapes`, (t) => {
      if (BLESS) return t.skip('blessing');
      const budget = JSON.parse(fs.readFileSync(BUDGET, 'utf8'))[deck];
      assert.ok(budget, `no budget for ${deck}: bless it`);
      const got = measured[deck];
      assert.ok(got.refused <= budget.refused, `${deck}: ${got.refused} refusals, budget ${budget.refused}. Now: ${JSON.stringify(got.reasons)}. Was: ${JSON.stringify(budget.reasons)}`);
      assert.ok(got.shapes >= budget.shapes, `${deck}: ${got.shapes} lifted shapes, budget ${budget.shapes}`);
      assert.ok(got.pictures <= budget.pictures, `${deck}: ${got.pictures} pictures, budget ${budget.pictures}`);
    });
  }
});
