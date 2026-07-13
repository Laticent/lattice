// Engine rendering benchmark — the owned lattice-engine, over time.
//
// Built on tinybench (the runner-agnostic benchmark framework that powers
// `vitest bench`): it handles warmup, sampling, and the statistics (mean, p99,
// relative margin of error) so we don't hand-roll timing. Both tiers drive the
// real lib/playground/index.js path the docs surfaces render through, against the
// SAME workloads.
//
// The jargon gallery (examples/gallery-jargon.md) is the baseline "normal"
// workload per the design brief; "stress" multiplies it to a large deck and
// "charts" exercises the chart bucket's runtime transform. This is a MEASUREMENT
// tool, not part of `npm test` (which must stay fast) — run on demand:
//
//   node test/benchmark/engine-bench.mjs            # render tiers
//   node test/benchmark/engine-bench.mjs --export   # + rasterize/export tier
//   node test/benchmark/engine-bench.mjs --json     # machine-readable dump
//   node test/benchmark/engine-bench.mjs --bless     # write the committed baseline
//   node test/benchmark/engine-bench.mjs --check     # compare vs baseline (variance-aware)
//
// The committed test/benchmark/baseline.json is the durable "before": its diff in
// a perf PR IS the permanent before→after record (HARD RULE #19). --check is
// variance-aware — it never fails inside the noise band, only on a real slowdown.
//
// Marp was retired in P4; the final engine-vs-marp comparison (the owned engine
// rendered 3–5× faster, dated) is recorded in
// engineering/decisions/2026-06-12-p4-regression-gate-retire-marp.md §A. This
// bench now tracks the engine's OWN speed over time — a perf-regression signal,
// not a vs-marp claim.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Bench } from 'tinybench';
import latticeEngine from '../../lib/engine/index.js';
import api from '../../lib/playground/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const wantExport = process.argv.includes('--export');
const asJson = process.argv.includes('--json');
const wantBless = process.argv.includes('--bless');
const wantCheck = process.argv.includes('--check');
const BASELINE = join(ROOT, 'test/benchmark/baseline.json');
const TOLERANCE_PCT = 12; // default variance band; effective band = max(this, baseline RME + current RME)

// Standalone engine for the HTML-only cost line.
const rawEngine = latticeEngine.createEngine();

const registered = new Set();
function registerTheme(palette) {
  for (const rel of ['dist/lattice.css', `themes/${palette}.css`]) {
    if (registered.has(rel) || !existsSync(join(ROOT, rel))) continue;
    const css = readFileSync(join(ROOT, rel), 'utf8');
    api.addThemes([css]);
    rawEngine.addThemes([css]);
    registered.add(rel);
  }
}

// ── datasets ──────────────────────────────────────────────────────────────────
const jargon = readFileSync(join(ROOT, 'examples/gallery-jargon.md'), 'utf8');

// Stress = the jargon body repeated to a large deck, keeping one front-matter
// block (split on the `---` slide separators, not the front matter).
function stressDeck(times) {
  const fmEnd = jargon.indexOf('\n---\n', jargon.indexOf('---') + 3);
  return jargon.slice(0, fmEnd) + Array.from({ length: times }, () => jargon.slice(fmEnd)).join('\n');
}

const datasets = [
  { name: 'normal (jargon)', src: jargon, theme: 'crepuscolo' },
  { name: 'charts', src: readFileSync(join(ROOT, 'lib/components/chart/chart.gallery.md'), 'utf8'), theme: 'indaco' },
  { name: 'stress (jargon x6)', src: stressDeck(6), theme: 'crepuscolo' },
];
for (const d of datasets) {
  registerTheme(d.theme);
  d.slides = (rawEngine.render(d.src, d.theme).html.match(/<\/section>/g) || []).length;
}

const mean = (task) => task.result.latency.mean; // ms

