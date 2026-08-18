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
//   node test/benchmark/engine-bench.mjs --diagrams # + Mermaid diagram-render tier
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
const wantDiagrams = process.argv.includes('--diagrams');
// --sweep  fit-sweep tier (browser). The overflow/legibility probes run over laid-out
//          DOM, so neither the in-process render tier nor the whole-cycle export tier
//          can see them; this is the only thing that measures them. ~30s.
const wantSweep = process.argv.includes('--sweep');
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

// ── the fit-sweep tier's own datasets ────────────────────────────────────────
//
// The sweep's cost is driven by ONE thing above all: whether the content probe
// runs. `probeContentClipped` is a text-node walk with a Range rect per node,
// an order of magnitude dearer than the geometry probe, and it fires only on a
// slide where something clips. So a corpus of well-fitting decks measures the
// cheap half and reports a healthy number for a path that is only expensive when
// a deck is in trouble — which is exactly when an author is editing it, watching
// the ring, and generating the mutation bursts that used to re-run this scan
// every frame.
//
// `overflowing` is therefore a first-class dataset, not a curiosity: 40 slides
// deliberately over-stuffed so every one of them clips and every content walk
// runs. It is generated rather than committed because its only job is to be
// over-full — there is nothing to review in it, and a committed deck that must
// STAY broken is a deck someone eventually fixes.
function overflowingDeck(slides) {
  const body = Array.from({ length: 14 }, (_, j) =>
    `- Item ${j} title\n  - ${'A reasonably long body sentence that will push this slide well past its frame. '.repeat(3)}`).join('\n');
  const one = (i) => `<!-- _class: checklist -->\n\n# Slide ${i} with a fairly long headline that keeps going\n\n${body}`;
  return `---\nmarp: true\ntheme: indaco\nform: on\n---\n\n`
    + Array.from({ length: slides }, (_, i) => one(i)).join('\n\n---\n\n') + '\n';
}

const sweepDatasets = [
  { name: 'normal (jargon)', src: jargon, theme: 'crepuscolo' },
  { name: 'charts', src: readFileSync(join(ROOT, 'lib/components/chart/chart.gallery.md'), 'utf8'), theme: 'indaco' },
  { name: 'overflowing (x40)', src: overflowingDeck(40), theme: 'indaco' },
];
for (const d of sweepDatasets) registerTheme(d.theme);

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

