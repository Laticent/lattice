// Visual regression gate — engine-parity's single-renderer successor.
// Render every committed deck fresh, pixel-diff it against its golden PDF, and fail on unblessed drift.
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
// tolerance. It NEVER byte-compares PDFs. Two renders on ONE machine ARE now
// byte-identical (lib/core/pdf-timestamps.js pinned the clock, the only thing
// that was churning), but a golden blessed on a DIFFERENT machine is not: Skia
// rasterizes through CPU-dispatched code paths. Pixels, compared with a
// tolerance, are what survives that — the §7.1
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
// TWO SCOPES (#1379). `galleries` is the light/dark pairs under lib/ described above.
// `decks` is every OTHER committed PDF with a sibling deck — examples/, exemplars/,
// design/, themes/, the CI baseline — 185 artifacts that had no watcher reading their
// bytes at all. Default is BOTH, because a gate that silently covers a third of the
// committed corpus is the defect this one exists to catch.
//
// Usage:
//   node tools/regression-gate.mjs                      # everything (~45 min, 4 cores)
//   node tools/regression-gate.mjs --scope galleries    # the pre-#1379 run
//   node tools/regression-gate.mjs --scope decks        # the newly-watched 185
//   node tools/regression-gate.mjs --only kpi           # one gallery (component or bucket)
//   node tools/regression-gate.mjs --only examples/pricing   # one deck golden
//   node tools/regression-gate.mjs --bless              # GALLERIES only (see below)
//   node tools/regression-gate.mjs --scope decks --bless [--only examples/x]
//
// `--bless` with no `--scope` means GALLERIES, deliberately: `npm run bless` is documented
// as re-rendering the gallery goldens, and letting it reach the deck scope made it a
// 35-minute sweep that silently banked unrelated example-PDF drift into your commit. The
// deck bless is opt-in. (The CHECK default stays `all`.)
//   node tools/regression-gate.mjs --json               # machine-readable report
//
// Exit code is non-zero if any target drifts past tolerance, so it can gate.
// Failure artifacts (before │ after │ overlay montage PDFs) land in
// .scratch/regression/.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
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

// ── The OTHER two thirds of the committed corpus (#1379) ─────────────────────
// The 150 gallery goldens under lib/ (75 decks x 2 moods) were watched by the walk
// above. 185 more committed PDFs — every `examples/` deck and the token-contrast set
// (136 together), all 45 worked exemplars, the two design galleries, the CI baseline deck and the
// palette audit — were watched by NOTHING that reads their bytes.
// `#1279` closed OWNERSHIP (every PDF names a producer and a watcher) and deliberately
// not FRESHNESS, and the `watcher:` those rules named was `overflow:check`, which
// re-renders the markdown to a scratch dir and deletes it. It never opens the committed
// artifact. So an engine change staleified those 185 artifacts and no gate could say so.
//
// This is the same gate, pointed at them. Nothing new was needed — which is the point:
// the machinery for "does the committed PDF still match a fresh render" already existed
// and its corpus simply stopped at `lib/` (HARD RULE #15).
//
// The set is DERIVED from `git ls-files`, never hand-listed, for the reason #1279
// records: a hand-kept list of artifacts is silent by default, and the set of committed
// artifacts drifting from the set any gate knows about IS the defect. A deck golden is
// any committed PDF with a sibling `.md`, minus the exclusions below — each of which is
// a rule from PDF_OWNERSHIP that says, in prose, why re-rendering it is wrong.
const DECK_GOLDEN_EXCLUDE = [
  // Frozen evidence beside a dated decision record. Rebuilding destroys the thing
  // being evidenced (PDF_OWNERSHIP: "a frozen artifact of the decision it sits beside").
  (f) => f.startsWith('engineering/decisions/'),
  // Rendered by REAL marp-cli on purpose, to show what a recipient's toolchain
  // produces. Re-rendering it through our engine replaces the artifact with one made
  // by the engine it exists to be compared against.
  (f) => f.startsWith('kit/'),
  // The light/dark gallery pairs are the scope above; diffing them here would render
  // every one twice and report each drift twice.
  (f) => /\.gallery\.(light|dark)\.pdf$/.test(f),
];

function deckGoldens() {
  const out = execFileSync('git', ['ls-files', '*.pdf'], { cwd: ROOT, encoding: 'utf8' })
    .trim().split('\n').filter(Boolean)
    .filter((f) => !DECK_GOLDEN_EXCLUDE.some((ex) => ex(f)))
    .filter((f) => existsSync(join(ROOT, f.replace(/\.pdf$/, '.md'))))
    .map((f) => join(ROOT, f.replace(/\.pdf$/, '.md')));
  return out.sort();
}

