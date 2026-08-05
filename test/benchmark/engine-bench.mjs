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
import os from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import MarkdownIt from 'markdown-it';
import { Bench } from 'tinybench';
import latticeEngine from '../../lib/engine/index.js';
import api from '../../lib/playground/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// TWO TIERS, TWO FLAGS — because they differ by ~6x in cost and used to ride one flag.
//   --export  rasterize tier (screenshot every slide of each deck). ~2 min. Cheap enough to run
//             nightly on both arms of a head-vs-base compare.
//   --print   print re-place tier (rasterize + jsPDF assemble, 3 iterations over a 58-slide deck).
//             ~11 min per arm — on-demand only. Blessed rows live in baseline.printDatasets.
// They shared `--export` until 2026-08-03, and the cost of the pair is exactly why the nightly
// could not afford to pass it — so the export path shipped a coverage claim it did not have.
// Each flag lazily sets up its own puppeteer, so either may be passed alone.
const wantExport = process.argv.includes('--export');
const wantPrint = process.argv.includes('--print');
const asJson = process.argv.includes('--json');
const wantBless = process.argv.includes('--bless');
const wantCheck = process.argv.includes('--check');
const BASELINE = join(ROOT, 'test/benchmark/baseline.json');
const TOLERANCE_PCT = 12; // default variance band; effective band = max(this, baseline RME + current RME)

// Standalone engine for the HTML-only cost line.
const rawEngine = latticeEngine.createEngine();
// The calibration parser — stock markdown-it, no Lattice plugins, so nothing in
// `lib/` can move it.
const calibrationMd = new MarkdownIt();

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

// ── the CALIBRATION probe ────────────────────────────────────────────────────
//
// The committed baseline used to hold ABSOLUTE milliseconds from whatever machine
// last blessed it, and `bench:check` compared against them directly. Run anywhere
// slower — the cloud sandbox, a loaded laptop, a CI runner — and every dataset read
// as a ~20% regression on a clean tree (#1382). A ratchet that is red by default is
// a ratchet nobody can use: the next person either re-blesses on their own hardware
// (moving the baseline to a number the NEXT person cannot match either) or learns to
// ignore it.
//
// Every run therefore times a fixed probe, and each dataset is ALSO recorded as an
// INDEX (dataset ms ÷ probe ms) — a figure that means roughly the same thing on any
// machine, so the committed file's diff reads as a trend rather than as a record of
// whose laptop ran it.
//
// THE PROBE IS NOT OUR CODE, and that is the design constraint. Normalizing against
// one of our own renders would make an engine-wide optimization invisible — numerator
// and denominator would both fall and the index would not move. It is UPSTREAM
// markdown-it parsing a fixed synthetic document: the dominant cost class of what is
// being measured (regex, string allocation, GC), so it tracks machine speed for this
// workload, while nothing in `lib/` can shift it.
//
// WHAT THE INDEX DOES NOT DO, measured rather than assumed. It corrects for CLOCK
// SPEED, not for CONTENTION. Re-running this check on the blessing machine under six
// spinners on four cores moved the probe +38% and the indices +26/+48/+49% — the
// correction is partial, because a 5ms parse and a 150ms render are not scheduled or
// GC'd alike. And on a QUIET re-run the probe's own ±3% noise moved the indices more
// than the milliseconds moved. So the index is the cross-machine READING; it is not
// what the gate asserts on. `checkBaseline` gates on absolute ms and only when the
// fingerprint says it is comparing like with like — see there.
//
// A markdown-it VERSION BUMP re-scales every index and will read as drift. That is
// correct rather than a flaw, and the response is a re-bless justified in the PR.
const CALIBRATION = 'calibration (markdown-it)';
const CALIBRATION_DOC = Array.from({ length: 200 }, (_, i) => [
  `## Heading ${i}`,
  '',
  `Some **bold** and _emphasised_ prose with \`inline code\` and a [link](https://example.test/${i}).`,
  '',
  `- item ${i} a`,
  `- item ${i} b`,
  '',
  '| a | b |',
  '|---|---|',
  `| ${i} | ${i * 2} |`,
  '',
].join('\n')).join('\n');

