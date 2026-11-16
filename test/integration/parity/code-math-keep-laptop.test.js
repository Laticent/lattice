/**
 * Integration: a code slide on a square deck at the phone default renders at laptop size and fits
 * (lib/core/resolve-venue.js `laptopKeepingToken`, the `keeps-laptop` marker; owner, 2026-11-16; fit-everywhere-model.md §25).
 *
 * At the x1.4 phone step the code block of examples/key-insight-gap-spacing.md slide 4 wrapped nearly every line
 * ("const beats =" / "trailingBeats(section); //" / "blockquote") and the slide clipped. Cases, on the real
 * CLI export of one square deck:
 *   KEEPS     the code slide's code is the same size as the same slide's at `venue: laptop`, and the export
 *             reports no clip
 *   NEIGHBOR  a prose slide in the same deck keeps the phone step: its body is x1.4 the laptop body
 *   WRAPS     a portrait code slide with a 51-character line still wraps it, as on main, and clips nothing
 *
 * FALSIFIABLE: without the marker the code is x1.4 the laptop code and the export prints OVERFLOW; with
 * `venue-laptop` stamped instead (the first cut), the portrait line stops wrapping and the export reports a clip.
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
const deck = (venue) => `---
marp: true
theme: indaco
size: square
${venue ? `venue: ${venue}\n` : ''}---

<!-- _class: code -->

## A filled panel needs more air beneath a filled panel than prose does.

\`\`\`js
// The kernel runs FIRST, on the authored body.
function harvest(section) {
  const beats = trailingBeats(section);   // blockquote, then note
  if (!beats.length) return section;      // nothing to host
  return wrap(beats, 'cell-coda');        // one cell, docked by structure
}
\`\`\`

> Key insight: running first is what saves the layouts that used to delete the node.

---

## A plain slide.

Some words on a plain slide.
`;

const PORTRAIT = `---
marp: true
theme: indaco
size: portrait
---

<!-- _class: code -->

## One long line.

\`\`\`js
const result = await fetchAll(config, opts, retry);
\`\`\`
`;

let dir;
let browser;
const measured = {};
before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-keep-laptop-'));
  browser = await puppeteer.launch({ executablePath: resolveChrome?.() || process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  for (const [name, venue] of [['phone', ''], ['laptop', 'laptop']]) {
    const md = path.join(dir, `${name}.md`);
    fs.writeFileSync(md, deck(venue));
    const out = path.join(dir, `${name}.html`);
    const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), md, out], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
    if (r.status !== 0) throw new Error(`export failed: ${r.stderr}`);
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1080 });
    await page.goto(`file://${out}`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    measured[name] = {
      log: `${r.stdout}${r.stderr}`,
      ...(await page.evaluate(() => ({
        code: Number.parseFloat(getComputedStyle(document.querySelector('section.code pre code')).fontSize),
        prose: Number.parseFloat(getComputedStyle(document.querySelector('section:not(.code) .cell-stage p, section:not(.code) > p')).fontSize),
      }))),
    };
    await page.close();
  }
  const pmd = path.join(dir, 'portrait.md');
  fs.writeFileSync(pmd, PORTRAIT);
  const pout = path.join(dir, 'portrait.html');
  const pr = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), pmd, pout], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
  if (pr.status !== 0) throw new Error(`export failed: ${pr.stderr}`);
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1350 });
  await page.goto(`file://${pout}`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  measured.portrait = {
    log: `${pr.stdout}${pr.stderr}`,
    ...(await page.evaluate(() => {
      const pre = document.querySelector('section.code pre');
      return { ws: getComputedStyle(pre.querySelector('code')).whiteSpace, spill: pre.scrollWidth - pre.clientWidth, marked: pre.closest('section').classList.contains('keeps-laptop') };
    })),
  };
  await page.close();
});
after(async () => {
  await browser?.close();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

test('KEEPS: the code slide renders its code at laptop size, and the export reports no clip', () => {
  assert.ok(Math.abs(measured.phone.code - measured.laptop.code) < 0.1, `phone code ${measured.phone.code}px, laptop ${measured.laptop.code}px`);
  assert.doesNotMatch(measured.phone.log, /OVERFLOW/, measured.phone.log);
});

test('NEIGHBOR: a prose slide in the same deck keeps the phone step', () => {
  assert.ok(Math.abs(measured.phone.prose / measured.laptop.prose - 1.4) < 0.02, `phone prose ${measured.phone.prose}px, laptop ${measured.laptop.prose}px`);
});

test('WRAPS: a portrait code slide still wraps its long line, as on main, and clips nothing', () => {
  const p = measured.portrait;
  assert.match(p.ws, /pre-wrap|break-spaces/, `the code is ${p.ws}`);
  assert.ok(p.spill <= 0, `the code runs ${p.spill}px past its panel`);
  assert.doesNotMatch(p.log, /OVERFLOW|CONTENT CLIPPED/i, p.log);
  assert.ok(p.marked, 'the slide carries the keeps-laptop marker');
});
