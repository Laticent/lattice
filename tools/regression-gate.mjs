// Visual regression gate — engine-parity's single-renderer successor.
// Render every gallery fresh, pixel-diff it against the committed golden PDF, and fail on unblessed drift.
//
// WHY. While marp existed, tools/engine-parity.mjs rendered every gallery
// through BOTH marp-core and the owned lattice-engine and asserted they
// pixel-match — marp was the external oracle ("correct" = "matches marp").
// Once marp is gone the engine IS canonical, so "diverges from marp" stops
// meaning anything. The gate's nature changes from PARITY (do two renderers
// agree?) to REGRESSION (did our render change from the blessed version?).
// See engineering/decisions/2026-06-12-p4-regression-gate-retire-marp.md.
//
// The goldens are the committed gallery PDFs we already ship for human review
// (lib/components/**/<name>.gallery.{light,dark}.pdf — 65 galleries × 2 moods).
// No new image tree. The gate renders each gallery FRESH through the emulator
// (the same path build-galleries.js blesses with), rasterizes both the fresh
// render and the committed golden to pixels, and diffs with a small AA
// tolerance. It NEVER byte-compares PDFs: PDFs aren't byte-reproducible
// (timestamps, font-subset ordering) but the rendered pixels are — the §7.1
// spike proved cross-session pixel determinism once fonts are self-hosted
// (assets/fonts/*.woff2, emitted into every PDF by the emulator).
//
// GREEN = the committed golden still matches a fresh render (the author blessed
// correctly). RED = unblessed drift — CSS/source changed but a deck's committed
// PDF is stale. Re-bless with `--bless` (delegates to build-galleries.js /
// build-bucket-galleries.js) and commit the refreshed PDFs in the same PR.
//
// Sibling render paths (HARD RULE 1): lattice-emulator.js (this gate's render,
// via lib/engine) and dist/lattice-runtime.js (vscode preview / published HTML).
//
// Usage:
//   node tools/regression-gate.mjs                 # full corpus, light + dark
//   node tools/regression-gate.mjs --only kpi      # one gallery (component or bucket)
//   node tools/regression-gate.mjs --bless [--only kpi]   # re-render goldens, then exit
//   node tools/regression-gate.mjs --json          # machine-readable report
//
// Exit code is non-zero if any gallery drifts past tolerance, so it can gate.
// Failure artifacts (before │ after │ overlay montage PDFs) land in
// .scratch/regression/.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { pixelDiff, montageTriptych, pngsToPdf } = require('./pixel-check.js');
const { injectDark } = require('./build-galleries.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EMULATOR = join(ROOT, 'lattice-emulator.js');
const THEME_CSS = join(ROOT, 'dist', 'lattice.css');
const OUT = join(ROOT, '.scratch', 'regression');

// Tolerance mirrors engine-parity's: a per-channel delta within FUZZ is AA
// shimmer, not drift; a page FAILS only if the over-FUZZ pixel count exceeds
// FAIL_FRACTION of the page. The emulator embeds self-hosted fonts so a faithful
// re-render is pixel-identical (0 px) in practice; the tolerance is headroom for
// cross-environment rasterizer AA, not a license for visible change.
const FUZZ = '3%'; // ≈ channel delta 8 / 255, the engine-parity threshold
const FAIL_FRACTION = 0.0005; // 0.05% of the page (≈ 260 px at 72dpi 960×540)
// Mermaid galleries (the chart + diagram buckets) render fine mmdc-produced SVG
// vector/text whose sub-pixel anti-aliasing is NOT bit-identical across machine
// classes: a golden blessed on one machine drifts ~0.4–0.5% on another (e.g. the
// sandbox bless env vs a GitHub CI runner) even with identical Chromium + the
// same embedded fonts — the §7.1 "0px" spike only measured same-machine-class.
// That is below human-visible but above FAIL_FRACTION, so these galleries get a
// wider per-page floor. Real unblessed drift is far larger (a CSS change moves
// 10–100% of a page — see the Step-1 RED test), so the gate stays meaningful; the
// golden-diff before/after comment is the human catch for any subtle intended
// change. Flat-content galleries keep the strict floor. See
// engineering/gotchas.md ("committed render golden doesn't match a fresh render").
const FAIL_FRACTION_MERMAID = 0.01; // 1% — ~2× the observed cross-machine AA noise

// Galleries in the chart or diagram bucket are the only ones whose content is
// mmdc-rendered SVG, so they're the only ones that need the wider floor.
const MERMAID_BUCKET_RE = /\/components\/(chart|diagram)\//;
function failFractionFor(galleryMd) {
  return MERMAID_BUCKET_RE.test(galleryMd) ? FAIL_FRACTION_MERMAID : FAIL_FRACTION;
}

const THEMES = ['light', 'dark'];

// ── Corpus ──────────────────────────────────────────────────────────────────
// Every *.gallery.md under lib/ — per-component galleries, per-bucket survey
// galleries, and the hand-authored ones outside the components tree
// (build-bucket-galleries.js EXTRA_GALLERIES). Each has a committed
// <base>.gallery.{light,dark}.pdf golden pair.
//
// The walk rooted at `lib/components` until 2026-08-03, which is how
// lib/base/_logo's two committed goldens went stale unnoticed: no builder made
// them, no pixel gate watched them, and the overflow ratchet's corpus did not
// reach them either — three blind spots on one path (#1279).
function galleryDecks() {
  const out = [];
  (function walk(dir) {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.name.endsWith('.gallery.md')) out.push(p);
    }
  })(join(ROOT, 'lib'));
  return out.sort();
}

