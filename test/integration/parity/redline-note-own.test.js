/**
 * Integration: a `redline three-col` whose after page cannot hold the why list as well gives the list a page of its
 * own, on the real CLI export at square (lib/core/fit-measure.js `noteOwn`, lib/core/carousel.js `redlineBlockSplit`;
 * owner, 2026-11-16; fit-everywhere-model.md §25).
 *
 * redline.gallery.md slide 4: the after passage and its three-item why list ran 61px past the page at the x1.4
 * phone step. The strategy pages by its own seams (before, after) and reads no plan sizes, so the measured loop had no
 * room to tighten and gave the slide up. Case:
 *   NOTE  the export clips nothing; the run is cover, before, after, and a page carrying the list under the citation,
 *         whose citation reads at the size and style of the other pages (not the eyebrow's)
 *
 * FALSIFIABLE: without the loop's unplanned `noteOwn` retry, or without the strategy reading it, the export prints
 * OVERFLOW; without the citation rule the list page's citation reads larger and italic. Needs Chromium (CHROME_PATH).
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

<!-- _class: redline three-col -->

## three-col sets old, new, and why side by side.

\`Cal. Civ. Code §1798.135 · amendment SB-362 (2024)\`

> A business that collects consumers' personal information shall provide two or more designated methods for submitting requests to opt out of the sale of their personal information.

> A business that collects, sells, or shares consumers' personal information shall provide at least one designated method for submitting requests to opt-out, including a clear and conspicuous homepage link titled "Your Privacy Choices."

- **Scope.** Sale and sharing fold into one duty.
- **Method floor.** One method now suffices.
- **Link title.** Homepage label is mandatory and standardized.
`;

let dir;
let log;
let pages;
before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'redline-note-'));
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
    pages = await page.evaluate(() => [...document.querySelectorAll('section[data-lattice-slide]')].map((s) => {
      const code = s.querySelector('.cell-stage > p > code');
      const cs = code ? getComputedStyle(code) : null;
      return { role: s.getAttribute('data-split-role'), text: s.textContent.replace(/\s+/g, ' '), cite: cs ? `${cs.fontSize} ${cs.fontStyle}` : null };
    }));
  } finally {
    await browser.close();
  }
});
after(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

test('NOTE: the why list takes its own page; the citation reads alike on every page; nothing clips', () => {
  assert.doesNotMatch(log, /OVERFLOW/, log);
  const body = pages.filter((p) => p.role === 'body');
  assert.equal(body.length, 3, body.map((p) => p.text.slice(0, 60)).join(' | '));
  assert.match(body[1].text, /Your Privacy Choices/);
  assert.doesNotMatch(body[1].text, /Method floor/, 'the after page carries no list');
  assert.match(body[2].text, /Scope[\s\S]*Method floor[\s\S]*Link title/);
  assert.ok(body.every((p) => p.cite === body[0].cite), `the citation reads alike: ${body.map((p) => p.cite).join(' | ')}`);
});
