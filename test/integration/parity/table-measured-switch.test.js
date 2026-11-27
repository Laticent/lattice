/**
 * Integration: the MEASURED TABLE SWITCH on the real CLI export (owner, 2026-11-15;
 * engineering/decisions/2026-10-28-fit-everywhere-model.md §25, 2026-11-03-responsive-tables.md).
 *
 * A table switches to its narrow layout at a width in `em` (base.table-reflow.css), or, now, when the page
 * measures its grid running past the slide's edge (lib/core/table-reflow-fit.js `forceOverflowingReflow`,
 * which marks its stage `--lat-reflow-force: 1`; each layout's container query also accepts that mark).
 * Raising the card width to 24em instead fixed the same tables and turned about 140 grids that fit into one
 * card per row, so it was reverted. Cases, on one square deck at the phone default:
 *   WIDE  a three-column table of long code values runs past the slide's edge in grid form: it is forced
 *         into cards, and the export reports no clipped slide
 *   FITS     table-outer-edge.md's four-column numbers table, whose grid reaches 7px into the slide's margin and
 *            reads whole: it is not forced and keeps its grid
 *   SHARED   a fitting two-column table beside a wide one on one slide: the mark sits on the stage and would
 *            switch both, so neither is forced and the fitting one keeps its grid (the wide one still clips:
 *            the documented limit of a stage-level mark)
 *   REJUDGE  a forced slide widened in the page loses the mark, as a live preview's resize does
 *
 * FALSIFIABLE: without the CLI's force step WIDE keeps its grid and the export prints OVERFLOW; with the
 * stage's content edge as the boundary instead of the slide's, FITS is forced into cards; without the
 * one-table rule SHARED's fitting table turns into cards; without the clear-first step REJUDGE keeps the mark.
 * Needs Chromium (CHROME_PATH).
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const puppeteer = require('puppeteer');
const { resolveChrome } = require('../../../tools/lib/resolve-chrome');
const { FORCE_OVERFLOWING_REFLOW_SRC } = require('../../../lib/core/table-reflow-fit');

const ROOT = path.join(__dirname, '..', '..', '..');
const DECK = `---
marp: true
theme: indaco
size: square
---

<!-- _class: content -->

## Paste the address you already have.

| Provider | Accepted forms | Badge |
|---|---|---|
| YouTube | \`watch?v=\`, \`youtu.be/\`, \`shorts/\`, \`embed/\`, \`live/\` | Watch on YouTube |
| Vimeo | \`vimeo.com/123456\`, \`player.vimeo.com/video/123456\` | Watch on Vimeo |

---

<!-- _class: content -->

## A build beats a vendor on two of four.

| Criterion | Spreadsheet | Vendor North | In-house build |
| ------------ | ----------- | ------------ | -------------- |
| Speed | Already open | 3–4 weeks | Same quarter |
| Auditability | Weak | Strong | Strong |
| Calibration | None | Vendor-set | Ours to tune |
| Running cost | Lowest | Per seat | Staff time |

---

<!-- _class: content -->

## Two tables, one wide.

| Region | Owner |
|---|---|
| EMEA | Ana |

| Provider | Accepted forms | Badge |
|---|---|---|
| YouTube | \`watch?v=\`, \`youtu.be/\`, \`shorts/\`, \`embed/\`, \`live/\` | Watch on YouTube |
| Vimeo | \`vimeo.com/123456\`, \`player.vimeo.com/video/123456\` | Watch on Vimeo |
`;

let dir;
let log;
let splitLog;
let browser;
let page;
before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'table-switch-'));
  const md = path.join(dir, 'deck.md');
  fs.writeFileSync(md, DECK);
  const pdf = path.join(dir, 'deck.pdf');
  // Both streams: the CLI prints its OVERFLOW warning on STDERR (spawnSync, so a warning exit cannot hide it).
  const run = (out, extra) => {
    const r = require('node:child_process').spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), md, out, '--keep-html', ...extra], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
    if (r.status !== 0) throw new Error(`export failed: ${r.stderr}`);
    return `${r.stdout}${r.stderr}`;
  };
  // WIDE's split export from a deck of that slide alone, so another case's slide cannot answer for it.
  const wideOnly = path.join(dir, 'wide.md');
  fs.writeFileSync(wideOnly, DECK.slice(0, DECK.indexOf('\n---\n', DECK.indexOf('## Paste the address'))) + '\n');
  const r = require('node:child_process').spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), wideOnly, path.join(dir, 'wide.pdf')], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
  if (r.status !== 0) throw new Error(`export failed: ${r.stderr}`);
  splitLog = `${r.stdout}${r.stderr}`;
  log = run(pdf, ['--no-split']);
  browser = await puppeteer.launch({ executablePath: resolveChrome?.() || process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1080 });
  await page.goto(`file://${pdf.replace(/\.pdf$/, '.html')}`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
});
after(async () => {
  await browser?.close();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

const tables = () => page.evaluate(() => [...document.querySelectorAll('section[data-lattice-slide]')].map((s) => {
  const stage = s.querySelector(':scope > .cell-stage');
  const ts = stage ? [...stage.querySelectorAll(':scope > table')] : [];
  if (!ts.length) return null;
  return {
    forced: stage.style.getPropertyValue('--lat-reflow-force').trim() === '1',
    grid: ts.map((t) => getComputedStyle(t.tBodies[0].rows[0]).display === 'table-row'),
    pastEdge: Math.round(ts[0].getBoundingClientRect().right - s.getBoundingClientRect().right),
    pastEdges: ts.map((t) => Math.round(t.getBoundingClientRect().right - s.getBoundingClientRect().right)),
  };
}).filter(Boolean));

test('WIDE: a grid that runs past the slide\'s edge is forced into cards, and the split export clips nothing', async () => {
  const [wide] = await tables();
  assert.equal(wide.forced, true, JSON.stringify(wide));
  assert.deepEqual(wide.grid, [false], 'the rows lay out as cards');
  assert.ok(wide.pastEdge <= 0, `the cards still run ${wide.pastEdge}px past the slide`);
  // The deliverable is the split export: the cards take the pages they need, and no page clips.
  assert.doesNotMatch(splitLog, /OVERFLOW/, splitLog);
});

test('FITS: a grid that only reaches into the slide\'s margin keeps its grid', async () => {
  const [, fits] = await tables();
  assert.equal(fits.forced, false, JSON.stringify(fits));
  assert.deepEqual(fits.grid, [true]);
});

test('SHARED: a fitting table beside a wide one keeps its grid (the mark is the stage\'s, so neither is forced)', async () => {
  const [, , shared] = await tables();
  assert.ok(shared.pastEdges[1] > 0, `the wide table must really run past the slide, or this proves nothing: ${JSON.stringify(shared)}`);
  assert.equal(shared.forced, false, JSON.stringify(shared));
  assert.equal(shared.grid[0], true, 'the fitting two-column table keeps its grid');
});

test('REJUDGE: a forced slide made wide enough loses the mark, as a live resize does', async () => {
  const before = await page.evaluate(`(() => { const s = document.querySelectorAll('section[data-lattice-slide]')[0]; return s.querySelector(':scope > .cell-stage').style.getPropertyValue('--lat-reflow-force'); })()`);
  assert.equal(before.trim(), '1');
  const after = await page.evaluate(`(() => {
    const s = document.querySelectorAll('section[data-lattice-slide]')[0];
    for (const k of ['width', 'max-width', 'min-width']) s.style.setProperty(k, k === 'max-width' ? 'none' : '3000px', 'important');
    if (!(s.getBoundingClientRect().width > 2000)) return 'not widened';
    (${FORCE_OVERFLOWING_REFLOW_SRC})(document, new Set([s]));
    return s.querySelector(':scope > .cell-stage').style.getPropertyValue('--lat-reflow-force');
  })()`);
  assert.equal(after.trim(), '', 'a slide whose grid now fits is judged afresh and unmarked');
});