// ── fit-sweep tier (HARD RULE #19 evidence for the overflow-sweep rework) ─────
//
// The overflow/legibility probes are the one hot path in this repo that NOTHING
// else here measures: they run in a browser, over laid-out DOM, so neither the
// render tier (in-process, no layout) nor the export tier (whole rasterize
// cycles, where a few ms of probing vanishes) can see them. That gap is how a
// whole-document per-frame scan shipped and stayed.
//
// TWO NUMBERS PER DECK, and the PAIR is the point:
//
//   · `scopedMs`   — what a sweep costs now: `lib/core/fit-sweep.js` plans it,
//                    so only the slides in the viewport band that are not
//                    already current this generation get probed.
//   · `unscopedMs` — the same probes over EVERY slide in the document, which is
//                    what the watcher did on every animation frame in which
//                    anything in the document changed.
//
// The ratio between them is the durable before→after record; committing both
// means a future change that quietly re-widens the scope shows up as the two
// converging, not merely as a slower absolute number on a faster machine.
//
// THE DECK IS STACKED AND VIRTUALIZED like the real filmstrip
// (docs/src/playground/deck-preview.js: `content-visibility: auto` +
// `contain-intrinsic-size`), because that is where the cost lived — probing an
// off-screen section reads its descendants and forces exactly the layout the
// virtualization exists to skip. Measured flat, the two numbers converge and the
// bench would report a win that the real surface does not get.
async function sweepTier() {
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
  const probes = await import('../../lib/core/overflow-probe.js');
  const {
    CLIP_CELL_SELECTOR, IGNORED_CLIP_SELECTOR, IGNORED_BEARER_SELECTOR, PROBE_SRC, CONTENT_CLIPPED_SRC,
  } = probes.default ?? probes;

  // Stacked + virtualized, mirroring the filmstrip's own styling.
  const FILMSTRIP = '.lattice>section{width:1280px;height:720px;display:block;'
    + 'content-visibility:auto;contain-intrinsic-size:1280px 720px}';
  const srcdoc = (html, css) =>
    `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0}${css}${FILMSTRIP}</style></head>`
    + `<body>${html}<script>${RUNTIME}</script></body></html>`;

  const browser = await puppeteer.launch({ executablePath: chrome || undefined, args: ['--no-sandbox'] });
  const out = [];
  for (const d of sweepDatasets) {
    // `api.render(src, THEME_STRING)` — the signature is `render(markdown, theme,
    // opts)`, and every other call site in this file passes the string. The first
    // cut of this tier passed `{ theme: d.theme }`, which resolves to no theme at
    // all and returns EMPTY css: every slide measured here was unstyled, with no
    // clip cells, no container queries and a fraction of the real element count.
    // Both arms saw the same DOM so the ratio survived, but the absolute numbers
    // described a deck nobody renders.
    const rendered = api.render(d.src, d.theme);
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setContent(srcdoc(rendered.html, rendered.css), { waitUntil: 'networkidle0', timeout: 60000 }).catch(() => {});
    // The runtime's own boot sweep, fonts, and content transforms have to land
    // first — measuring through them would time the boot, not the sweep.
    await new Promise((r) => setTimeout(r, 3000));
    const row = await page.evaluate((args) => {
      // `new Function`, not `eval` — same rehydration of a `.toString()`-injected
      // kernel that overflow-probe.js's PROBE_SRC exists for, without tripping the
      // no-eval lint. The sources come from this repo's own module, not the page.
      const probeSectionOverflow = new Function(`return (${args.probeSrc})`)();
      const probeContentClipped = new Function(`return (${args.clipSrc})`)();
      const TOL = 12;
      const all = [...document.querySelectorAll('section[data-lattice-slide]')];
      // The shape the watcher used to run on every frame: every slide, both probes.
      const unscoped = () => {
        const t = performance.now();
        for (const s of all) {
          const r = probeSectionOverflow(s, args.clipSel, TOL, args.ignoreSel);
          if (r.over || r.clipSuspect) probeContentClipped(s, args.ignoreSel, TOL, args.bearerSel);
        }
        return performance.now() - t;
      };
      // How many slides in the deck actually overflow — counted from the UNSCOPED
      // probe, never from `section.overflow`. The scoped sweep only marks what it
      // measured, so reading the class would report "3 overflowing" for a deck
      // where all 40 do, and a bench column that quietly means "…of the ones we
      // looked at" is worse than no column: it is the number a reader would use to
      // judge whether the workload exercises the expensive path at all.
      const overflowing = all.filter((s) => probeSectionOverflow(s, args.clipSel, TOL, args.ignoreSel).over).length;
      // The shape it runs on now. Each call opens a fresh generation, so this
      // measures a real sweep rather than the cache answering instantly.
      const scoped = () => {
        const t = performance.now();
        window.latticeSweep.sweep();
        return performance.now() - t;
      };
      // The COMPLETENESS BACKSTOP's steady-state cost: a whole-document sweep at
      // the CURRENT generation, which is what runs 800ms after the deck goes
      // quiet. The design rests on this being nearly free — it plans every
      // section but the cache skips the ones already measured, so it should cost
      // a rect read per section and no probes. Measured rather than asserted,
      // because if it is NOT free then the band is buying nothing: the deck would
      // pay the whole-document price on every settle anyway.
      // `complete()`, NOT `sweep({ all: true })` — the two differ in exactly the
      // way this measurement exists to expose. `sweep()` invalidates first, so it
      // re-probes every slide and costs the full whole-document price; the idle
      // backstop does not, so the cache skips everything already measured. The
      // first cut of this bench measured the wrong one and reported the backstop
      // at 15.8/11.8/36.9ms — as expensive as the whole-document sweep, which
      // would have meant the band was buying nothing.
      const backstop = () => {
        const t = performance.now();
        window.latticeSweep.complete();
        return performance.now() - t;
      };
      // Warm all three (first touch pays for layout none of them is responsible
      // for), then take the BEST of three — the floor is the reproducible number
      // here; the mean is dominated by whatever else the box is doing.
      unscoped(); scoped(); backstop();
      const best = (fn) => Math.min(fn(), fn(), fn());
      // Ordered so the backstop is measured with every slide already current,
      // which is the steady state it actually runs in.
      const backstopMs = best(backstop);
      const plan = window.latticeSweep.sweep();
      return {
        slides: all.length,
        overflowing,
        unscopedMs: best(unscoped),
        scopedMs: best(scoped),
        backstopMs,
        measured: plan.measure.length,
        offBand: plan.skipped.offBand,
      };
    }, {
      probeSrc: PROBE_SRC,
      clipSrc: CONTENT_CLIPPED_SRC,
      clipSel: CLIP_CELL_SELECTOR,
      ignoreSel: IGNORED_CLIP_SELECTOR,
      bearerSel: IGNORED_BEARER_SELECTOR,
    });
    await page.close();
    out.push({ dataset: d.name, ...row, ratio: row.scopedMs > 0 ? row.unscopedMs / row.scopedMs : Infinity });
  }
  await browser.close();
  console.log('\n=== FIT SWEEP · scoped (now) vs whole-document (before), filmstrip-virtualized ===');
  console.table(out.map((r) => ({
    dataset: r.dataset,
    slides: r.slides,
    overflowing: r.overflowing,
    'whole-doc ms': round2(r.unscopedMs),
    'scoped ms': round2(r.scopedMs),
    'x cheaper': Number.isFinite(r.ratio) ? round2(r.ratio) : '∞',
    'backstop ms': round2(r.backstopMs),
    'probed/skipped': `${r.measured}/${r.offBand}`,
  })));
  return { summary: out };
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

// ── DIAGRAM RENDER TIER (--diagrams) ─────────────────────────────────────────
//
// The one path `npm run bench`'s other tiers cannot see. Everything above measures the
// IN-PROCESS engine (`api.render`), and Mermaid is not in-process on the export path —
// it runs in a browser, in a child process, before slide splitting even begins. So a
// change to how diagrams are rendered moved no number here at all, which is exactly the
// hole HARD RULE #19(c) says to close ("extend the harness if no dataset exercises it").
//
// #1674 is why it exists: replacing the per-diagram `mmdc` shell-out with one
// engine-owned page took the 14-fence diagram gallery from ~19s to ~8s end to end. That
// was measured by hand with `time`, which is not a thing a later change can regress
// against.
//
// OPT-IN, like --export and --print, and for the same reason: it boots a real Chromium.
// It is NOT part of `bench:bless`'s committed baseline — the tier is I/O-bound on a
// browser launch and would be the noisiest number in the file. It reports, and the PR
// quotes it.
async function diagramTier() {
  const { fileURLToPath } = await import('node:url');
  const { execFileSync, execSync } = await import('node:child_process');
  // Same resolution the browser tiers use — the worker takes the path as job data
  // rather than launching from an ambient env var, so it has to be found here.
  let chrome = process.env.CHROME_PATH;
  if (!chrome || !existsSync(chrome)) {
    try {
      chrome = execSync('ls /root/.cache/puppeteer/chrome/linux-*/chrome-linux64/chrome 2>/dev/null | head -1', { encoding: 'utf8' }).trim();
    } catch {
      /* default */
    }
  }
  const { mkdtempSync, writeFileSync, readFileSync: readF, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const HERE = dirname(fileURLToPath(import.meta.url));
  const REPO = join(HERE, '..', '..');
  const WORKER = join(REPO, 'lib', 'integrations', 'mermaid', 'render-worker.js');
  const { engineInitConfig } = await import(`file://${join(REPO, 'lib/integrations/mermaid/init-directive.js')}`)
    .then((m) => m.default || m);

  // The real gallery's fences, which is what the 92%-of-render-time figure was measured
  // on — not a synthetic diagram that would understate a real deck's layout cost.
  const gallery = readFileSync(join(REPO, 'lib/components/diagram/diagram.gallery.md'), 'utf8');
  const fences = [...gallery.matchAll(/```mermaid\n([\s\S]*?)```/g)].map((m) => m[1].trim());
  const vars = { fontFamily: "'Outfit', system-ui, sans-serif", fontSize: '14px' };

  function renderN(n) {
    const dir = mkdtempSync(join(tmpdir(), 'bench-mmd-'));
    try {
      const jobFile = join(dir, 'job.json');
      const outFile = join(dir, 'out.json');
      writeFileSync(jobFile, JSON.stringify({
        pkgRoot: REPO, chromePath: chrome || undefined, backgroundColor: 'transparent', outFile,
        diagrams: fences.slice(0, n).map((definition) => ({ definition, config: engineInitConfig(vars) })),
      }));
      execFileSync(process.execPath, [WORKER, jobFile], { stdio: ['ignore', 'ignore', 'pipe'] });
      const res = JSON.parse(readF(outFile, 'utf8'));
      const failed = res.results.filter((r) => !r.ok).length;
      if (failed) throw new Error(`${failed} of ${n} diagrams failed to render`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  // 1 and N, because the interesting property is the SLOPE. One browser boot is a fixed
  // cost the old path paid per diagram; the point of the shared page is that the second
  // diagram is nearly free, so `14 / 1` is the number that would regress if a future
  // change went back to a page (or a process) per fence.
  const bench = new Bench({ name: 'diagrams', warmup: false, time: 1, iterations: 3 });
  bench.add('1 diagram (fixed cost: browser boot + bundle parse)', () => renderN(1));
  bench.add(`${fences.length} diagrams (one page, reused)`, () => renderN(fences.length));
  await bench.run();
  console.log('\n=== DIAGRAMS · Mermaid render worker ===');
  console.table(bench.table());

  const one = mean(bench.getTask('1 diagram (fixed cost: browser boot + bundle parse)'));
  const many = mean(bench.getTask(`${fences.length} diagrams (one page, reused)`));
  const marginal = (many - one) / (fences.length - 1);
  console.log(`\nfixed ${one.toFixed(0)}ms · ${fences.length} diagrams ${many.toFixed(0)}ms · marginal ${marginal.toFixed(0)}ms/diagram`);
  console.log(`a page-per-diagram implementation would cost about ${(one * fences.length / 1000).toFixed(1)}s here.`);
  return {
    summary: [
      { dataset: 'diagrams · 1 (fixed)', slides: 1, ms: one },
      { dataset: `diagrams · ${fences.length}`, slides: fences.length, ms: many },
      { dataset: 'diagrams · marginal per diagram', slides: 1, ms: marginal },
    ],
  };
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

function blessBaseline(summary, printSummary, render, sweepSummary) {
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
  // The fit-sweep tier (puppeteer) only runs under --sweep, so a plain
  // `bench:bless` PRESERVES any existing sweepDatasets — same rule as print below.
  let sweepOut;
  if (sweepSummary?.length) {
    sweepOut = {};
    for (const s of sweepSummary) {
      sweepOut[s.dataset] = {
        slides: s.slides,
        overflowing: s.overflowing,
        // BOTH numbers, deliberately. `scopedMs` alone would ratchet the current
        // cost; the pair records the SHAPE of the win, so a future change that
        // re-widens the scope shows up as the two converging rather than as a
        // slightly slower absolute number someone attributes to the machine.
        scopedMs: round2(s.scopedMs),
        unscopedMs: round2(s.unscopedMs),
        ratio: round2(s.ratio),
        // The completeness backstop in its steady state. Blessed so a change that
        // makes it expensive — the one thing that would invalidate keeping the
        // band at all — shows up in this file's diff.
        backstopMs: round2(s.backstopMs),
      };
    }
  } else if (existsSync(BASELINE)) {
    try { sweepOut = JSON.parse(readFileSync(BASELINE, 'utf8')).sweepDatasets; } catch { /* none */ }
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
  // A BLESS THAT ONLY MEASURED ONE TIER MUST NOT RESTAMP THE OTHERS' MACHINE.
  //
  // `blessedOn` and `calibration` are what `comparableMachine()` matches on, and
  // matching is what makes the render/print bands GATE rather than merely report.
  // A `bench:bless -- --sweep` run rewrote them to whichever box happened to run
  // the sweep tier, which silently demoted the render gate to "reported, not
  // gated" for everyone on the machine class that had blessed it — and left
  // `printDatasets`, preserved byte-identical from the previous bless, filed under
  // a fingerprint they were never measured on. A future run on THAT box would then
  // gate an 11-minute tier against numbers taken on different silicon: a
  // manufactured regression. Caught by the HARD RULE #25 checker.
  //
  // So the fingerprint follows the tier that actually ran. A render-tier bless
  // always runs (it is unconditional in main()), so it owns the stamp; a
  // sweep-only or print-only bless carries the previous one forward with the rows
  // it did not re-measure.
  const measuredRenderTier = !!summary?.length;
  const prior = existsSync(BASELINE)
    ? (() => { try { return JSON.parse(readFileSync(BASELINE, 'utf8')); } catch { return null; } })()
    : null;
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
    calibration: measuredRenderTier || !prior?.calibration ? {
      probe: CALIBRATION,
      ms: round2(render?.calibration ?? 0),
      rmePct: round2(render?.calibrationRmePct ?? 0),
    } : prior.calibration,
    // WHO BLESSED IT — not decoration. `checkBaseline` asserts on wall-clock only
    // when this matches the machine doing the checking, because that is the only
    // case where a millisecond delta is a statement about the CODE.
    blessedOn: measuredRenderTier || !prior?.blessedOn ? machineFingerprint() : prior.blessedOn,
    datasets: out,
    // Print drawer rasterize→assemble split: full-rebuild vs cached-image re-place, per
    // deck. The re-place row being a fraction of full IS the durable record of the paper-
    // change optimization (HARD RULE #19). Blessed via `bench:bless -- --print`.
    ...(printOut ? { printDatasets: printOut } : {}),
    // The overflow/legibility sweep, scoped vs whole-document. The gap between
    // the two rows IS the before→after record for the sweep rework (HARD RULE
    // #19) — the "before" is not a number from an older commit, it is the old
    // SHAPE re-measured on the same page in the same run, so it stays comparable
    // on any machine. Blessed via `bench:bless -- --sweep`.
    ...(sweepOut ? { sweepDatasets: sweepOut } : {}),
  };
  writeFileSync(BASELINE, JSON.stringify(payload, null, 2) + '\n');
  console.log(`\nBlessed baseline → test/benchmark/baseline.json (${summary.length} render${printSummary?.length ? ` + ${printSummary.length} print` : ''} datasets).`);
}

/**
 * @param opts.confirming  A Set of dataset names. When present this is the SECOND
 *   pass of a two-pass timing check: only those datasets are compared, the
 *   workload/drift sweeps are skipped (pass 1 already settled them), and nothing
 *   sets an exit code — `main()` owns the verdict. See the two-pass note in main().
 */
function checkBaseline(summary, printSummary, render, opts = {}) {
  const sweepSummary = opts.sweepSummary ?? null;
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
  const comparable = verdictOnMachine.ok;
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
  // THE FIT-SWEEP TIER. Only compared when THIS run produced it (`--sweep`), so a
  // plain `bench:check` is unchanged.
  //
  // WHAT GATES HERE IS THE RATIO, NOT THE MILLISECONDS. Absolute browser-probe
  // timings move with the machine like any other wall-clock number, but
  // `unscopedMs / scopedMs` is two measurements of the same page in the same run,
  // so the hardware divides out.
  //
  // AND IT GATES ON A FLOOR, NOT ON A PERCENTAGE OF THE BLESSED VALUE — which the
  // first cut got wrong, in the direction that produces a gate nobody can trust. A
  // ±40% band read `normal (jargon)` at 23.5× when blessed and 13.6× on the very
  // next run of the identical tree, and called it a REGRESSION. Nothing had
  // changed: `scopedMs` there is ~0.4ms, close enough to timer granularity that
  // 0.1ms of jitter is 25% of the reading, and the ratio inherits all of it.
  //
  // The failure actually worth catching is not "the ratio moved". It is "the sweep
  // stopped being scoped" — someone reinstates a whole-document scan, or widens
  // the band until it swallows the deck — and that collapses the ratio toward 1×
  // from anywhere in the 8–24× range these decks blessed at. A floor of 3× catches
  // every version of that and cannot be tripped by jitter on a sub-millisecond
  // measurement. The blessed ratio is still printed beside it, so a genuine drift
  // downward is visible to a reader before it reaches the floor; it just does not
  // fail the run on noise.
  const SWEEP_RATIO_FLOOR = 3;
  if (sweepSummary?.length) {
    console.log('\n=== FIT-SWEEP CHECK · scoped-vs-whole-document ratio ===');
    for (const s of sweepSummary) {
      const b = base.sweepDatasets?.[s.dataset];
      if (!b) {
        drift = true;
        console.log(`${s.dataset.padEnd(24)}${'—'.padStart(10)}${round2(s.ratio).toString().padStart(10)}×  NEW (re-bless)`);
        continue;
      }
      if (b.slides !== s.slides || b.overflowing !== s.overflowing) {
        drift = true;
        console.log(`${s.dataset.padEnd(24)}${`${b.slides}/${b.overflowing}`.padStart(10)}${`${s.slides}/${s.overflowing}`.padStart(10)}   WORKLOAD CHANGED (re-bless)`);
        continue;
      }
      const d = ((s.ratio - b.ratio) / b.ratio) * 100;
      const verdict = s.ratio < SWEEP_RATIO_FLOOR ? 'REGRESSION (scope widened)' : 'ok';
      if (verdict.startsWith('REGRESSION')) regressedDatasets.push(`${s.dataset} (sweep)`);
      console.log(
        `${s.dataset.padEnd(24)}${round2(b.ratio).toString().padStart(9)}×${round2(s.ratio).toString().padStart(9)}×`
        + `${((d >= 0 ? '+' : '') + d.toFixed(1)).padStart(8)}${(`floor ${SWEEP_RATIO_FLOOR}×`).padStart(10)}  ${verdict}`,
      );
    }
    for (const name of Object.keys(base.sweepDatasets ?? {})) {
      if (!sweepSummary.some((s) => s.dataset === name)) {
        drift = true;
        console.log(`${name.padEnd(24)}${'—'.padStart(10)}${'absent'.padStart(10)}   MISSING (re-bless)`);
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
  const sweep = wantSweep ? await sweepTier() : null;
  const print = wantPrint ? await printTier() : null;
  const diagrams = wantDiagrams ? await diagramTier() : null;
  if (wantBless) blessBaseline(render.summary, print?.summary, render, sweep?.summary);
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
    const pass1 = checkBaseline(render.summary, print?.summary, render, { sweepSummary: sweep?.summary });
    if (pass1.regressedDatasets.length) {
      console.log(`\nRe-measuring ${pass1.regressedDatasets.length} regressed dataset(s) to separate a real slowdown from machine load…`);
      const second = await renderTier();
      // The EXPORT tier is not re-measured — an ~11-minute puppeteer arm cannot be
      // run twice on a hunch — so an export-tier regression stands on pass 1 alone.
      // Its ±50% band is already sized for that.
      const exportRegressed = pass1.regressedDatasets.filter((n) => !render.summary.some((s) => s.dataset === n));
      const again = checkBaseline(second.summary, null, second, {
        confirming: new Set(pass1.regressedDatasets),
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
  if (asJson) console.log('\n' + JSON.stringify({ render, export: exp, print, diagrams }, null, 2));
  const missing = [
    !wantExport && '--export (rasterize tier, ~2 min)',
    !wantPrint && '--print (print re-place tier, ~11 min)',
    !wantDiagrams && '--diagrams (Mermaid render worker, ~30 s)',
  ].filter(Boolean);
  console.log('\nDone.' + (missing.length ? ` (pass ${missing.join(' and ')} to time them too.)` : ''));
}

main();