// The gallery's display name: the basename without .gallery.md. Matches the
// `--only` token build-galleries / build-bucket-galleries accept.
function deckName(galleryMd) {
  return basename(galleryMd).replace(/\.gallery\.md$/, '');
}

function goldenFor(galleryMd, theme) {
  return galleryMd.replace(/\.gallery\.md$/, `.gallery.${theme}.pdf`);
}

// ── Fresh render (the gate's candidate) ───────────────────────────────────────
// Render a gallery to a TEMP PDF the same way build-galleries blesses the golden:
// emulator + dist/lattice.css + indaco, dark via injectDark.
//
// CRITICAL: the emulator resolves a deck's relative asset paths
// (`![bg](sample-image.svg)`, logo files) against the OUTPUT path's directory,
// not the source markdown's. So the fresh render MUST be written into the
// gallery's own directory — exactly as build-galleries does — or every image/
// logo slide renders blank and false-fails the gate. A `.regr-` dotfile keeps it
// out of the committed tree; the caller cleans it (and the .html sidecar) up.
// For dark, the injected copy is likewise written alongside the source.
function renderFresh(galleryMd, theme) {
  const dir = dirname(galleryMd);
  const name = deckName(galleryMd);
  const outPdf = join(dir, `.regr-${name}.${theme}.pdf`);
  const cleanup = [outPdf, outPdf.replace(/\.pdf$/, '.html')];
  try {
    if (theme === 'light') {
      execFileSync(process.execPath, [EMULATOR, galleryMd, THEME_CSS, outPdf, 'indaco', '-q'], {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } else {
      const tmpMd = join(dir, `.regr-${name}.${theme}.md`);
      cleanup.push(tmpMd, tmpMd.replace(/\.md$/, '.html'));
      writeFileSync(tmpMd, injectDark(readFileSync(galleryMd, 'utf8')));
      execFileSync(process.execPath, [EMULATOR, tmpMd, THEME_CSS, outPdf, 'indaco', '-q'], {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    }
  } catch (err) {
    cleanup.forEach((p) => { try { rmSync(p, { force: true }); } catch { /* ignore */ } });
    throw err;
  }
  // Drop the injected dark source + every .html sidecar now; keep the PDF for the
  // caller to diff, then remove via the returned cleanup list.
  for (const p of cleanup) if (p !== outPdf && /\.(md|html)$/.test(p)) { try { rmSync(p, { force: true }); } catch { /* ignore */ } }
  return { outPdf, cleanup };
}

// ── Bless (delegate to the existing builders) ─────────────────────────────────
// The bless primitive is build-galleries.js / build-bucket-galleries.js, which
// overwrite the committed goldens in place. A name can be a component OR a bucket
// (or, with no --only, everything), so try both builders and treat "no such
// target" (exit 2) as "not mine," failing only on a real render error (exit 1).
function bless(only) {
  const builders = [
    join(ROOT, 'tools', 'build-galleries.js'),
    join(ROOT, 'tools', 'build-bucket-galleries.js'),
  ];
  let blessed = false;
  for (const builder of builders) {
    const args = [builder, ...(only ? ['--only', only] : [])];
    try {
      execFileSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
      blessed = true;
    } catch (err) {
      // Exit 2 == "no such target in this builder" (a component name handed to
      // the bucket builder, or vice-versa). Tolerate it; fail on a real render
      // error (exit 1) or anything else.
      if (err.status === 2) continue;
      throw err;
    }
  }
  if (!blessed) throw new Error(`bless: "${only}" is not a known component or bucket gallery`);
  return blessed;
}

// ── Per-gallery run ───────────────────────────────────────────────────────────
function runGallery(galleryMd) {
  const name = deckName(galleryMd);
  const failFraction = failFractionFor(galleryMd);
  const result = { deck: relative(ROOT, galleryMd), name, themes: {}, fail: false };
  for (const theme of THEMES) {
    const golden = goldenFor(galleryMd, theme);
    if (!existsSync(golden)) {
      result.themes[theme] = { status: 'NO_GOLDEN' };
      result.fail = true;
      continue;
    }
    let outPdf;
    let cleanup = [];
    try {
      ({ outPdf, cleanup } = renderFresh(galleryMd, theme));
    } catch (err) {
      result.themes[theme] = { status: 'RENDER_ERROR', error: String(err.message || err) };
      result.fail = true;
      continue;
    }
    const diff = pixelDiff(golden, outPdf, `regr-${name}-${theme}`, { fuzz: FUZZ });
    // The fresh render lived in the gallery's own dir (for asset resolution);
    // remove it now that it's rasterized into pixelDiff's tmpDir.
    cleanup.forEach((p) => { try { rmSync(p, { force: true }); } catch { /* ignore */ } });
    // A page fails if its over-fuzz pixel count exceeds FAIL_FRACTION, OR if the
    // page count itself changed (pixels === -1 sentinel from pixelDiff).
    const drifted = diff.perPage.filter(
      (p) => p.pixels === -1 || (p.total ? p.pixels / p.total > failFraction : p.pixels > 0),
    );
    const worst = diff.perPage.reduce((m, p) => Math.max(m, p.total ? p.pixels / p.total : (p.pixels > 0 ? 1 : 0)), 0);
    const themeResult = {
      status: drifted.length ? 'DRIFT' : 'ok',
      pages: diff.pages,
      worstFraction: worst,
      drifted: drifted.map((p) => ({ page: p.page, pixels: p.pixels, total: p.total, note: p.note, oldPng: p.oldPng, newPng: p.newPng, diffPng: p.diffPng })),
      golden: relative(ROOT, golden),
      tmpDir: diff.tmpDir, // pixelDiff's rasterized old-/new-/diff- PNGs (montage source)
    };
    if (drifted.length) result.fail = true;
    result.themes[theme] = themeResult;
  }
  return result;
}

// ── Drift artifact: before │ after │ overlay montage ──────────────────────────
// For each drifted page, montage golden | fresh | the compare overlay side by
// side, then bundle the montages into one PDF per drifted gallery+theme under
// .scratch/regression/. One doc the author/reviewer flips through.
function buildMontage(name, theme, themeResult) {
  const pages = themeResult.drifted.filter((d) => d.page > 0);
  if (!pages.length) return null;
  const dir = themeResult.tmpDir;
  const montages = [];
  for (const d of pages) {
    const m = join(dir, `montage-${String(d.page).padStart(3, '0')}.png`);
    const made = montageTriptych(d, m, { title: `${name} · ${theme} · slide ${d.page}` });
    if (made) montages.push(made);
  }
  return pngsToPdf(montages, join(OUT, `${name}.${theme}.drift.pdf`));
}

// ── Main ──────────────────────────────────────────────────────────────────────
function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const blessMode = args.includes('--bless');
  const onlyIdx = args.indexOf('--only');
  const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null;

  if (blessMode) {
    bless(only);
    if (!json) process.stdout.write(`\nblessed ${only ? `gallery "${only}"` : 'all galleries'} — commit the refreshed PDFs.\n`);
    return 0;
  }

  let decks = galleryDecks();
  if (only) decks = decks.filter((d) => deckName(d) === only);
  if (!decks.length) {
    process.stderr.write(only ? `error: no gallery named "${only}"\n` : 'error: no galleries found\n');
    return 2;
  }

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const report = [];
  let anyFail = false;
  for (const galleryMd of decks) {
    const r = runGallery(galleryMd);
    // Attach drift montages.
    for (const theme of THEMES) {
      const tr = r.themes[theme];
      if (tr?.status === 'DRIFT') {
        const artifact = buildMontage(r.name, theme, tr);
        if (artifact) tr.artifact = relative(ROOT, artifact);
      }
    }
    report.push(r);
    if (r.fail) anyFail = true;
    if (!json) {
      const parts = THEMES.map((t) => {
        const tr = r.themes[t];
        if (!tr) return `${t}:?`;
        if (tr.status === 'ok') return `${t}:ok`;
        if (tr.status === 'DRIFT') return `${t}:DRIFT(${tr.drifted.length}pg, worst ${(tr.worstFraction * 100).toFixed(2)}%)`;
        return `${t}:${tr.status}`;
      });
      process.stdout.write(`${r.fail ? '✗' : '✓'} ${r.name.padEnd(20)} ${parts.join('  ')}\n`);
    }
  }

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  if (json) {
    process.stdout.write(JSON.stringify({ ok: !anyFail, fuzz: FUZZ, failFraction: FAIL_FRACTION, failFractionMermaid: FAIL_FRACTION_MERMAID, report }, null, 2) + '\n');
  } else {
    const failed = report.filter((r) => r.fail);
    process.stdout.write(`\n${report.length} galleries × ${THEMES.length} moods. `);
    process.stdout.write(anyFail ? `${failed.length} DRIFTED: ${failed.map((r) => r.name).join(', ')}\n` : 'all match committed goldens.\n');
    if (anyFail) {
      process.stdout.write(`Artifacts: ${relative(ROOT, OUT)}/. Re-bless with: node tools/regression-gate.mjs --bless [--only <name>]\n`);
    }
  }
  return anyFail ? 1 : 0;
}

process.exit(main());