// ── render tier ───────────────────────────────────────────────────────────────
async function renderTier() {
  const main = new Bench({ name: 'render', warmup: true, time: 1500, iterations: 8 });
  for (const d of datasets) {
    // Clear the per-(theme,size) CSS memo before each timed render so this tier
    // measures the TRUE COLD per-render cost — what a CLI/export one-shot pays, and
    // what a compose regression would surface in. The cache is an INTERACTIVE
    // optimization (repeated renders of the same theme in the live preview); its win
    // is measured browser-side by `npm run perf:frame`, not here, where a warm loop
    // would otherwise report cache-hit speed and hide any cold-compose regression.
    main.add(d.name, () => {
      rawEngine.themes._cssCache.clear();
      return rawEngine.render(d.src, d.theme);
    });
  }
  await main.run();
  console.log('\n=== RENDER · full path (markdown → HTML+CSS) ===');
  console.table(main.table());

  // Interpreted summary: ms + slide throughput.
  console.log('\n=== SUMMARY ===');
  console.log(`${'dataset'.padEnd(20)}${'slides'.padStart(7)}${'ms'.padStart(10)}${'slides/s'.padStart(11)}`);
  const summary = [];
  for (const d of datasets) {
    const task = main.getTask(d.name);
    const l = mean(task);
    console.log(
      `${d.name.padEnd(20)}${String(d.slides).padStart(7)}${l.toFixed(1).padStart(10)}${String(Math.round((d.slides / l) * 1000)).padStart(11)}`,
    );
    summary.push({
      dataset: d.name,
      slides: d.slides,
      ms: l,
      slidesPerSec: Math.round((d.slides / l) * 1000),
      rmePct: task.result.latency.rme,
    });
  }
  return { main: main.table(), summary };
}

// ── export / rasterize tier (lazy puppeteer) ──────────────────────────────────
async function exportTier() {
  const { default: puppeteer } = await import('puppeteer');
  const { execSync } = await import('node:child_process');
  let chrome = process.env.CHROME_PATH;
  if (!chrome || !existsSync(chrome)) {
    try {
      chrome = execSync('ls /root/.cache/puppeteer/chrome/linux-*/chrome-linux64/chrome 2>/dev/null | head -1', { encoding: 'utf8' }).trim();
    } catch {
      /* default */
    }
  }
  const RUNTIME = readFileSync(join(ROOT, 'dist/lattice-runtime.js'), 'utf8');
  const SLIDE_BOX = '.lattice>section{width:1280px;height:720px}';
  const srcdoc = (html, css) =>
    `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0}${SLIDE_BOX}.lattice>section{display:block;transform:none;margin:0}${css}</style></head><body>${html}<script>${RUNTIME}</script></body></html>`;

  const browser = await puppeteer.launch({ executablePath: chrome || undefined, args: ['--no-sandbox'] });
  // One full export cycle = render → load → screenshot every slide (what the
  // Drawing Board's html-to-image PDF/PPTX export does, server-side).
  async function exportOnce(d) {
    const out = api.render(d.src, d.theme);
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.setContent(srcdoc(out.html, out.css), { waitUntil: 'networkidle0', timeout: 60000 }).catch(() => {});
    for (const sec of await page.$$('.lattice > section')) await sec.screenshot({ type: 'png' });
    await page.close();
  }
  // Heavy + IO-bound: a few samples is plenty, no warmup. Skip the 481-slide
  // stress deck here — thousands of screenshots would dominate runtime without
  // adding signal; render-tier already covers stress scaling.
  const bench = new Bench({ name: 'export', warmup: false, time: 1, iterations: 2 });
  for (const d of datasets.filter((x) => !x.name.startsWith('stress'))) {
    bench.add(d.name, () => exportOnce(d));
  }
  await bench.run();
  console.log('\n=== EXPORT / RASTERIZE · per-deck screenshot cycle ===');
  console.table(bench.table());
  await browser.close();
  return bench.table();
}

