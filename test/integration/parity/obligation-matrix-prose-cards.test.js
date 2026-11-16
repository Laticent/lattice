/**
 * Integration: an `obligation-matrix asymmetric` split into cards at the square phone step wraps its prose values
 * inside the slide (obligation-matrix.styles.css `.lat-split-cards .ct-card-fields`; owner, 2026-11-16;
 * fit-everywhere-model.md §25).
 *
 * The card pages lay each field out on one grid, `max-content` for the label and, before, `max-content` for the value,
 * so the status discs of a heat matrix line up in one column. An asymmetric matrix's values are prose, and a
 * `max-content` track never wraps: each value ran 150 to 250px past the slide (legal.gallery.md 20). The value track
 * is `minmax(0, 1fr)` now; the label track is unchanged, so a disc still starts where it did. Case, on the real CLI
 * export at square:
 *   PROSE  the export clips nothing, and every value ends inside the slide
 *
 * FALSIFIABLE: with the `max-content` value track the values run past the slide and the export prints OVERFLOW.
 * Needs Chromium (CHROME_PATH).
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const puppeteer = require('puppeteer');
const { resolveChrome } = require('../../../tools/lib/resolve-chrome');

const ROOT = path.join(__dirname, '..', '..', '..');
const DECK = `---
marp: true
theme: indaco
size: square
---

<!-- _class: obligation-matrix asymmetric -->

## Three regimes, three obligations, room to breathe.

| Regulation | Notice | Consent | DSAR |
| --- | --- | --- | --- |
| GDPR | Pre-collection; layered with purposes and legal basis | Opt-in; explicit for special-category data | 30-day response; identity verification required |
| CCPA/CPRA | At or before collection; "Notice at Collection" required | Opt-out default for sale/sharing; opt-in for under-16 minors | 45-day response; two free requests per consumer per year |
| LGPD | Pre-collection; controller identity disclosed | Opt-in for most processing; multiple legal bases recognized | 15-day response; appeal route to the ANPD |

Pick when each cell carries a sentence, not a glyph.
`;

let dir;
let log;
let spill;
before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'om-prose-'));
  const md = path.join(dir, 'deck.md');
  fs.writeFileSync(md, DECK);
  const pdf = path.join(dir, 'deck.pdf');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), md, pdf, '--keep-html'], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
  if (r.status !== 0) throw new Error(`export failed: ${r.stderr}`);
  log = `${r.stdout}${r.stderr}`;
  const browser = await puppeteer.launch({ executablePath: resolveChrome?.() || process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1080 });
    await page.goto(`file://${pdf.replace(/\.pdf$/, '.html')}`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    spill = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('section.lat-split-cards')];
      if (!cards.length) return null;
      return Math.max(...cards.flatMap((s) => { const r = s.getBoundingClientRect().right; return [...s.querySelectorAll('dd')].map((d) => d.getBoundingClientRect().right - r); }));
    });
  } finally {
    await browser.close();
  }
});
after(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

test('PROSE: the card pages wrap every value inside the slide, and nothing clips', () => {
  assert.notEqual(spill, null, 'the matrix splits into cards at square, or this proves nothing');
  assert.ok(spill <= 0.5, `a value runs ${Math.round(spill)}px past the slide`);
  assert.doesNotMatch(log, /OVERFLOW/, log);
});
