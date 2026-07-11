#!/usr/bin/env node
/**
 * check-svg-scaling — the 4K fidelity gate (#180).
 *
 * Catches the one thing page-count and 72dpi pixel checks cannot: a chart that
 * is correctly PLACED but no longer SCALES — pinned by a fixed-px size while the
 * cqi-driven type and slide around it grow. (The radar/quadrant `max-height:
 * 360px` caps were exactly this; lifting them to `50cqh` made them scale.)
 *
 * How: render a fixture deck at HD (1280) and 4K (3840) — Lattice renders the
 * slide DOM NATIVELY at each size, so cqi tracks real pixels — then measure each
 * chart SVG's rendered box in a real browser. A responsive chart's 4K box is ~3×
 * its HD box (the 3840/1280 slide ratio); a px-capped chart stays the same size,
 * failing the ratio assertion.
 *
 * Usage:
 *   node tools/check-svg-scaling.js [fixture.md]
 * Exit 0 = every measured chart scales; 1 = a chart didn't; 2 = harness error.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
const FIXTURE = process.argv[2] || path.join(ROOT, 'test', 'fixtures', 'responsive-charts.md');

// Selectors measured + the size names (front-matter `size:`) and their widths.
const SELECTORS = ['.radar-svg', '.quadrant-svg', '.wc-svg'];
const SMALL = { name: 'hd', w: 1280 };
const LARGE = { name: '4K', w: 3840 };
const EXPECT = LARGE.w / SMALL.w;          // 3 — the HD→4K slide ratio
const TOLERANCE = 0.08;                    // ±8% (sub-pixel rounding, font metrics)

function renderHtml(sizeName) {
  const body = fs.readFileSync(FIXTURE, 'utf8');
  const base = path.join(os.tmpdir(), `svgscale-${sizeName}-${process.pid}`);
  const md = `${base}.md`;
  const pdf = `${base}.pdf`;
  // `form: off` — this gate measures a chart's intrinsic HD→4K scaling in
  // isolation. Form is on by default deck-wide (2026-06-26), but it composes a
  // masthead band around the chart that is irrelevant to (and would perturb) the
  // scale-ratio measurement. Keep the fixture chrome-free so it tests the SVG, not Form.
  fs.writeFileSync(md, `---\nmarp: true\ntheme: indaco\nsize: ${sizeName}\nform: off\n---\n\n${body}`);
  execFileSync(process.execPath, [EMULATOR, md, pdf, 'indaco', '-q'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
  });
  return pdf.replace(/\.pdf$/, '.html'); // the emulator drops the HTML sidecar here
}

async function main() {
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch {
    console.error('check-svg-scaling: puppeteer not resolvable — skipping (harness gap).');
    process.exit(2);
  }

  const smallHtml = renderHtml(SMALL.name);
  const largeHtml = renderHtml(LARGE.name);

  const execPath = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || null;
  const browser = await puppeteer.launch(
    execPath
      ? { executablePath: execPath, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
      : { args: ['--no-sandbox', '--disable-setuid-sandbox'] },
  );

  async function measure(htmlPath) {
    const page = await browser.newPage();
    await page.goto('file://' + htmlPath, { waitUntil: 'networkidle0' });
    const dims = await page.evaluate((sels) => {
      const out = {};
      for (const s of sels) {
        const el = document.querySelector(s);
        out[s] = el ? { h: el.getBoundingClientRect().height } : null;
      }
      return out;
    }, SELECTORS);
    await page.close();
    return dims;
  }

  let small, large;
  try {
    small = await measure(smallHtml);
    large = await measure(largeHtml);
  } finally {
    await browser.close();
  }

  let failed = false;
  for (const sel of SELECTORS) {
    if (!small[sel] || !large[sel] || small[sel].h < 1) {
      console.error(`✗ ${sel}: not found / zero-height in the fixture render`);
      failed = true;
      continue;
    }
    const ratio = large[sel].h / small[sel].h;
    const ok = Math.abs(ratio - EXPECT) / EXPECT <= TOLERANCE;
    console.log(
      `${ok ? '✓' : '✗'} ${sel}: HD ${small[sel].h.toFixed(0)}px → 4K ${large[sel].h.toFixed(0)}px ` +
      `(scaled ${ratio.toFixed(2)}×, expect ${EXPECT}× ±${TOLERANCE * 100}%)`,
    );
    if (!ok) failed = true;
  }

  if (failed) {
    console.error('\ncheck-svg-scaling FAILED — a chart did not scale with the slide (fixed-px cap?). See #180.');
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