// A deck golden's display name, and the `--only` token: the path with its extension
// dropped, relative to the repo. Full paths rather than bare stems because these span
// five directories and `README` alone is ambiguous (examples/README.md and
// exemplars/README.md are both decks). A bare stem is accepted too when unambiguous.
function goldenDeckName(md) {
  return relative(ROOT, md).replace(/\.md$/, '');
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

// A deck golden's fresh render. Same asset-resolution constraint as above — the
// emulator resolves a deck's relative paths against the OUTPUT directory, so this must
// be written beside the source or every image and logo slide renders blank (#1406).
//
// The invocation MUST match the producers' exactly — `build-staged-pdfs.js` (the
// pre-commit hook) and `build-exemplar-pdfs.js` both run `[EMULATOR, src, out]` with no
// CSS path and no palette argument, so the deck's own `theme:` front matter decides.
// Passing `THEME_CSS`/`indaco` the way the gallery path does would override the deck's
// theme and false-fail every deck that names another one.
function renderFreshDeck(md) {
  const outPdf = join(dirname(md), `.regr-${basename(md, '.md')}.pdf`);
  const cleanup = [outPdf, outPdf.replace(/\.pdf$/, '.html')];
  try {
    execFileSync(process.execPath, [EMULATOR, md, outPdf, '-q'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    cleanup.forEach((p) => { try { rmSync(p, { force: true }); } catch { /* ignore */ } });
    throw err;
  }
  try { rmSync(outPdf.replace(/\.pdf$/, '.html'), { force: true }); } catch { /* ignore */ }
  return { outPdf, cleanup };
}

// Mermaid is detected per DECK here rather than by directory, because these decks are
// not bucketed: 24 of the 185 deck goldens carry a ```mermaid fence and they are spread
// across the tree. Same reason the galleries need it — mmdc's SVG anti-aliasing is not
// bit-identical across machine classes.
const MERMAID_FENCE_RE = /^[ \t]*(?:```|~~~)[ \t]*mermaid\b/m;
function failFractionForDeck(md) {
  try {
    return MERMAID_FENCE_RE.test(readFileSync(md, 'utf8')) ? FAIL_FRACTION_MERMAID : FAIL_FRACTION;
  } catch {
    return FAIL_FRACTION;
  }
}

// `bless: true` re-blesses ONLY what actually drifted, by promoting the fresh render
// this run already produced onto the golden. Two reasons it works that way rather than
// re-rendering the whole scope:
//
//   1. A blanket re-render rewrites every file whose golden was blessed on ANOTHER
//      machine, because Skia rasterizes differently across hosts — 185 rewritten files
//      to land ~20 real changes, burying the review in noise. (Same-machine clock churn
//      no longer contributes: lib/core/pdf-timestamps.js pinned it.)
//   2. The fresh render is already on disk and already rasterized. Promoting it costs
//      one rename; re-rendering costs another full sweep.
function runDeckGolden(md, opts = {}) {
  const name = goldenDeckName(md);
  const golden = md.replace(/\.md$/, '.pdf');
  const failFraction = failFractionForDeck(md);
  const result = { deck: relative(ROOT, md), name, scope: 'deck', themes: {}, fail: false };
  const key = 'golden';
  if (!existsSync(golden)) {
    result.themes[key] = { status: 'NO_GOLDEN' };
    result.fail = true;
    return result;
  }
  let outPdf;
  let cleanup = [];
  try {
    ({ outPdf, cleanup } = renderFreshDeck(md));
  } catch (err) {
    result.themes[key] = { status: 'RENDER_ERROR', error: String(err.message || err) };
    result.fail = true;
    return result;
  }
  // `finally`, because a throw between here and the cleanup (a corrupt golden, a rasterizer
  // failure, a full disk) would otherwise strand a `.regr-*.pdf` beside a committed deck.
  // The .gitignore additions contain the blast radius, but a leak the tool can prevent is
  // not one to leave to a denylist. (HARD RULE #25 checker.)
  let diff;
  let drifted;
  try {
    diff = pixelDiff(golden, outPdf, `regr-deck-${name.replace(/[/\\]/g, '_')}`, { fuzz: FUZZ });
    drifted = diff.perPage.filter(
      (p) => p.pixels === -1 || (p.total ? p.pixels / p.total > failFraction : p.pixels > 0),
    );
    // Promote BEFORE cleanup — `outPdf` is one of the paths cleanup removes. pixelDiff has
    // already rasterized both sides into its own tmpDir, so the montage still builds.
    if (opts.bless && drifted.length) {
      renameSync(outPdf, golden);
      result.blessed = true;
    }
  } finally {
    cleanup.forEach((p) => { try { rmSync(p, { force: true }); } catch { /* ignore */ } });
  }
  const worst = diff.perPage.reduce((m, p) => Math.max(m, p.total ? p.pixels / p.total : (p.pixels > 0 ? 1 : 0)), 0);
  result.themes[key] = {
    status: drifted.length ? 'DRIFT' : 'ok',
    pages: diff.pages,
    worstFraction: worst,
    drifted: drifted.map((p) => ({ page: p.page, pixels: p.pixels, total: p.total, note: p.note, oldPng: p.oldPng, newPng: p.newPng, diffPng: p.diffPng })),
    golden: relative(ROOT, golden),
    tmpDir: diff.tmpDir,
  };
  if (drifted.length) result.fail = true;
  return result;
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

  // SCOPE defaults to `all`, and that is deliberate. This gate's whole subject is that
  // the set of watched artifacts must equal the set of committed ones (#1279, #1379);
  // a default that silently covers a third of them re-creates the defect in a new place.
  // `--scope galleries` restores the pre-#1379 (faster) run when that is what you want.
  const scopeIdx = args.indexOf('--scope');
  // `--bless` with NO explicit scope means GALLERIES, not everything. `npm run bless` is
  // documented as "re-render the gallery goldens", and letting the widened default reach
  // the deck scope turned it into a 35-minute 185-deck sweep that silently rewrote every
  // drifted example PDF into whatever commit you were making — banking unreviewed drift as
  // a side effect of re-blessing one gallery. The CHECK default stays `all`, because a
  // gate that silently covers a third of the corpus is the defect this tool exists to
  // catch; blessing is the direction where a surprise is expensive. (HARD RULE #25 checker.)
  const scope = scopeIdx >= 0 ? args[scopeIdx + 1] : (args.includes('--bless') ? 'galleries' : 'all');
  if (!['all', 'galleries', 'decks'].includes(scope)) {
    process.stderr.write(`error: --scope must be all | galleries | decks (got "${scope}")\n`);
    return 2;
  }
  const wantGalleries = scope === 'all' || scope === 'galleries';
  const wantDecks = scope === 'all' || scope === 'decks';

  // `--only` matches a gallery stem (`kpi`, `chart`) or a deck golden by REPO-RELATIVE PATH
  // (`examples/pricing`, with or without the extension). Deliberately NOT by bare basename:
  // twelve gallery stems collide with deck-golden basenames (`funnel`, `map`, `state-chart`,
  // `pricing`, `scene`, `video`, `inventory` — which matches two at once — `logo-wall`,
  // `q-and-a`, `policy-recommendation`, `cycle`), so `--bless --only pricing` aimed at the
  // gallery would also re-bless `examples/pricing.pdf`. A path is unambiguous by construction.
  // (HARD RULE #25 red team.)
  const matchesOnly = (md) => {
    if (!only) return true;
    const full = goldenDeckName(md);
    return full === only || full === only.replace(/\.md$/, '');
  };

  let galleries = wantGalleries ? galleryDecks() : [];
  if (only) galleries = galleries.filter((d) => deckName(d) === only);
  let goldens = wantDecks ? deckGoldens() : [];
  if (only) goldens = goldens.filter(matchesOnly);

  // The two scopes bless by DIFFERENT primitives, so `--bless` handles each on its own
  // terms rather than picking one:
  //
  //   · GALLERIES delegate to build-galleries / build-bucket-galleries, which overwrite
  //     their goldens outright. Unchanged from before this scope existed. Once blessed
  //     there is nothing left to compare, so they drop out of the run below — otherwise
  //     `--bless` would re-render all 150 and then diff them against themselves.
  //   · DECK GOLDENS fall THROUGH into the comparison with `bless: true`, so only the
  //     ones that actually drifted are rewritten. Blindly re-rendering the scope would
  //     rewrite every file blessed on a different machine — Skia's rasterization is not
  //     bit-identical across hosts — to land a handful of real changes.
  let decks = galleries;
  // The "nothing matched" guard runs BEFORE the bless branch, not after it. With it below,
  // a typo'd `--bless --only zzz` found no gallery to bless and no golden to compare, hit
  // `return 0`, and reported success having refreshed nothing — the worst direction for a
  // bless command to fail, and a regression against main, which threw. (HARD RULE #25.)
  if (!decks.length && !goldens.length) {
    process.stderr.write(only ? `error: nothing named "${only}" in scope "${scope}"\n` : `error: no targets found in scope "${scope}"\n`);
    return 2;
  }

  if (blessMode) {
    if (decks.length) {
      bless(only);
      if (!json) process.stdout.write(`blessed ${only ? `gallery "${only}"` : 'all galleries'} — commit the refreshed PDFs.\n`);
      decks = [];
    }
    // SAY WHAT THE DEFAULT DID NOT DO. The scope defaults above are asymmetric on purpose —
    // check means `all`, bless means `galleries` — and the corpus rots along that seam: an
    // author who lands a shared CSS change and runs `npm run bless` has refreshed 150
    // artifacts and left 199, with nothing in the session saying so. Measured 2026-08-24,
    // the morning after the nightly gate went in: 184 of 199 deck goldens drifted against 12
    // of 150 gallery goldens, and the three most recent blesses (#1777, #1801, #1804) had all
    // taken this default. This line does NOT go and measure the deck drift — that is a
    // multi-hour render, and defeating the narrow default is the one thing the default is
    // for. It just stops the omission being silent.
    // (engineering/decisions/2026-08-24-golden-corpus-re-bless.md §4.)
    if (scopeIdx < 0 && !json) {
      process.stdout.write(
        'NOTE: --bless defaults to GALLERIES. The deck scope (examples/, exemplars/, design/, ' +
          'themes/, the CI baseline) was NOT touched.\n' +
          '      If your change moves them too: node tools/regression-gate.mjs --scope decks --bless\n',
      );
    }
    if (!goldens.length) return 0;
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

  for (const md of goldens) {
    const r = runDeckGolden(md, { bless: blessMode });
    const tr = r.themes.golden;
    if (tr?.status === 'DRIFT') {
      const artifact = buildMontage(r.name.replace(/[/\\]/g, '_'), 'golden', tr);
      if (artifact) tr.artifact = relative(ROOT, artifact);
    }
    // Drop pixelDiff's rasterized PNGs once the montage has been built from them. It
    // never cleans its own tmpDir, which was survivable at 75 galleries and is not at
    // 185 decks: a few sweeps left 502 directories and 1.3GB under /tmp, and the next
    // run of the SAME deck went from 7.7s to ~3 minutes. Measured, after chasing it as
    // a regression in this tool. A DRIFTED deck keeps its directory — the report points
    // reviewers at those PNGs.
    if (tr?.status !== 'DRIFT' && tr?.tmpDir) {
      try { rmSync(tr.tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
      tr.tmpDir = undefined;
    }
    report.push(r);
    // A BLESSED golden is not a failure — the drift was resolved by this very run, so
    // reporting it red (and telling the reader to "re-bless") would be a lie about what
    // just happened, and would give `--bless` a non-zero exit on success.
    if (r.fail && !r.blessed) anyFail = true;
    if (!json) {
      const s = tr?.status === 'ok' ? 'ok'
        : tr?.status === 'DRIFT'
          ? `${r.blessed ? 'BLESSED' : 'DRIFT'}(${tr.drifted.length}pg, worst ${(tr.worstFraction * 100).toFixed(2)}%)`
          : (tr?.status ?? '?');
      process.stdout.write(`${r.fail && !r.blessed ? '✗' : '✓'} ${r.name.padEnd(46)} ${s}\n`);
    }
  }

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  if (json) {
    process.stdout.write(JSON.stringify({ ok: !anyFail, fuzz: FUZZ, failFraction: FAIL_FRACTION, failFractionMermaid: FAIL_FRACTION_MERMAID, report }, null, 2) + '\n');
  } else {
    const failed = report.filter((r) => r.fail && !r.blessed);
    const blessed = report.filter((r) => r.blessed);
    const parts = [];
    if (decks.length) parts.push(`${decks.length} galleries × ${THEMES.length} moods`);
    if (goldens.length) parts.push(`${goldens.length} deck goldens`);
    process.stdout.write(`\n${parts.join(' + ')}. `);
    if (blessed.length) process.stdout.write(`${blessed.length} re-blessed — commit the refreshed PDFs. `);
    process.stdout.write(anyFail ? `${failed.length} DRIFTED: ${failed.map((r) => r.name).join(', ')}\n` : 'all match committed goldens.\n');
    if (anyFail) {
      process.stdout.write(`Artifacts: ${relative(ROOT, OUT)}/. Re-bless with: node tools/regression-gate.mjs --bless [--only <name>]\n`);
    }
  }
  return anyFail ? 1 : 0;
}

process.exit(main());