// ── print re-place tier (item 1 of 2026-06-14-deck-print-styling.md) ──────────
// The Print drawer's PDF is a rasterize → assemble split: a paper/orientation change
// re-ASSEMBLES cached slide images (cheap jsPDF geometry) instead of re-RASTERIZING
// them (expensive html-to-image / screenshot). This tier proves the win by timing
// both halves against the same deck:
//   · "print full (raster+assemble)"  — screenshot every slide, then assemble → what a
//     paper change USED to cost (rasterize + assemble on every flip).
//   · "print re-place (assemble)"      — assemble the SAME cached PNGs onto a fresh sheet
//     → what a paper change costs NOW (assemble only, no re-rasterize).
// jsPDF is a docs dependency (browser bundle), so it is resolved from docs/node_modules.
// The assemble mirrors assembleSheetPdf (docs/src/playground/drawing-board-export.js) —
// duplicated here (not imported) because that module's transitive imports are browser-only.
const PRINT_SAFE_PX = Math.round(9 * (96 / 25.4)); // 9mm @96dpi — matches the kernel
function assembleFromImages(jsPDF, images, geom, sheet) {
  const { pageW, pageH } = sheet;
  const availW = pageW - 2 * PRINT_SAFE_PX;
  const availH = pageH - 2 * PRINT_SAFE_PX;
  const scale = Math.min(Math.min(availW / geom.w, availH / geom.h), 1);
  const w = geom.w * scale;
  const h = geom.h * scale;
  const place = { x: (pageW - w) / 2, y: (pageH - h) / 2, w, h };
  const orientation = pageW >= pageH ? 'landscape' : 'portrait';
  const pdf = new jsPDF({ orientation, unit: 'px', format: [pageW, pageH], compress: true, hotfixes: ['px_scaling'] });
  for (let i = 0; i < images.length; i++) {
    if (i > 0) pdf.addPage([pageW, pageH], orientation);
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, pageW, pageH, 'F');
    pdf.addImage(images[i], 'PNG', place.x, place.y, place.w, place.h);
  }
  return pdf.output('arraybuffer');
}

async function printTier() {
  const { createRequire } = await import('node:module');
  const req = createRequire(join(ROOT, 'docs/package.json'));
  const { jsPDF } = req('jspdf');
  const { default: puppeteer } = await import('puppeteer');
  const { execSync } = await import('node:child_process');
  let chrome = process.env.CHROME_PATH;
  if (!chrome || !existsSync(chrome)) {
    try {
      chrome = execSync('ls /root/.cache/puppeteer/chrome/linux-*/chrome-linux64/chrome 2>/dev/null | head -1', { encoding: 'utf8' }).trim();
    } catch { /* default */ }
  }
  const RUNTIME = readFileSync(join(ROOT, 'dist/lattice-runtime.js'), 'utf8');
  const SLIDE_BOX = '.lattice>section{width:1280px;height:720px}';
  const srcdoc = (html, css) =>
    `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0}${SLIDE_BOX}.lattice>section{display:block;transform:none;margin:0}${css}</style></head><body>${html}<script>${RUNTIME}</script></body></html>`;
  const GEOM = { w: 1280, h: 720 };
  // 16:9 → US Legal landscape (the auto pick); a re-place flip retargets US Letter landscape.
  const LEGAL = { pageW: 1344, pageH: 816 };
  const LETTER = { pageW: 1056, pageH: 816 };

  const browser = await puppeteer.launch({ executablePath: chrome || undefined, args: ['--no-sandbox'] });
  // Rasterize every slide of a deck to a PNG buffer (the expensive, cacheable half).
  async function rasterize(d) {
    const out = api.render(d.src, d.theme);
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.setContent(srcdoc(out.html, out.css), { waitUntil: 'networkidle0', timeout: 60000 }).catch(() => {});
    const images = [];
    for (const sec of await page.$$('.lattice > section')) images.push(await sec.screenshot({ type: 'png' }));
    await page.close();
    return images;
  }

  const decks = datasets.filter((x) => !x.name.startsWith('stress'));
  // Pre-rasterize each deck ONCE — the cached images a re-place reuses. (Setup, not timed.)
  const cached = new Map();
  for (const d of decks) cached.set(d.name, await rasterize(d));

  const bench = new Bench({ name: 'print', warmup: false, time: 1, iterations: 3 });
  for (const d of decks) {
    // Full: rasterize + assemble (the old per-flip cost).
    bench.add(`print full (raster+assemble) · ${d.name}`, async () => {
      const images = await rasterize(d);
      assembleFromImages(jsPDF, images, GEOM, LEGAL);
    });
    // Re-place: assemble cached images onto a DIFFERENT sheet — no re-rasterize (the new cost).
    bench.add(`print re-place (assemble) · ${d.name}`, () => {
      assembleFromImages(jsPDF, cached.get(d.name), GEOM, LETTER);
    });
  }
  await bench.run();
  console.log('\n=== PRINT · paper-change: full rebuild vs cached-image re-place ===');
  console.table(bench.table());
  await browser.close();

  const summary = [];
  console.log('\n=== PRINT SUMMARY (re-place should be a fraction of full) ===');
  for (const d of decks) {
    const full = mean(bench.getTask(`print full (raster+assemble) · ${d.name}`));
    const replace = mean(bench.getTask(`print re-place (assemble) · ${d.name}`));
    console.log(`${d.name.padEnd(20)} full ${full.toFixed(1)}ms  re-place ${replace.toFixed(1)}ms  (${Math.round((replace / full) * 100)}% of full)`);
    summary.push({ dataset: `print full · ${d.name}`, slides: cached.get(d.name).length, ms: full, rmePct: bench.getTask(`print full (raster+assemble) · ${d.name}`).result.latency.rme });
    summary.push({ dataset: `print re-place · ${d.name}`, slides: cached.get(d.name).length, ms: replace, rmePct: bench.getTask(`print re-place (assemble) · ${d.name}`).result.latency.rme });
  }
  return { summary };
}

