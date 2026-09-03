#!/usr/bin/env node
/**
 * pixel-check — snapshot/diff harness for the _legacy.css elimination work.
 *
 * The hard pixel-diff gate for every commit in the _legacy.css split:
 *
 *   1. Before making CSS changes, snapshot the current state:
 *        node tools/pixel-check.js snapshot pre-phase-N
 *      → rebuilds every deck (or the specified subset) and stashes the
 *        PDFs in .scratch/pixel-check/pre-phase-N/<deck>.pdf
 *
 *   2. Make CSS changes, rebuild lattice.css, then verify:
 *        node tools/pixel-check.js diff pre-phase-N
 *      → rebuilds every deck again and byte-compares against the snapshot
 *      → exit 0 if every deck is byte-identical; exit 1 + report otherwise
 *
 *   3. Optional cleanup:
 *        node tools/pixel-check.js clean [<label>]
 *
 * Two-stage compare:
 *   1. Byte compare. If baseline and rebuild are byte-identical, OK.
 *      Most decks are deterministic — same Chrome + same source → same PDF.
 *   2. If bytes differ, rasterize both PDFs page-by-page (pdftoppm 72dpi)
 *      and run ImageMagick `compare` per page. The metric is *pixel
 *      difference count*. Zero changed pixels per page → OK (the byte
 *      drift was timestamp / metadata noise). Any page with > 0 changed
 *      pixels → DIFF.
 *
 * The second stage costs ~5-10s per deck (rasterize + compare), so
 * it only runs when bytes differ. Mermaid-heavy decks rely on it
 * (mmdc's per-diagram Puppeteer runs add ~30 bytes of variance per
 * SVG even when visual output is identical).
 *
 * For commits where pixel diffs are INTENDED (e.g. authoring new
 * State/Tone/Chrome variant CSS that adds visual treatment to existing
 * slides), pass --accept to acknowledge them. The diff report is still
 * surfaced so the human can eyeball it via SendUserFile before accepting.
 *
 * Usage:
 *   pixel-check snapshot <label> [--decks a,b,c]
 *   pixel-check diff <label> [--decks a,b,c] [--json]
 *   pixel-check clean [<label>]
 *   pixel-check ls
 *
 * Exit codes:
 *   0  all decks byte-identical (or --accept on diff)
 *   1  one or more decks have a non-zero byte delta
 *   2  usage / missing snapshot / missing tool
 *
 * See design/design-system.md §13 and the _legacy.css destination map.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
const SNAPSHOT_ROOT = path.join(ROOT, '.scratch', 'pixel-check');

const { ALL_DECKS, pageDeltaNote, parseAeCount } = require('./preview');

function ensureChrome() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return;
  const candidates = [
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      process.env.PUPPETEER_EXECUTABLE_PATH = c;
      return;
    }
  }
}

function buildDeck(deck, outPath) {
  const src = path.join(ROOT, 'examples', `${deck}.md`);
  if (!fs.existsSync(src)) return { deck, ok: false, error: 'source missing' };
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [EMULATOR, src, outPath, '-q'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  const took = Date.now() - t0;
  if (r.status !== 0) {
    return { deck, ok: false, took_ms: took, error: r.stderr?.toString().trim() || `exit ${r.status}` };
  }
  return { deck, ok: true, took_ms: took, bytes: fs.statSync(outPath).size };
}

function snapshot(label, decks) {
  const dir = path.join(SNAPSHOT_ROOT, label);
  fs.mkdirSync(dir, { recursive: true });
  const results = [];
  for (const deck of decks) {
    // Build INTO the source directory so relative asset URLs resolve
    // identically to a normal build; then move to the snapshot dir.
    // Without this, sample-image-landscape.svg and similar lose their
    // resolution (the rebuild produces a smaller, falsely-different PDF).
    const inplace = path.join(ROOT, 'examples', `.${deck}.pixel-check.pdf`);
    const inplaceHtml = path.join(ROOT, 'examples', `.${deck}.pixel-check.html`);
    const target = path.join(dir, `${deck}.pdf`);
    const r = buildDeck(deck, inplace);
    if (r.ok) {
      fs.copyFileSync(inplace, target);
      fs.unlinkSync(inplace);
      if (fs.existsSync(inplaceHtml)) fs.unlinkSync(inplaceHtml);
      r.path = target;
    }
    results.push(r);
    const status = r.ok ? `${r.bytes.toLocaleString()} bytes (${r.took_ms}ms)` : `FAIL — ${r.error}`;
    process.stdout.write(`  ${deck.padEnd(28)} ${status}\n`);
  }
  return results;
}

// Rasterize two PDFs page-by-page (pdftoppm 72dpi) and pixel-diff each page
// with ImageMagick `compare -metric AE`. The metric is changed-pixel COUNT.
//
// `opts.fuzz` (e.g. '3%') tells `compare` to treat per-channel color deltas
// within that tolerance as equal — the antialiasing carve-out the regression
// gate needs. pixel-check's own _legacy.css flow leaves it unset (exact 0 px,
// same-session); the gate (tools/regression-gate.mjs) passes a fuzz so glyph-
// edge AA shimmer between the committed golden and a fresh render doesn't read
// as drift. Each differing page also returns `total` (pixel count, for a caller
// gating on a FRACTION) and the rasterized `oldPng`/`newPng`/`diffPng` paths
// (so a caller building a montage never has to reconstruct pdftoppm's filenames,
// whose zero-padding varies with page count).
function pixelDiff(baselinePdf, currentPdf, deck, opts = {}) {
  const tmpDir = path.join('/tmp', `pixel-check-${process.pid}-${deck}`);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  spawnSync('pdftoppm', ['-r', '72', '-png', baselinePdf, `${tmpDir}/old`], { stdio: 'ignore' });
  spawnSync('pdftoppm', ['-r', '72', '-png', currentPdf, `${tmpDir}/new`], { stdio: 'ignore' });
  // pdftoppm pads the page number to the width of the highest page (`old-1.png`
  // for a <10-page PDF, `old-01.png` for 10-99). A plain string sort would then
  // order `old-10` before `old-2`, mispairing pages — so sort by parsed number.
  const pageNo = (f) => { const m = f.match(/-(\d+)\.png$/); return m ? Number(m[1]) : 0; };
  const byNum = (a, b) => pageNo(a) - pageNo(b);
  const oldPngs = fs.readdirSync(tmpDir).filter((f) => f.startsWith('old-') && f.endsWith('.png')).sort(byNum);
  const newPngs = fs.readdirSync(tmpDir).filter((f) => f.startsWith('new-') && f.endsWith('.png')).sort(byNum);
  const pages = Math.max(oldPngs.length, newPngs.length);
  const fuzzArgs = opts.fuzz ? ['-fuzz', opts.fuzz] : [];
  const dims = (p) => {
    const out = (spawnSync('identify', ['-format', '%w %h', p], { encoding: 'utf8' }).stdout || '').trim();
    const [w, h] = out.split(/\s+/).map(Number);
    return { w: w || 0, h: h || 0 };
  };
  const perPage = [];
  let totalPx = 0;
  for (let i = 0; i < pages; i++) {
    const oldP = oldPngs[i] ? path.join(tmpDir, oldPngs[i]) : null;
    const newP = newPngs[i] ? path.join(tmpDir, newPngs[i]) : null;
    if (!oldP || !newP) {
      // Direction matters and read backwards here until #1686's follow-on — see
      // pageDeltaNote's header in tools/preview.js for what it cost.
      perPage.push({ page: i + 1, pixels: -1, note: pageDeltaNote(oldP, newP), oldPng: oldP, newPng: newP });
      totalPx += 1;
      continue;
    }
    // Guard the dangerous direction: ImageMagick 6's `compare` on differently-
    // sized images diffs only the overlapping top-left region and reports 0 —
    // so a render whose page geometry changed would false-PASS. Detect the size
    // mismatch up front and fail the page (pixels = -1).
    const od = dims(oldP);
    const nd = dims(newP);
    if (od.w !== nd.w || od.h !== nd.h) {
      perPage.push({ page: i + 1, pixels: -1, note: `page resized ${od.w}x${od.h}→${nd.w}x${nd.h}`, total: od.w * od.h, oldPng: oldP, newPng: newP });
      totalPx += 1;
      continue;
    }
    const diffPng = path.join(tmpDir, `diff-${String(i + 1).padStart(3, '0')}.png`);
    const r = spawnSync('compare', [...fuzzArgs, '-metric', 'AE', oldP, newP, diffPng], { encoding: 'utf8' });
    // `parseAeCount` (tools/preview.js) reads the count and returns -1 when it
    // cannot — a count over a million arrives in scientific notation, and the
    // regex this replaced silently scored that page 0. See its header.
    const px = parseAeCount(r.stderr);
    if (px !== 0) perPage.push({ page: i + 1, pixels: px, total: od.w * od.h, diffPng, oldPng: oldP, newPng: newP, ...(px < 0 ? { note: 'compare produced no readable pixel count' } : {}) });
    // A `-1` SENTINEL counts as one, matching the page-add and page-resize branches
    // above; an IDENTICAL page counts as zero. The first draft of this line read
    // `px > 0 ? px : 1`, which also caught 0 — so every clean page added one and
    // `diff()`'s `pixel_identical` (totalPx === 0) could never be true again: two
    // byte-identical 58-page PDFs reported `totalPx 58`, and its "byte-drift only"
    // branch became dead code. Caught by the second checker.
    totalPx += px > 0 ? px : (px < 0 ? 1 : 0);
  }
  return { pages, perPage, totalPx, tmpDir };
}

// ── Montage helpers (shared: regression-gate + golden-diff, HARD RULE 15) ─────
// Build one "before │ after │ overlay" triptych PNG for a drifted page, straight
// from the rasterized paths pixelDiff returns (`oldPng`/`newPng`/`diffPng`).
// Reusing those paths avoids reconstructing pdftoppm's filenames, whose
// zero-padding varies with page count. Returns the montage path, or null if a
// tile is missing or ImageMagick's `montage` isn't installed. `opts.title` adds a
// caption (deck · mood · slide N) so a reviewer flipping the bundle has context.
function montageTriptych(page, outPng, opts = {}) {
  const { oldPng, newPng, diffPng } = page;
  if (!oldPng || !newPng || !fs.existsSync(oldPng) || !fs.existsSync(newPng)) return null;
  const overlay = diffPng && fs.existsSync(diffPng) ? diffPng : newPng;
  const titleArgs = opts.title ? ['-title', opts.title] : [];
  const r = spawnSync(
    'montage',
    [oldPng, newPng, overlay, '-tile', '3x1', '-geometry', '+6+6', '-background', '#888', ...titleArgs, outPng],
    { stdio: 'ignore' },
  );
  return r.status === 0 && fs.existsSync(outPng) ? outPng : null;
}

// Bundle a list of PNGs into one PDF (ImageMagick `convert`). Returns the PDF
// path, or null if `convert` is missing or there's nothing to bundle. (CI relaxes
// the IM PDF-coder policy so the write is allowed — see the workflow.)
function pngsToPdf(pngs, outPdf) {
  if (!pngs.length) return null;
  const r = spawnSync('convert', [...pngs, outPdf], { stdio: 'ignore' });
  return r.status === 0 && fs.existsSync(outPdf) ? outPdf : null;
}

function diff(label, decks, opts = {}) {
  const dir = path.join(SNAPSHOT_ROOT, label);
  if (!fs.existsSync(dir)) {
    process.stderr.write(`pixel-check: no snapshot named '${label}' at ${path.relative(ROOT, dir)}\n`);
    return { ok: false, exit: 2 };
  }
  const results = [];
  for (const deck of decks) {
    const baseline = path.join(dir, `${deck}.pdf`);
    if (!fs.existsSync(baseline)) {
      results.push({ deck, ok: false, error: 'no baseline for this deck in snapshot' });
      continue;
    }
    const inplace = path.join(ROOT, 'examples', `.${deck}.pixel-check.pdf`);
    const inplaceHtml = path.join(ROOT, 'examples', `.${deck}.pixel-check.html`);
    const build = buildDeck(deck, inplace);
    if (!build.ok) {
      results.push({ deck, ok: false, error: build.error });
      continue;
    }
    const baselineBytes = fs.statSync(baseline).size;
    const currentBytes = build.bytes;
    const delta = currentBytes - baselineBytes;
    const result = {
      deck,
      ok: true,
      baseline_bytes: baselineBytes,
      current_bytes: currentBytes,
      byte_delta: delta,
      byte_identical: delta === 0,
      took_ms: build.took_ms,
    };
    if (delta !== 0) {
      // Bytes differ — could be Puppeteer/mmdc non-determinism or a real
      // visual change. Rasterize and compare pixels per page to know.
      const pixel = pixelDiff(baseline, inplace, deck);
      result.pixel_pages = pixel.pages;
      result.pixel_total = pixel.totalPx;
      result.pixel_pages_changed = pixel.perPage.filter((p) => p.pixels !== 0).length;
      result.pixel_per_page = pixel.perPage;
      result.pixel_identical = pixel.totalPx === 0;
      result.diff_dir = pixel.tmpDir;
    } else {
      result.pixel_identical = true;
    }
    results.push(result);
    fs.unlinkSync(inplace);
    if (fs.existsSync(inplaceHtml)) fs.unlinkSync(inplaceHtml);
  }
  // OK = no pixel diffs anywhere. Byte-only drift is fine.
  const visualChanged = results.filter((r) => r.ok && !r.pixel_identical);
  const failed = results.filter((r) => !r.ok);
  const byteOnly = results.filter((r) => r.ok && !r.byte_identical && r.pixel_identical);
  const ok = visualChanged.length === 0 && failed.length === 0;
  if (opts.json) {
    process.stdout.write(JSON.stringify({ label, ok, results }, null, 2) + '\n');
  } else {
    for (const r of results) {
      if (!r.ok) {
        process.stdout.write(`  ${r.deck.padEnd(28)} FAIL — ${r.error}\n`);
      } else if (r.byte_identical) {
        process.stdout.write(`  ${r.deck.padEnd(28)} OK bytes=${r.current_bytes.toLocaleString()}\n`);
      } else if (r.pixel_identical) {
        const sign = r.byte_delta > 0 ? '+' : '';
        process.stdout.write(`  ${r.deck.padEnd(28)} OK (byte-drift only) Δbytes=${sign}${r.byte_delta} Δpixels=0\n`);
      } else {
        const sign = r.byte_delta > 0 ? '+' : '';
        process.stdout.write(`  ${r.deck.padEnd(28)} DIFF Δbytes=${sign}${r.byte_delta} Δpixels=${r.pixel_total.toLocaleString()} on ${r.pixel_pages_changed}/${r.pixel_pages} pages\n`);
        for (const p of r.pixel_per_page.slice(0, 5)) {
          process.stdout.write(`      page ${p.page}: ${p.pixels.toLocaleString()} px${p.note ? ` (${p.note})` : ''}${p.diffPng ? ` → ${p.diffPng}` : ''}\n`);
        }
      }
    }
    const cleanCount = results.length - visualChanged.length - failed.length;
    process.stdout.write(`\nsummary: ${cleanCount}/${results.length} pixel-clean`);
    if (byteOnly.length) process.stdout.write(` (${byteOnly.length} with byte drift only)`);
    if (visualChanged.length) process.stdout.write(`, ${visualChanged.length} visually changed`);
    if (failed.length) process.stdout.write(`, ${failed.length} failed`);
    process.stdout.write('\n');
  }
  return { ok, exit: ok ? 0 : 1, visualChanged, byteOnly, failed };
}

function clean(label) {
  if (!fs.existsSync(SNAPSHOT_ROOT)) return;
  if (label) {
    const dir = path.join(SNAPSHOT_ROOT, label);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      process.stdout.write(`removed ${path.relative(ROOT, dir)}\n`);
    } else {
      process.stderr.write(`pixel-check: no snapshot named '${label}'\n`);
    }
  } else {
    fs.rmSync(SNAPSHOT_ROOT, { recursive: true, force: true });
    process.stdout.write(`removed ${path.relative(ROOT, SNAPSHOT_ROOT)}\n`);
  }
}

function ls() {
  if (!fs.existsSync(SNAPSHOT_ROOT)) {
    process.stdout.write('(no snapshots)\n');
    return;
  }
  const entries = fs.readdirSync(SNAPSHOT_ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory()).map((e) => e.name).sort();
  if (entries.length === 0) {
    process.stdout.write('(no snapshots)\n');
    return;
  }
  for (const label of entries) {
    const dir = path.join(SNAPSHOT_ROOT, label);
    const pdfs = fs.readdirSync(dir).filter((f) => f.endsWith('.pdf')).length;
    process.stdout.write(`  ${label.padEnd(30)} ${pdfs} decks\n`);
  }
}

function parseDecks(argv) {
  const i = argv.indexOf('--decks');
  if (i === -1) return [...ALL_DECKS];
  const list = argv[i + 1];
  if (!list) return [...ALL_DECKS];
  return list.split(',').map((s) => s.trim()).filter(Boolean);
}

function main(argv) {
  const [cmd, ...rest] = argv;
  ensureChrome();

  if (cmd === 'snapshot') {
    const label = rest.find((a) => !a.startsWith('--'));
    if (!label) {
      process.stderr.write('usage: pixel-check snapshot <label> [--decks a,b,c]\n');
      return 2;
    }
    const decks = parseDecks(rest);
    process.stdout.write(`pixel-check snapshot '${label}' (${decks.length} decks)\n`);
    snapshot(label, decks);
    return 0;
  }

  if (cmd === 'diff') {
    const label = rest.find((a) => !a.startsWith('--'));
    if (!label) {
      process.stderr.write('usage: pixel-check diff <label> [--decks a,b,c] [--json]\n');
      return 2;
    }
    const decks = parseDecks(rest);
    const json = rest.includes('--json');
    process.stdout.write(`pixel-check diff '${label}' (${decks.length} decks)\n`);
    const r = diff(label, decks, { json });
    return r.exit;
  }

  if (cmd === 'clean') {
    clean(rest.find((a) => !a.startsWith('--')));
    return 0;
  }

  if (cmd === 'ls') {
    ls();
    return 0;
  }

  process.stderr.write([
    'usage:',
    '  pixel-check snapshot <label> [--decks a,b,c]',
    '  pixel-check diff <label> [--decks a,b,c] [--json]',
    '  pixel-check clean [<label>]',
    '  pixel-check ls',
  ].join('\n') + '\n');
  return 2;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { snapshot, diff, clean, ls, pixelDiff, montageTriptych, pngsToPdf };
