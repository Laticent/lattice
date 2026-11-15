/**
 * Integration: MEASURED LOGO-WALL COLUMNS on the real CLI export (owner, 2026-11-15;
 * engineering/decisions/2026-10-28-fit-everywhere-model.md §25).
 *
 * The CLI stamps a wall from the string with estimates (lib/core/logo-wall-pack.js `stampWall`), then
 * measures every captioned wall the page drew (`measureWall`) and re-plans only one that overflowed
 * (`restampWall`). Cases, on one square deck at the phone default:
 *   FITS       a captioned wall whose captions fit keeps the string stamp exactly (the default gaps)
 *   GAP SPILL  four marks, one inside pill ("Enterprise") wider than its cell but inside its half of the
 *              column gap, touching nothing: not an overflow, so it keeps the string stamp too
 *   OVERFLOWS  eight marks with long pills: re-planned to three columns at the measured spacing, every
 *              caption inside its cell and every row on the page, and the export reports no clipped slide
 *
 * FALSIFIABLE: without the CLI's measure-and-restamp step the long wall keeps four columns, its pills run
 * past their cells and the export prints OVERFLOW; with every wall re-planned, FITS reads the measured
 * spacing instead of the default; with a caption judged against its own cell instead of its share of the
 * gap, GAP SPILL is re-planned to two a row.
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
const { measureWall, SP_2XL, SP_XL } = require('../../../lib/core/logo-wall-pack');
const { canvasScaleFor } = require('../../../lib/adaptive/families');

const ROOT = path.join(__dirname, '..', '..', '..');
const MARKS = ['acme', 'globex', 'vantage', 'umbra', 'meridian', 'helios', 'northwind', 'cobalt'];
const wall = (n, pill) => MARKS.slice(0, n).map((m, i) => `- ![${m}](sample:logo-${m}.svg)\n  - ${m}\n  - \`{${typeof pill === 'function' ? pill(i) : pill}}\``).join('\n');
const DECK = `---
marp: true
theme: indaco
size: square
---

<!-- _class: logo-wall -->

## Four short captions.

${wall(4, 'A')}

---

<!-- _class: logo-wall -->

## One wide pill inside.

${wall(4, (i) => (i === 1 ? 'Enterprise' : 'A'))}

---

<!-- _class: logo-wall -->

## Eight long pills.

${wall(8, 'Enterprise')}
`;

let dir;
let log;
let browser;
let page;
before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logo-measured-'));
  const md = path.join(dir, 'deck.md');
  fs.writeFileSync(md, DECK);
  const pdf = path.join(dir, 'deck.pdf');
  try {
    log = execFileSync(process.execPath, [path.join(ROOT, 'lattice.js'), md, pdf, '--keep-html'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 240000 });
  } catch (e) {
    throw new Error(`export failed: ${e.stderr || e.message}`);
  }
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

const walls = () => page.evaluate(`(() => { const measure = ${measureWall.toString()}; return [...document.querySelectorAll('section.logo-wall')].map((s) => { const ul = s.querySelector(':scope > .cell-stage > ul'); const gx = /--logo-gx:([\\d.]+)/.exec(ul.getAttribute('style') || ''); return { mode: ul.getAttribute('data-logo-wall'), gx: gx ? Number(gx[1]) : null, rows: new Set([...ul.children].map((li) => Math.round(li.getBoundingClientRect().top))).size, m: measure(ul) }; }); })()`);

test('FITS: a captioned wall whose captions fit keeps the string stamp (the default gaps)', async () => {
  const [short] = await walls();
  assert.equal(short.mode, 'packed');
  assert.equal(short.gx, Math.floor(canvasScaleFor(1) * SP_2XL * 1e5) / 1e5, 'the estimate plan, untouched');
  assert.equal(short.m.over, false);
});

test('GAP SPILL: an inside pill that spills into its half of the gap is not an overflow', async () => {
  const [, spill] = await walls();
  assert.equal(spill.gx, Math.floor(canvasScaleFor(1) * SP_2XL * 1e5) / 1e5, 'the estimate plan, untouched');
  assert.equal(spill.rows, 1, 'four a row, as stamped');
  assert.equal(spill.m.over, false);
});

test('OVERFLOWS: the long wall is re-planned to fit, and the export reports no clipped slide', async () => {
  const [, , long] = await walls();
  assert.equal(long.mode, 'packed');
  assert.equal(long.gx, Math.floor(canvasScaleFor(1) * SP_XL * 1e5) / 1e5, 'the measured spacing');
  assert.equal(long.rows, 3, 'eight marks at three a row');
  assert.equal(long.m.over, false, `still overflows: ${JSON.stringify(long.m)}`);
  assert.doesNotMatch(String(log), /OVERFLOW/);
});
