/**
 * Integration: an authority-chain `bracket` at the phone default on a square deck
 * (fit-everywhere-model.md §25), on the real export.
 *
 * At x1.4 a square slide has under 23em of text room, so the chain takes its narrow-room rules
 * (authority-chain.styles.css). There the citation chip kept `white-space: nowrap`, and beside a
 * `bracket` tier label a long citation ("Charter of Fundamental Rights, Art. 8") ran past its card and
 * was clipped. The rows also left the shared min-content rail for flex rows, so each label sized to
 * itself and the citations started at a different x on every row. Two cases:
 *   FITS      every citation chip ends inside its card, and the export reports no clipped slide
 *   ONE RAIL  on each page of the run, every row's text column starts at one x
 *
 * FALSIFIABLE: with the chip's `white-space: normal` removed, FITS fails (the chip's right edge passes
 * the card's, and the CLI prints OVERFLOW); with `:not(.bracket)` removed from the narrow-room flex
 * rules, ONE RAIL fails (TREATY and REGULATION start their text 70px apart).
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

const ROOT = path.join(__dirname, '..', '..', '..');
const DECK = `---
marp: true
theme: indaco
size: square
---

<!-- _class: authority-chain bracket -->

## bracket groups the tiers by actor.

1. Treaty
   - \`Charter of Fundamental Rights, Art. 8\`
   - EU primary law — protection of personal data is a fundamental right.
2. Regulation
   - \`GDPR (EU) 2016/679\`
   - Directly applicable across all member states; sets the Art. 83 fine tiers.
3. Guidance
   - \`EDPB Guidelines 04/2022\`
   - Harmonized methodology for calculating administrative fines.
4. Decision
   - \`DPC v. Meta · 2023\`
   - €1.2B fine — the largest GDPR penalty to date.
`;

let dir;
let html;
let log;
let browser;
let page;
before(async () => {
  // Its own folder, so a parallel run never reads another's export.
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ac-bracket-'));
  const md = path.join(dir, 'deck.md');
  fs.writeFileSync(md, DECK);
  const pdf = path.join(dir, 'deck.pdf');
  // `--keep-html`: the laid-out sidecar is what this test inspects. Both streams: the CLI reports OVERFLOW on stderr.
  try {
    log = execFileSync(process.execPath, [path.join(ROOT, 'lattice.js'), md, pdf, '--keep-html'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 240000 });
  } catch (e) {
    throw new Error(`export failed: ${e.stderr || e.message}`);
  }
  html = pdf.replace(/\.pdf$/, '.html');
  browser = await puppeteer.launch({ executablePath: resolveChrome?.() || process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1080 });
  await page.goto(`file://${html}`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
});
after(async () => {
  await browser?.close();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

// Every body page of the split run: its rows, each with its card's box, its chip's box and its text column's x.
const rowsByPage = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('section[data-lattice-slide]')]
      .map((s) => [...s.querySelectorAll('.cell-stage > :is(ol, ul) > li')].map((li) => {
        const card = li.getBoundingClientRect();
        const chip = li.querySelector(':scope > :is(ul, ol) > li:first-child > code');
        const body = li.querySelector(':scope > :is(ul, ol)');
        return { label: li.querySelector(':scope > strong')?.textContent.trim(), cardRight: card.right, chipRight: chip ? chip.getBoundingClientRect().right : null, bodyX: body ? body.getBoundingClientRect().left : null };
      }))
      .filter((rows) => rows.length));

test('FITS: every citation chip ends inside its card, and the export reports no clipped slide', async () => {
  const pages = await rowsByPage();
  assert.ok(pages.flat().length === 4, `expected the four tiers across the run, got ${JSON.stringify(pages)}`);
  for (const r of pages.flat()) assert.ok(r.chipRight !== null && r.chipRight <= r.cardRight + 0.5, `${r.label}: chip ends at ${r.chipRight}, card at ${r.cardRight}`);
  assert.doesNotMatch(String(log), /OVERFLOW/);
});

test('ONE RAIL: on each page every row\'s text column starts at one x', async () => {
  for (const rows of await rowsByPage()) {
    const xs = rows.map((r) => Math.round(r.bodyX));
    assert.ok(Math.max(...xs) - Math.min(...xs) <= 1, `text columns start at ${JSON.stringify(rows.map((r) => [r.label, Math.round(r.bodyX)]))}`);
  }
});
