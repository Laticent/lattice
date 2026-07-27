#!/usr/bin/env node
/**
 * check-chart-fit — does the chart actually FIT the stage it was given?
 *
 * THE GAP THIS CLOSES. Every other chart gate asks whether a chart is correct in
 * isolation: `check-svg-scaling` asks whether it SCALES, `check-chart-responsiveness`
 * whether its CSS uses relative units, `check-viz-render` whether its paint
 * survives the scoped path. None of them asks the question that has now broken
 * twice in one branch — whether the rendered thing fits inside `.cell-stage`,
 * which is `overflow: clip`, so the answer to "no" is silent: the chart looks
 * fine and its top row is simply gone.
 *
 * Both breakages were in radar's small-multiples and both were invisible to the
 * suite. A flex row let the LAST row's minis stretch to fill a four-wide track,
 * dragging their height with them (607.8px into a 449.1px stage, 115.8px of
 * chart clipped). Before that, a two-line caption band on every mini pushed a
 * six-series deck 22.7px over. A 36-case sweep also found the BASELINE tree
 * clipping 12 cases, so this is not only a guard against my own changes.
 *
 * WHAT IT DOES. Renders a fixture deck through `lattice-emulator.js` (the export
 * surface), loads the HTML sidecar in headless Chromium, and for every slide
 * compares each chart's painted extent against its stage cell's box. Anything
 * outside is a clip. It measures the MARKS, not the container: a container can
 * sit inside the stage while its overflowing children are cut.
 *
 * Usage:
 *   node tools/check-chart-fit.js [fixture.md]      # gate: exit 1 on a clip
 *   node tools/check-chart-fit.js --report          # per-slide numbers
 *
 * Needs a Chromium (CHROME_PATH or the puppeteer cache). With none it SKIPS
 * loudly and exits 0 — never a false green (HARD RULE #23). On-demand, like its
 * siblings: it costs an emulator render, so it is not in the browser-free
 * `build:check`.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
const FIXTURE = process.argv.find((a) => a.endsWith('.md'))
  || path.join(ROOT, 'test', 'fixtures', 'chart-fit.md');

// A pixel of slack. Sub-pixel layout rounding routinely puts a box a few
// hundredths outside its parent with nothing visibly cut; anything past this is
// a real clip (the observed failures were 22.7px and 115.8px).
const SLACK = 1.5;

/** Best-effort Chromium — mirrors tools/check-viz-render.js + check-svg-scaling.js. */
function resolveChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  for (const root of [path.join(os.homedir(), '.cache', 'puppeteer', 'chrome'), '/root/.cache/puppeteer/chrome']) {
    if (!fs.existsSync(root)) continue;
    for (const build of fs.readdirSync(root).filter((d) => d.startsWith('linux-')).sort().reverse()) {
      const bin = path.join(root, build, 'chrome-linux64', 'chrome');
      if (fs.existsSync(bin)) return bin;
    }
  }
  return undefined;
}

async function main() {
  const report = process.argv.includes('--report');
  const chrome = resolveChrome();
  if (!chrome) {
    console.error('check-chart-fit: no Chromium (set CHROME_PATH) — SKIPPED, nothing verified.');
    process.exit(0);
  }
  if (!fs.existsSync(FIXTURE)) {
    console.error(`check-chart-fit: fixture not found: ${FIXTURE}`);
    process.exit(2);
  }

  const base = path.join(os.tmpdir(), `chart-fit-${process.pid}`);
  const pdf = `${base}.pdf`;
  const html = `${base}.html`;
  const puppeteer = require('puppeteer');
  let browser;
  try {
    execFileSync(process.execPath, [EMULATOR, FIXTURE, pdf, 'indaco', '-q'], {
      cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], timeout: 10 * 60_000,
    });
    if (!fs.existsSync(html)) throw new Error('emulator produced no HTML sidecar');

    browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(`file://${html}`, { waitUntil: 'networkidle0', timeout: 120_000 });

    const rows = await page.evaluate((slack) => {
      const out = [];
      for (const sec of document.querySelectorAll('section[data-class]')) {
        const stage = sec.querySelector('.cell-stage');
        if (!stage) continue;
        // The painted marks, not their container: a container can sit inside the
        // stage while the children overflowing IT are the ones cut.
        const marks = [...stage.querySelectorAll('svg, .chart-body > *, [data-mark]')]
          .filter((el) => el.getClientRects().length > 0);
        if (!marks.length) continue;
        const sr = stage.getBoundingClientRect();
        let top = Infinity; let bottom = -Infinity; let left = Infinity; let right = -Infinity;
        for (const el of marks) {
          const r = el.getBoundingClientRect();
          top = Math.min(top, r.top); bottom = Math.max(bottom, r.bottom);
          left = Math.min(left, r.left); right = Math.max(right, r.right);
        }
        out.push({
          slide: +sec.id || out.length + 1,
          component: sec.dataset.class.trim().split(/\s+/)[0],
          overTop: +(sr.top - top).toFixed(1),
          overBottom: +(bottom - sr.bottom).toFixed(1),
          overLeft: +(sr.left - left).toFixed(1),
          overRight: +(right - sr.right).toFixed(1),
          clipped: (sr.top - top) > slack || (bottom - sr.bottom) > slack
            || (sr.left - left) > slack || (right - sr.right) > slack,
        });
      }
      return out;
    }, SLACK);

    if (report) {
      for (const r of rows) {
        console.log(
          `slide ${String(r.slide).padStart(2)} ${r.component.padEnd(16)} ` +
          `over[T ${r.overTop} B ${r.overBottom} L ${r.overLeft} R ${r.overRight}] ` +
          `${r.clipped ? 'CLIPPED' : 'fits'}`,
        );
      }
    }

    const bad = rows.filter((r) => r.clipped);
    if (bad.length) {
      console.error(`\ncheck-chart-fit: ${bad.length} chart(s) overflow the stage clip:\n`);
      for (const r of bad) {
        const worst = [
          ['top', r.overTop], ['bottom', r.overBottom], ['left', r.overLeft], ['right', r.overRight],
        ].filter(([, v]) => v > SLACK).map(([k, v]) => `${k} +${v}px`).join(', ');
        console.error(
          `  ✗ slide ${r.slide} (${r.component}): painted outside .cell-stage — ${worst}. ` +
          'The stage is `overflow: clip`, so this is CUT, silently.',
        );
      }
      console.error('');
      process.exit(1);
    }
    console.log(`check-chart-fit: ${rows.length} chart slide(s) — every chart fits its stage.`);
  } finally {
    if (browser) await browser.close();
    for (const f of [pdf, html]) { try { fs.unlinkSync(f); } catch { /* best effort */ } }
  }
}

if (require.main === module) {
  main().catch((err) => { console.error(`check-chart-fit: ${err?.stack || err}`); process.exit(2); });
}

module.exports = { SLACK, FIXTURE };
