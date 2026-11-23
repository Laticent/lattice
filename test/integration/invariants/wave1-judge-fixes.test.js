/**
 * Integration: the two engine fixes the deck-presets Wave 1 judges asked for, measured on a REAL render.
 *
 * 1. A FLOWCHART'S NODES ARE ONE FAMILY. The sankey/treemap position cycle (`g.nodes > g.node:nth-of-type(N)`,
 *    lib/plugins/mermaid/mermaid.styles.css) used to reach flowchart nodes too, so a five-step process drew five
 *    category colors. A flowchart node now paints one accent tint, outlined in `--accent`, inked `--text-heading`.
 *    Only a render can check it: the fill is a `color-mix()` the cascade resolves onto mmdc's inline SVG.
 * 2. A SPLIT PANEL'S MASTHEAD IS CENTERED, AND GROWS. It used to sit on the panel's floor, its last line on the
 *    footer band. It now centers between the chrome bands (`justify-content: safe center`), and a masthead that fills
 *    the panel starts at the top band and grows down through the field instead of overflowing. Both are geometry.
 *
 * Measured in a real browser against the exported HTML, the artifact a reader opens.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const EMULATOR = path.join(ROOT, 'lattice.js');
const TIMEOUT = 240000;
const F = '```';

const FLOW = `${F}mermaid
flowchart LR
  A[Quote request] --> B[Lane cost model]
  B --> C{Above floor?}
  C -->|yes| D[Send to customer]
  C -->|no| E[Pricing review]
${F}`;

// The roomy panel: the Wave 1 corpus slide the judges docked.
const ROOMY = '`Why it moved`\n\n## Pricing discipline did more than volume.\n\nThree changes account for most of the 4.4-point gain.\n\n- Lane-level pricing\n  - Every quote carries the lane\'s true cost.\n- Fewer empty miles\n  - Backhaul matching cut empty miles from 21% to 13%.';
// The full panel: examples/one-page-number.md p4, which fills its panel to the last line.
const FULL = '`This slide is a sovereign frame`\n\n## The cost was paid in rules that looked right and did nothing.\n\nNo selector over a section\'s children can reach a pseudo. So a rule could name the page number, be committed, be current, and never paint.\n\n- The split cover carried three arms for one mark\n  - The footer-cell element, a bare element, and the pseudo.\n- Suppression did not survive the theme packer\n  - The packer strips generated content from a slide-own pseudo rule.';

const DECK = `---
marp: true
theme: cuoio
paginate: true
header: "Lattice · one page number"
footer: "The mark in the bottom-right corner is the same mark on every page of the deck"
---

<!-- _class: diagram -->

## Light flowchart

${FLOW}

---

<!-- _class: diagram dark -->

## Dark flowchart

${FLOW}

---

<!-- _class: split-panel -->

${ROOMY}

---

<!-- _class: split-panel -->

${FULL}
`;

describe('Wave 1 judge fixes — rendered', () => {
  let dir;
  let html;
  let browser;
  let page;

  before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-wave1-fixes-'));
    const md = path.join(dir, 'deck.md');
    fs.writeFileSync(md, DECK);
    const r = spawnSync(process.execPath, [EMULATOR, md, path.join(dir, 'deck.pdf'), 'cuoio', '--quiet', '--keep-html'], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
    });
    assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
    html = path.join(dir, 'deck.html');
    assert.ok(fs.existsSync(html), 'expected an HTML sidecar to measure');
    const puppeteer = require('puppeteer');
    browser = await puppeteer.launch({
      executablePath: process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(`file://${html}`, { waitUntil: 'networkidle0' });
    await page.evaluate(async () => { try { await document.fonts.ready; } catch { /* no Font Loading API */ } });
  }, { timeout: TIMEOUT });

  after(async () => {
    if (browser) await browser.close();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  });

  const flowchart = (n) => page.evaluate((n) => {
    const sec = document.querySelectorAll('section')[n - 1];
    const svg = sec?.querySelector('svg[aria-roledescription="flowchart-v2"]');
    if (!svg) return null;
    const shapes = [...svg.querySelectorAll('g.nodes > g.node :is(rect, polygon, path).label-container')];
    const probe = document.createElement('span');
    probe.style.color = 'var(--accent)';
    sec.appendChild(probe);
    const accent = getComputedStyle(probe).color;
    probe.remove();
    // Through a canvas pixel, not a regex: the fill is a `color-mix()`, which computes to `oklab(…)`, and reading
    // its first three numbers as RGB scored a dark-on-pale label at 1.21:1.
    const ctx = document.createElement('canvas').getContext('2d');
    const rgb = (c) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3); };
    const lum = (c) => {
      const v = rgb(c).map((x) => { const s = x / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
      return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    };
    const fill = shapes.length ? getComputedStyle(shapes[0]).fill : '';
    const label = svg.querySelector('g.nodes .nodeLabel');
    const ink = label ? getComputedStyle(label).color : '';
    const [a, b] = [lum(fill), lum(ink)];
    return {
      count: shapes.length,
      fills: [...new Set(shapes.map((s) => getComputedStyle(s).fill))],
      strokes: [...new Set(shapes.map((s) => getComputedStyle(s).stroke))],
      accent,
      inkRatio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
    };
  }, n);

  for (const [n, mode] of [[1, 'light'], [2, 'dark']]) {
    test(`${mode}: every flowchart node shares one fill, outlined in the accent, with AA labels`, async () => {
      const m = await flowchart(n);
      assert.ok(m, `slide ${n} has no flowchart`);
      assert.equal(m.count, 5, `expected five node shapes, got ${m.count}`);
      assert.equal(m.fills.length, 1, `node fills should be one family, got ${m.fills.join(' | ')}`);
      assert.deepEqual(m.strokes, [m.accent], 'every node is outlined in --accent');
      assert.ok(m.inkRatio >= 4.5, `node label ink reads ${m.inkRatio.toFixed(2)}:1 on its fill`);
    });
  }

  const panel = (n) => page.evaluate((n) => {
    const sec = document.querySelectorAll('section')[n - 1];
    const left = sec.querySelector(':scope > .panel-left');
    const cs = getComputedStyle(left);
    const L = left.getBoundingClientRect();
    // The field the masthead centers in: the panel's content box, between the chrome bands.
    const top = L.top + parseFloat(cs.paddingTop);
    const bottom = L.bottom - parseFloat(cs.paddingBottom);
    const texts = [...left.querySelectorAll(':scope > :is(h2, p, .panel-eyebrow)')].filter((e) => e.textContent.trim());
    const first = texts[0].getBoundingClientRect();
    const last = texts.at(-1).getBoundingClientRect();
    const header = sec.querySelector(':scope > header').getBoundingClientRect();
    const footer = sec.querySelector(':scope > footer').getBoundingClientRect();
    return {
      above: first.top - top,
      below: bottom - last.bottom,
      headerClear: first.top - header.bottom,
      footerClear: footer.top - last.bottom,
      overflowPx: left.scrollHeight - left.clientHeight,
    };
  }, n);

  test('a roomy panel centers its masthead between the chrome bands', async () => {
    const m = await panel(3);
    assert.ok(m.above > 8 && m.below > 8, `the masthead should float clear of both bands (above ${m.above.toFixed(1)}px, below ${m.below.toFixed(1)}px)`);
    assert.ok(Math.abs(m.above - m.below) < 1.5, `centered: ${m.above.toFixed(1)}px above vs ${m.below.toFixed(1)}px below`);
    // Against the chrome itself the two clearances differ by a few px, and that is line spacing, not offset: the
    // lede's looser leading puts its line box below its letters (measured 2026-11-23 by text ranges: 91.4px header
    // to masthead, 88.5px masthead to footer). So the chrome check is a floor, the centering check above is exact.
    assert.ok(m.footerClear > 60 && m.headerClear > 60, `the masthead floats clear of both bands' chrome (header ${m.headerClear.toFixed(1)}px, footer ${m.footerClear.toFixed(1)}px)`);
  });

  test('a full panel grows from the top band and fills the field without overflowing', async () => {
    const m = await panel(4);
    assert.ok(Math.abs(m.above) < 1.5, `a full masthead starts at the top band, got ${m.above.toFixed(1)}px below it`);
    assert.ok(m.overflowPx <= 0, `the full panel overflows by ${m.overflowPx}px`);
  });
});