// ── baseline (commit) + variance-aware check ──────────────────────────────────
// Wall-clock numbers are machine-relative, so the baseline is a ratchet, not an
// absolute: --bless writes it, --check compares against it but never trips inside
// the variance band — max(tolerancePct, baseline RME + current RME) — only a real,
// out-of-noise slowdown fails. See engineering/workflow.md §Performance.
const round2 = (n) => Math.round(n * 100) / 100;

function blessBaseline(summary, printSummary) {
  if (!summary.length) {
    console.error('\nRefusing to bless an empty baseline — the run produced no datasets.');
    process.exitCode = 1;
    return;
  }
  const out = {};
  for (const s of summary) {
    out[s.dataset] = { slides: s.slides, ms: round2(s.ms), slidesPerSec: s.slidesPerSec, rmePct: round2(s.rmePct) };
  }
  // The print re-place tier (puppeteer) only runs under --export, so a plain
  // `bench:bless` PRESERVES any existing printDatasets rather than dropping them.
  let printOut;
  if (printSummary?.length) {
    printOut = {};
    for (const s of printSummary) printOut[s.dataset] = { slides: s.slides, ms: round2(s.ms), rmePct: round2(s.rmePct) };
  } else if (existsSync(BASELINE)) {
    try { printOut = JSON.parse(readFileSync(BASELINE, 'utf8')).printDatasets; } catch { /* none */ }
  }
  const payload = {
    version: 1,
    note: 'Committed perf baseline for the owned render engine. Refresh with `npm run bench:bless`; compare with `npm run bench:check`. Numbers are machine-relative — see engineering/workflow.md §Performance.',
    tolerancePct: TOLERANCE_PCT,
    datasets: out,
    // Print drawer rasterize→assemble split: full-rebuild vs cached-image re-place, per
    // deck. The re-place row being a fraction of full IS the durable record of the paper-
    // change optimization (HARD RULE #19). Blessed via `bench:bless -- --export`.
    ...(printOut ? { printDatasets: printOut } : {}),
  };
  writeFileSync(BASELINE, JSON.stringify(payload, null, 2) + '\n');
  console.log(`\nBlessed baseline → test/benchmark/baseline.json (${summary.length} render${printSummary?.length ? ` + ${printSummary.length} print` : ''} datasets).`);
}