// ── render tier ───────────────────────────────────────────────────────────────
async function renderTier() {
  const main = new Bench({ name: 'render', warmup: true, time: 1500, iterations: 8 });
  // The machine-speed probe, timed by the SAME harness under the same warmup and
  // sampling as the datasets — a probe measured differently is not a denominator.
  main.add(CALIBRATION, () => calibrationMd.parse(CALIBRATION_DOC, {}));
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
  const calibration = mean(main.getTask(CALIBRATION));
  console.log('\n=== SUMMARY ===');
  console.log(`calibration probe: ${calibration.toFixed(2)}ms (markdown-it, ${CALIBRATION_DOC.split('\n').length} lines) — the index divisor`);
  console.log(`${'dataset'.padEnd(20)}${'slides'.padStart(7)}${'ms'.padStart(10)}${'index'.padStart(9)}${'slides/s'.padStart(11)}`);
  const summary = [];
  for (const d of datasets) {
    const task = main.getTask(d.name);
    const l = mean(task);
    console.log(
      `${d.name.padEnd(20)}${String(d.slides).padStart(7)}${l.toFixed(1).padStart(10)}${(l / calibration).toFixed(2).padStart(9)}${String(Math.round((d.slides / l) * 1000)).padStart(11)}`,
    );
    summary.push({
      dataset: d.name,
      slides: d.slides,
      ms: l,
      // The MACHINE-RELATIVE figure `--check` actually compares. `ms` rides along
      // for the human reading the baseline diff.
      index: l / calibration,
      slidesPerSec: Math.round((d.slides / l) * 1000),
      rmePct: task.result.latency.rme,
    });
  }
  return { main: main.table(), summary, calibration, calibrationRmePct: main.getTask(CALIBRATION).result.latency.rme };
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
  // FOUR, not two. Two samples cannot produce a meaningful RME, and the nightly comparator widens
  // its band by the two arms' RME — so a noisy measurement made the gate WEAKER, unboundedly. The
  // 58-slide deck read 82% RME at two iterations, which gave a +/-164 band on which an exact 2x
  // regression reported `ok`. The comparator now caps the widening; this halves the noise that
  // makes the cap bind. Cost: ~96s -> ~190s per arm, which the nightly can afford.
  const bench = new Bench({ name: 'export', warmup: false, time: 1, iterations: 4 });
  for (const d of datasets.filter((x) => !x.name.startsWith('stress'))) {
    bench.add(d.name, () => exportOnce(d));
  }
  await bench.run();
  console.log('\n=== EXPORT / RASTERIZE · per-deck screenshot cycle ===');
  console.table(bench.table());
  await browser.close();
  // A `{ main, summary }` shape like the render tier's, and it did NOT have one before. This tier
  // returned a raw `bench.table()` — display rows keyed "Task name" / "Latency avg (ns)" — so
  // `export.summary` was `undefined` and NOTHING could compare it, whatever flag was passed.
  // `rmePct` rides along because these samples are genuinely noisy (the charts deck read ±66% at
  // 2 iterations here) and the nightly widens its band by the two arms' RME rather than pretending
  // a fixed percentage fits a 6-second I/O-bound cycle.
  const summary = datasets
    .filter((x) => !x.name.startsWith('stress'))
    .map((d) => ({ dataset: d.name, slides: d.slides, ms: mean(bench.getTask(d.name)), rmePct: bench.getTask(d.name).result.latency.rme }));
  return { main: bench.table(), summary };
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
// The assemble mirrors assembleSheetPdf (docs/src/components/studio/export/deck-export.js) —
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

/**
 * WHICH MACHINE THIS IS, for deciding whether a wall-clock comparison means
 * anything. Node MAJOR only: a patch bump should not invalidate a baseline, while a
 * major one changes V8 and legitimately should.
 */
function machineFingerprint() {
  return {
    node: `v${process.versions.node.split('.')[0]}`,
    platform: `${process.platform}/${process.arch}`,
    cpus: os.cpus().length,
    cpu: (os.cpus()[0]?.model || 'unknown').trim(),
  };
}
/**
 * Are these two runs comparable by WALL CLOCK?
 *
 * The fingerprint alone is not enough, and the reason is visible in this repo's
 * own committed baseline: its CPU reads `Intel(R) Xeon(R) Processor @ 2.80GHz` —
 * the MASKED model string a virtualized host reports. Two different cloud VMs of
 * genuinely different speed compare EQUAL on it, which would hand wall-clock
 * gating to a comparison that cannot support it: red-by-default, back again,
 * now wearing a same-machine authority claim. (And in a CPU-limited container
 * `os.cpus().length` reports the HOST's cores, so resizing the sandbox silently
 * changes the answer in the other direction.)
 *
 * So the CALIBRATION PROBE carries the second half, and this is the job it is
 * actually good at: not normalizing a comparison, but refusing one. If the probe
 * reads more than PROBE_BAND away from what the baseline recorded, the two runs
 * did not come off comparable silicon whatever the model strings say, and the
 * timing drops to reported-not-gated.
 */
const PROBE_BAND = 15; // %

const sameFingerprint = (a, b) => !!a && !!b
  && a.node === b.node && a.platform === b.platform && a.cpus === b.cpus && a.cpu === b.cpu;

function comparableMachine(base, here, probeNow) {
  if (!sameFingerprint(base.blessedOn, here)) return { ok: false, why: 'a different machine' };
  const probeBlessed = base.calibration?.ms;
  if (!probeBlessed || !probeNow) return { ok: false, why: 'no calibration probe to compare' };
  const delta = Math.abs((probeNow - probeBlessed) / probeBlessed) * 100;
  if (delta > PROBE_BAND) {
    return { ok: false, why: `the probe reads ${delta.toFixed(0)}% off the blessed value (band ±${PROBE_BAND}%) — same fingerprint, different speed` };
  }
  return { ok: true, why: '' };
}

function blessBaseline(summary, printSummary, render) {
  if (!summary.length) {
    console.error('\nRefusing to bless an empty baseline — the run produced no datasets.');
    process.exitCode = 1;
    return;
  }
  const out = {};
  for (const s of summary) {
    out[s.dataset] = {
      slides: s.slides,
      // `index` is what `--check` compares — machine-relative, so this file means the
      // same thing on the machine that wrote it and the one that reads it.
      index: round2(s.index),
      // `ms` is the absolute cost on the machine stamped below. It is what the
      // check compares ON THAT MACHINE — the tightest signal available, since the
      // index divides by a second measured quantity whose own noise would only
      // blur the one comparison that gates. `slidesPerSec` is human-only.
      ms: round2(s.ms),
      slidesPerSec: s.slidesPerSec,
      rmePct: round2(s.rmePct),
    };
  }
  // The print re-place tier (puppeteer) only runs under --print, so a plain
  // `bench:bless` PRESERVES any existing printDatasets rather than dropping them.
  let printOut;
  if (printSummary?.length) {
    printOut = {};
    for (const s of printSummary) printOut[s.dataset] = { slides: s.slides, ms: round2(s.ms), rmePct: round2(s.rmePct) };
  } else if (existsSync(BASELINE)) {
    try { printOut = JSON.parse(readFileSync(BASELINE, 'utf8')).printDatasets; } catch { /* none */ }
  }
  const payload = {
    version: 2,
    note: 'Committed perf baseline for the owned render engine. Refresh with `npm run bench:bless`; '
      + 'compare with `npm run bench:check`. TWO SIGNALS: a moved `slides` count fails on any machine; '
      + 'TIMING gates only when the checking machine matches `blessedOn` AND reads the calibration probe '
      + 'within band — there it compares `ms`, the tightest signal. Anywhere else the timing is REPORTED '
      + 'as `index` (dataset ms ÷ probe ms, which divides clock speed out) and does not gate. '
      + 'See engineering/workflow.md §Performance.',
    tolerancePct: TOLERANCE_PCT,
    // What the indices are relative to. Recorded so a reader can convert an index
    // back to this machine's milliseconds, and so a wildly different probe reading
    // on the checking machine is visible rather than silently folded in.
    calibration: {
      probe: CALIBRATION,
      ms: round2(render?.calibration ?? 0),
      rmePct: round2(render?.calibrationRmePct ?? 0),
    },
    // WHO BLESSED IT — not decoration. `checkBaseline` asserts on wall-clock only
    // when this matches the machine doing the checking, because that is the only
    // case where a millisecond delta is a statement about the CODE.
    blessedOn: machineFingerprint(),
    datasets: out,
    // Print drawer rasterize→assemble split: full-rebuild vs cached-image re-place, per
    // deck. The re-place row being a fraction of full IS the durable record of the paper-
    // change optimization (HARD RULE #19). Blessed via `bench:bless -- --print`.
    ...(printOut ? { printDatasets: printOut } : {}),
  };
  writeFileSync(BASELINE, JSON.stringify(payload, null, 2) + '\n');
  console.log(`\nBlessed baseline → test/benchmark/baseline.json (${summary.length} render${printSummary?.length ? ` + ${printSummary.length} print` : ''} datasets).`);
}

/**
 * @param opts.confirming  A Set of dataset names. When present this is the SECOND
 *   pass of a two-pass timing check: only those datasets are compared, the
 *   workload/drift sweeps are skipped (pass 1 already settled them), and nothing
 *   sets an exit code — `main()` owns the verdict. See the two-pass note in main().
 * @param opts.comparable  Force the same-machine verdict rather than re-deriving it.
 *   Pass 2 inherits pass 1's, because re-deriving it on a loaded box could flip the
 *   confirming run to NOT COMPARABLE and silently clear a real regression.
 */
function checkBaseline(summary, printSummary, render, opts = {}) {
  const confirming = opts.confirming ?? null;
  const empty = { regressedDatasets: [], drift: false, won: false };
  if (!existsSync(BASELINE)) {
    console.error('\nNo baseline.json — run `npm run bench:bless` first.');
    process.exitCode = 1;
    return empty;
  }
  if (!summary.length) {
    console.error('\nNo benchmark results — the run produced no datasets (engine broken?).');
    process.exitCode = 1;
    return empty;
  }
  const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const tol = base.tolerancePct ?? TOLERANCE_PCT;
  // A version-1 baseline holds only absolute ms. Comparing those across machines is
  // the defect this replaced, so refuse rather than pretend: an unindexed baseline is
  // re-blessed, not reinterpreted.
  if (!(base.version >= 2)) {
    console.error('\nThe committed baseline predates machine-relative indexing (version < 2). '
      + 'Run `npm run bench:bless` and commit it — comparing its absolute milliseconds against '
      + 'this machine is exactly what #1382 removed.');
    process.exitCode = 1;
    return empty;
  }
  // TWO SIGNALS, and the whole point of #1382 is that they are not the same signal.
  //
  //   WORKLOAD — a dataset's slide count moved, or a row is new/missing. Machine-
  //   independent, always a real staleness, and the baseline row it invalidates has
  //   recorded nothing since. FAILS on any machine.
  //
  //   TIMING — a wall-clock delta. Only a statement about the CODE when the two
  //   numbers came off the same hardware. On a different machine it is a statement
  //   about the hardware, which is what made this gate red by default on a clean
  //   tree; there it is REPORTED and does not fail.
  //
  // That is the issue's "scope the gate to a pinned runner" without needing one: the
  // baseline records its own runner and the check self-scopes. It also matches how
  // the gate is actually used — bless, change, re-check — which happens on one
  // machine, where it keeps full teeth.
  const here = machineFingerprint();
  const verdictOnMachine = comparableMachine(base, here, render?.calibration);
  // `opts.comparable` is pass 2 inheriting pass 1's verdict — see the note at the
  // call site. Only ever narrows to `true` for a confirming run; a first pass
  // always derives its own.
  const comparable = opts.comparable ?? verdictOnMachine.ok;
  console.log(confirming ? '\n=== PERF CHECK · pass 2 (confirming) ===' : '\n=== PERF CHECK · current vs committed baseline ===');
  if (base.calibration?.ms && render?.calibration) {
    const ratio = render.calibration / base.calibration.ms;
    console.log(`calibration probe: ${base.calibration.ms.toFixed(2)}ms blessed → ${render.calibration.toFixed(2)}ms here (${ratio.toFixed(2)}×)`);
  }
  if (comparable) {
    console.log(`same machine as the baseline (${here.platform}, ${here.cpus}× ${here.cpu}, node ${here.node}) — wall clock GATES`);
  } else {
    console.log(`blessed on: ${base.blessedOn?.platform ?? '?'}, ${base.blessedOn?.cpus ?? '?'}× ${base.blessedOn?.cpu ?? '?'}, node ${base.blessedOn?.node ?? '?'}`);
    console.log(`running on: ${here.platform}, ${here.cpus}× ${here.cpu}, node ${here.node}`);
    console.log(`NOT COMPARABLE (${verdictOnMachine.why}) — timing is REPORTED, not gated. Bless here first if you want it to gate.`);
  }
  // The two columns must be the two numbers Δ% is computed FROM, or the table reads
  // as arithmetic that does not add up: same-machine gates on wall clock, so
  // printing the index beside a ms delta showed 11.08 → 11.70 labeled +21.0%.
  const unit = comparable ? 'ms' : 'idx';
  console.log(`${'dataset'.padEnd(20)}${`base ${unit}`.padStart(10)}${`now ${unit}`.padStart(10)}${'Δ%'.padStart(8)}${'band'.padStart(8)}  verdict`);
  const regressedDatasets = [];
  let drift = false;
  let won = false;
  for (const s of summary) {
    if (confirming && !confirming.has(s.dataset)) continue;
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
    // SAME machine → compare WALL CLOCK. It is the tightest signal available: the
    // index divides by a second measured quantity, so on the one comparison that
    // gates, the probe's own ±3% would only add noise.
    // DIFFERENT machine → compare the INDEX, which at least divides the clock-speed
    // difference out, and report rather than gate.
    const deltaPct = comparable
      ? ((s.ms - b.ms) / b.ms) * 100
      : ((s.index - b.index) / b.index) * 100;
    const band = Math.max(tol, (b.rmePct ?? 0) + (s.rmePct ?? 0)
      + (comparable ? 0 : (base.calibration?.rmePct ?? 0) + (render?.calibrationRmePct ?? 0)));
    let verdict = 'ok';
    if (deltaPct > band) {
      verdict = comparable ? 'REGRESSION' : 'slower (not gated)';
      if (comparable) regressedDatasets.push(s.dataset);
    } else if (deltaPct < -band) {
      verdict = comparable ? 'win' : 'faster (not gated)';
      if (comparable) won = true;
    }
    const sign = deltaPct >= 0 ? '+' : '';
    const [was, now] = comparable ? [b.ms, s.ms] : [b.index, s.index];
    console.log(
      `${s.dataset.padEnd(20)}${was.toFixed(2).padStart(10)}${now.toFixed(2).padStart(10)}${(sign + deltaPct.toFixed(1)).padStart(8)}${('±' + band.toFixed(1) + '%').padStart(8)}  ${verdict}`,
    );
  }
  if (!confirming) {
    for (const name of Object.keys(base.datasets ?? {})) {
      if (!summary.some((s) => s.dataset === name)) {
        drift = true;
        console.log(`${name.padEnd(20)}${'—'.padStart(10)}${'absent'.padStart(10)}${'—'.padStart(8)}${'—'.padStart(8)}  MISSING`);
      }
    }
  }

  // THE EXPORT TIER, which this check used to bless and never read. `--bless` has always written
  // four `printDatasets` rows (print full / print re-place, for normal and charts) and `--check`
  // looped only `summary` — so the export path could double in cost with a green check, the same
  // blessed-but-never-compared hole the slice/deck baseline had. Only compared when THIS run
  // produced them (`--export`), so a plain `bench:check` is unchanged.
  //
  // A DELIBERATELY WIDER BAND: these are whole rasterize cycles measured in tens of seconds, and
  // they are far more exposed to machine and I/O noise than an in-process render. 50% catches a
  // doubling — which is the failure worth having — without firing on a slow disk.
  const EXPORT_BAND = 50;
  if (printSummary?.length) {
    console.log('\n=== EXPORT CHECK · current vs committed baseline ===');
    for (const s of printSummary) {
      const b = base.printDatasets?.[s.dataset];
      if (!b) {
        drift = true;
        console.log(`${s.dataset.padEnd(32)}${'—'.padStart(10)}${(s.ms / 1000).toFixed(1).padStart(10)}s  NEW (re-bless)`);
        continue;
      }
      if (b.slides !== s.slides) {
        drift = true;
        console.log(`${s.dataset.padEnd(32)}${String(b.slides).padStart(10)}${String(s.slides).padStart(10)}   WORKLOAD CHANGED (re-bless)`);
        continue;
      }
      // THE SAME MACHINE RULE AS THE RENDER TIER. This tier had no guard, so a
      // 115-second puppeteer baseline — the row most exposed to hardware of
      // anything here — still gated on absolute milliseconds wherever it ran,
      // which made "different machine → reported, not gated" false exactly where
      // it mattered most. These rows carry no calibration index (the probe is a
      // parse, and this tier is I/O-bound raster work it says nothing about), so
      // off-machine they are printed as raw seconds and simply do not gate.
      const d = ((s.ms - b.ms) / b.ms) * 100;
      const verdict = d > EXPORT_BAND
        ? (comparable ? 'REGRESSION' : 'slower (not gated)')
        : d < -EXPORT_BAND ? (comparable ? 'win' : 'faster (not gated)') : 'ok';
      if (verdict === 'REGRESSION') regressedDatasets.push(s.dataset);
      console.log(
        `${s.dataset.padEnd(32)}${(b.ms / 1000).toFixed(1).padStart(9)}s${(s.ms / 1000).toFixed(1).padStart(9)}s${((d >= 0 ? '+' : '') + d.toFixed(1)).padStart(8)}${('±' + EXPORT_BAND + '%').padStart(8)}  ${verdict}`,
      );
    }
    // The mirror of the render tier's MISSING pass, and it was left out of the first cut. A
    // RENAMED print dataset is caught above (`!b` → NEW), but a REMOVED one was not: the loop
    // only walks what this run produced, so dropping a deck from the print tier left its blessed
    // row in baseline.json forever with nothing ever reading it — the exact rot this block exists
    // to end. Only runs when the print tier actually ran, so a plain `bench:check` is unchanged.
    for (const name of Object.keys(base.printDatasets ?? {})) {
      if (!printSummary.some((s) => s.dataset === name)) {
        drift = true;
        console.log(`${name.padEnd(32)}${'—'.padStart(10)}${'absent'.padStart(10)}   MISSING (re-bless)`);
      }
    }
  }
  // DRIFT FAILS ON ANY MACHINE, and that is the second half of #1382. A slide count
  // is machine-independent, so a moved one is unambiguous staleness — and the row it
  // invalidates has recorded nothing since it moved. It used to exit 0 with a note,
  // which is how `charts` sat blessed at 14 slides against a 15-slide deck for a
  // month with `bench:check` printing the fix every time it ran.
  if (drift) {
    console.error('\nWorkload/dataset set drifted from baseline — the affected rows have been recording nothing. '
      + 'Run `npm run bench:bless` and commit the updated baseline.');
    process.exitCode = 1;
  }
  // A TIMING regression is NOT failed here — `main()` confirms it with a second
  // measurement first (see the two-pass note there). Drift is, because a slide
  // count does not vary run to run.
  if (!regressedDatasets.length && !drift) {
    console.log(won
      ? '\nFaster than baseline (beyond the band) — run `npm run bench:bless` to ratchet the baseline so this win holds.'
      : '\nWithin variance band — no regression.');
  }
  return { regressedDatasets, drift, won };
}

async function main() {
  const render = await renderTier();
  const exp = wantExport ? await exportTier() : null;
  const print = wantPrint ? await printTier() : null;
  if (wantBless) blessBaseline(render.summary, print?.summary, render);
  if (wantCheck && wantBless) {
    console.warn('\n--check skipped: ran with --bless, which would compare the just-written baseline against itself.');
  } else if (wantCheck) {
    // TWO-PASS TIMING. Pass 1 measures; a REGRESSION verdict then earns a second
    // measurement before it is allowed to fail the run, and only a dataset that
    // regresses in BOTH passes exits 1.
    //
    // Why: "same machine" is a hardware fingerprint, and on a shared or virtualized
    // one it does not imply the same machine STATE. Measured on this repo's own
    // cloud sandbox, two runs of an identical tree came in at 65.1ms and 56.3ms for
    // `normal (jargon)` — 15% apart, against a ±12% band — because the first
    // followed a test sweep and the box was still busy. The calibration probe sees
    // some of that (4.59 → 5.10ms) but not all of it: contention hits a 58-slide
    // render harder than a 2200-line parse, so no single divisor rescues one
    // sample. A second sample does. That is the same failure #1382 was filed for —
    // `bench:check` red on a tree nobody had changed — and shipping a gate that
    // reproduces it under load would be the bug in a new costume.
    //
    // Cost is paid only when something already looks red, so a green run is
    // unchanged. Noise is not correlated across passes; a real regression is.
    const pass1 = checkBaseline(render.summary, print?.summary, render);
    if (pass1.regressedDatasets.length) {
      console.log(`\nRe-measuring ${pass1.regressedDatasets.length} regressed dataset(s) to separate a real slowdown from machine load…`);
      const second = await renderTier();
      // The EXPORT tier is not re-measured — an ~11-minute puppeteer arm cannot be
      // run twice on a hunch — so an export-tier regression stands on pass 1 alone.
      // Its ±50% band is already sized for that.
      const exportRegressed = pass1.regressedDatasets.filter((n) => !render.summary.some((s) => s.dataset === n));
      // PASS 2 INHERITS PASS 1's comparability verdict instead of re-deriving it.
      // `comparableMachine` also fails when the calibration probe reads more than
      // PROBE_BAND off the blessed value — and pass 2 runs precisely when the box
      // looked slow, which is when the probe is most likely to drift. Re-deriving
      // it there meant a loaded machine could flip pass 2 to NOT COMPARABLE, and
      // `regressedDatasets` is only appended to `if (comparable)` — so every
      // pass-1 regression came back "not reproduced" and the run exited 0. A real
      // slowdown would have been reported as machine noise by the machine noise.
      const again = checkBaseline(second.summary, null, second, {
        confirming: new Set(pass1.regressedDatasets),
        comparable: true,
      });
      const confirmed = [...exportRegressed, ...pass1.regressedDatasets.filter((n) => again.regressedDatasets.includes(n))];
      const cleared = pass1.regressedDatasets.filter((n) => !confirmed.includes(n));
      if (cleared.length) {
        console.log(`\nNot reproduced on the second pass (machine load, not code): ${cleared.join(', ')}`);
      }
      if (confirmed.length) {
        console.error(`\nPerf regression beyond the variance band, confirmed on two passes: ${confirmed.join(', ')}. `
          + 'Investigate, or re-bless if the change is intentional and justified in the PR.');
        process.exitCode = 1;
      } else if (!pass1.drift) {
        console.log('\nWithin variance band — no regression.');
      }
    }
  }
  if (asJson) console.log('\n' + JSON.stringify({ render, export: exp, print }, null, 2));
  const missing = [!wantExport && '--export (rasterize tier, ~2 min)', !wantPrint && '--print (print re-place tier, ~11 min)'].filter(Boolean);
  console.log('\nDone.' + (missing.length ? ` (pass ${missing.join(' and ')} to time them too.)` : ''));
}

main();