function checkBaseline(summary) {
  if (!existsSync(BASELINE)) {
    console.error('\nNo baseline.json — run `npm run bench:bless` first.');
    process.exitCode = 1;
    return;
  }
  if (!summary.length) {
    console.error('\nNo benchmark results — the run produced no datasets (engine broken?).');
    process.exitCode = 1;
    return;
  }
  const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const tol = base.tolerancePct ?? TOLERANCE_PCT;
  console.log('\n=== PERF CHECK · current vs committed baseline ===');
  console.log(`${'dataset'.padEnd(20)}${'base ms'.padStart(10)}${'now ms'.padStart(10)}${'Δ%'.padStart(8)}${'band'.padStart(8)}  verdict`);
  let regressed = false;
  let drift = false;
  let won = false;
  for (const s of summary) {
    const b = base.datasets?.[s.dataset];
    if (!b) {
      drift = true;
      console.log(`${s.dataset.padEnd(20)}${'—'.padStart(10)}${s.ms.toFixed(1).padStart(10)}${'—'.padStart(8)}${'—'.padStart(8)}  NEW (re-bless)`);
      continue;
    }
    // A changed slide count means the workload itself moved — the ms delta would
    // be apples-to-oranges, so flag it as drift rather than compare timings.
    if (b.slides !== s.slides) {
      drift = true;
      console.log(`${s.dataset.padEnd(20)}${String(b.slides).padStart(10)}${String(s.slides).padStart(10)}${'—'.padStart(8)}${'slides'.padStart(8)}  WORKLOAD CHANGED (re-bless)`);
      continue;
    }
    const deltaPct = ((s.ms - b.ms) / b.ms) * 100;
    const band = Math.max(tol, (b.rmePct ?? 0) + (s.rmePct ?? 0));
    let verdict = 'ok';
    if (deltaPct > band) {
      verdict = 'REGRESSION';
      regressed = true;
    } else if (deltaPct < -band) {
      verdict = 'win';
      won = true;
    }
    const sign = deltaPct >= 0 ? '+' : '';
    console.log(
      `${s.dataset.padEnd(20)}${b.ms.toFixed(1).padStart(10)}${s.ms.toFixed(1).padStart(10)}${(sign + deltaPct.toFixed(1)).padStart(8)}${('±' + band.toFixed(1) + '%').padStart(8)}  ${verdict}`,
    );
  }
  for (const name of Object.keys(base.datasets ?? {})) {
    if (!summary.some((s) => s.dataset === name)) {
      drift = true;
      console.log(`${name.padEnd(20)}${'—'.padStart(10)}${'absent'.padStart(10)}${'—'.padStart(8)}${'—'.padStart(8)}  MISSING`);
    }
  }
  if (regressed) {
    console.error('\nPerf regression beyond the variance band. Investigate, or re-bless if the change is intentional and justified in the PR.');
    process.exitCode = 1;
  } else if (drift) {
    console.log('\nWorkload/dataset set drifted from baseline — run `npm run bench:bless` and commit the updated baseline.');
  } else if (won) {
    console.log('\nFaster than baseline (beyond the band) — run `npm run bench:bless` to ratchet the baseline so this win holds.');
  } else {
    console.log('\nWithin variance band — no regression.');
  }
}

async function main() {
  const render = await renderTier();
  // The print re-place tier shares the export tier's puppeteer setup, so it rides --export.
  const exp = wantExport ? await exportTier() : null;
  const print = wantExport ? await printTier() : null;
  if (wantBless) blessBaseline(render.summary, print?.summary);
  if (wantCheck && wantBless) {
    console.warn('\n--check skipped: ran with --bless, which would compare the just-written baseline against itself.');
  } else if (wantCheck) {
    checkBaseline(render.summary);
  }
  if (asJson) console.log('\n' + JSON.stringify({ render, export: exp, print }, null, 2));
  console.log('\nDone.' + (wantExport ? '' : ' (pass --export to also time the rasterize + print re-place tiers.)'));
}

main();
