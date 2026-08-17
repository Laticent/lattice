// Golden before/after — what visually changed in THIS PR's committed goldens.
// Post a PR comment + before/after montage of the gallery slides whose committed golden moved vs the base branch.
//
// The regression gate (tools/regression-gate.mjs) answers the AUTHOR's question:
// "did I bless correctly?" (a fresh render == the committed golden). This tool
// answers the REVIEWER's question: "what does the intended visual change look
// like?" — by diffing the PR's committed golden PDFs against the base branch's,
// rasterizing only the slides that VISUALLY changed, and emitting a
// before │ after │ overlay montage PDF plus a markdown summary CI posts as a PR
// comment.
//
// WHY pixel-diff and not the git diff alone: a re-bless with no visual change can
// still show up in `git diff`. As of the timestamp pin (lib/core/pdf-timestamps.js)
// two renders on ONE machine are byte-identical, so same-machine clock churn is
// gone — but a golden blessed on a different machine still differs, because Skia's
// rasterization is CPU-dispatched and not bit-identical across hosts. That band is
// WIDE on the deck scope — most decks under 2%, but 29 over 5% and one at 64% with
// a page-count flip; see 2026-06-12-p4-regression-gate-retire-marp.md §0a before
// reading any drift number as a regression. We use the git
// diff only as the cheap candidate filter, then rasterize and pixel-diff (the
// same comparator + tolerance the gate uses) so the report counts only slides
// that actually moved. A rebuild-only golden → 0 changed slides → "no visual
// change". See engineering/decisions/2026-06-12-p4-regression-gate-retire-marp.md §4.
//
// Usage:
//   node tools/golden-diff.mjs [--base <ref>] [--json]
//     --base   git ref/sha to diff against (default: origin/main)
//
// Output (under .scratch/golden-diff/):
//   changes.pdf   — combined before│after│overlay montage (CI artifact); only
//                   written when ≥1 slide changed
//   montages/     — one before│after│overlay PNG per changed slide, stable-named
//                   <name>.<mood>.s<NNN>.png. CI pushes these to the orphan
//                   `ci-drift-images` branch and embeds the raw URLs inline in the
//                   PR comment (report.inlineMontages is the capped embed list).
//   summary.md    — markdown comment body, table + pointers (always written); CI
//                   appends the inline images from report.inlineMontages.
//   report.json   — { changed, slides, galleries, montages, inlineMontages, … }
//
// Exit 0 always — this is informational and never gates (the regression gate is
// the blocker). A git/tool failure exits 2 so CI surfaces a broken run.

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { pixelDiff, montageTriptych, pngsToPdf } = require('./pixel-check.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '.scratch', 'golden-diff');
const MONTAGE_DIR = join(OUT, 'montages');

// Cap how many before/after montages embed INLINE in the PR comment — a
// shared-CSS change can move hundreds of slides, and a comment full of stacked
// images is unreadable. The first INLINE_CAP (most-changed galleries first) embed
// inline; the complete set always lives in the changes.pdf artifact.
const INLINE_CAP = 8;

// Mirror the regression gate's tolerance so "what changed" agrees with "what the
// gate would catch": a page counts as changed only if its over-fuzz pixel count
// exceeds FAIL_FRACTION of the page (AA shimmer from rasterization is not drift).
const FUZZ = '3%';
const FAIL_FRACTION = 0.0005;

// A committed golden: lib/components/**/<name>.gallery.{light,dark}.pdf.
const GOLDEN_RE = /\.gallery\.(light|dark)\.pdf$/;

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

// Candidate goldens this PR touched at all (byte-level git diff — the cheap
// filter; visual truth comes from the pixel-diff below).
function changedGoldens(base) {
  let raw;
  try {
    // `lib/` and not `lib/components`: the pathspec used to stop at the components
    // tree, so `lib/base/_logo/logo.gallery.{light,dark}.pdf` — two committed goldens
    // GOLDEN_RE matches perfectly well — moved their pixels with no montage on the PR.
    // Demonstrated, not theorized: #1275 regenerated both and this reported 4
    // gallery-moods rather than 6 (#1279).
    raw = git(['diff', '--name-only', base, '--', 'lib']);
  } catch (err) {
    process.stderr.write(`golden-diff: git diff against "${base}" failed: ${err.message}\n`);
    process.exit(2);
  }
  return raw.split('\n').map((s) => s.trim()).filter((p) => GOLDEN_RE.test(p)).sort();
}

// Write the base-branch blob of a path to a temp file; null if it didn't exist
// on base (a newly-added golden).
function baseBlob(base, relPath, tmp) {
  try {
    const buf = execFileSync('git', ['show', `${base}:${relPath}`], { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 });
    writeFileSync(tmp, buf);
    return tmp;
  } catch {
    return null; // added on this branch — no base version
  }
}

// Pretty name + mood from a golden path: …/<name>.gallery.<mood>.pdf
function describe(relPath) {
  const m = relPath.match(/([^/]+)\.gallery\.(light|dark)\.pdf$/);
  return { name: m ? m[1] : relPath, mood: m ? m[2] : '?' };
}

function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const baseIdx = args.indexOf('--base');
  const base = baseIdx >= 0 ? args[baseIdx + 1] : 'origin/main';

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(MONTAGE_DIR, { recursive: true });

  const candidates = changedGoldens(base);
  const entries = []; // { name, mood, relPath, status, slides, montages: [png] }
  const montagePngs = []; // absolute paths under MONTAGE_DIR, for the changes.pdf artifact
  const montageMeta = []; // { name, mood, page, file } — file is the stable basename

  for (const relPath of candidates) {
    const { name, mood } = describe(relPath);
    const headPath = join(ROOT, relPath);
    const tmpBase = join(OUT, `.base-${name}.${mood}.pdf`);
    const base0 = baseBlob(base, relPath, tmpBase);

    if (!existsSync(headPath)) {
      entries.push({ name, mood, relPath, status: 'removed', slides: 0 });
      if (base0) rmSync(base0, { force: true });
      continue;
    }
    if (!base0) {
      entries.push({ name, mood, relPath, status: 'added', slides: 0 });
      continue;
    }

    const diff = pixelDiff(base0, headPath, `golden-${name}-${mood}`, { fuzz: FUZZ });
    rmSync(base0, { force: true });
    const drifted = diff.perPage.filter(
      (p) => p.pixels === -1 || (p.total ? p.pixels / p.total > FAIL_FRACTION : p.pixels > 0),
    );
    if (!drifted.length) {
      entries.push({ name, mood, relPath, status: 'rebuild-only', slides: 0 });
      continue;
    }
    // Montage each changed slide. montageTriptych returns null when a tile is
    // missing, so the page-add/remove sentinels (one of old/new is null) are
    // skipped automatically; a page-RESIZE sentinel keeps both tiles and IS
    // montaged on purpose (a geometry change is a real visual diff to show).
    for (const d of drifted) {
      const m = join(diff.tmpDir, `gd-${name}-${mood}-${String(d.page).padStart(3, '0')}.png`);
      const made = montageTriptych(d, m, { title: `${name} · ${mood} · slide ${d.page}` });
      if (!made) continue;
      // Persist into MONTAGE_DIR under a stable, URL-safe, COLLISION-FREE basename
      // so CI can push it to the image branch and embed a deterministic raw URL.
      // The basename derives from the full relPath (which is unique), NOT from
      // `name` — gallery leaf names repeat across buckets (diagram, code, math all
      // exist at both bucket and component level), so a name-based file would let
      // cpSync silently overwrite one montage with another. `name`/`mood` stay for
      // the human caption/table; only the file is path-keyed.
      const slug = relPath.replace(/^lib\/components\//, '').replace(/\.pdf$/, '').replace(/[^a-z0-9]+/gi, '_');
      const file = `${slug}_s${String(d.page).padStart(3, '0')}.png`;
      const dest = join(MONTAGE_DIR, file);
      cpSync(made, dest);
      montagePngs.push(dest);
      montageMeta.push({ name, mood, page: d.page, file });
    }
    entries.push({ name, mood, relPath, status: 'changed', slides: drifted.length });
  }

  const changedEntries = entries.filter((e) => e.status === 'changed');
  const totalSlides = changedEntries.reduce((n, e) => n + e.slides, 0);
  const added = entries.filter((e) => e.status === 'added');
  const removed = entries.filter((e) => e.status === 'removed');
  const changed = changedEntries.length > 0 || added.length > 0 || removed.length > 0;

  let artifact = null;
  if (montagePngs.length) artifact = pngsToPdf(montagePngs, join(OUT, 'changes.pdf'));

  // ── summary.md (the PR comment body) ────────────────────────────────────────
  const lines = ['### 🖼️ Golden before/after vs base', ''];
  if (!changed) {
    lines.push('✅ **No visual changes** to committed goldens on this branch.');
  } else {
    if (changedEntries.length) {
      lines.push(`**${totalSlides} slide${totalSlides === 1 ? '' : 's'} changed** across ${changedEntries.length} gallery·mood${changedEntries.length === 1 ? '' : 's'}.`, '');
      lines.push('| Gallery | Mood | Slides changed |', '|---|---|---|');
      for (const e of changedEntries.sort((a, b) => b.slides - a.slides || a.name.localeCompare(b.name))) {
        lines.push(`| \`${e.name}\` | ${e.mood} | ${e.slides} |`);
      }
      lines.push('');
      lines.push(artifact
        ? '↪ Flip through the full **before │ after │ overlay** montage in the **`golden-diff-changes`** artifact below.'
        : '_(montage artifact unavailable — ImageMagick `montage`/`convert` missing on the runner.)_');
    }
    if (added.length) lines.push('', `🆕 New goldens (no base to compare): ${added.map((e) => `\`${e.name}.${e.mood}\``).join(', ')}.`);
    if (removed.length) lines.push('', `🗑️ Removed goldens: ${removed.map((e) => `\`${e.name}.${e.mood}\``).join(', ')}.`);
    lines.push('', '_Rebuild-only goldens (PDF byte-churn, no pixels moved) are not listed — the pixel-diff filters them out._');
  }
  const summary = lines.join('\n') + '\n';
  writeFileSync(join(OUT, 'summary.md'), summary);

  // Pick the INLINE_CAP montages to embed: most-changed gallery·mood first (the
  // same ordering the summary table uses), then by name/page — so the inline
  // images and the table spotlight the SAME galleries. The full set (every
  // montage, candidate order) always lives in the changes.pdf artifact.
  const slidesByKey = new Map(changedEntries.map((e) => [`${e.name}.${e.mood}`, e.slides]));
  const inlineOrder = [...montageMeta].sort(
    (a, b) =>
      (slidesByKey.get(`${b.name}.${b.mood}`) || 0) - (slidesByKey.get(`${a.name}.${a.mood}`) || 0) ||
      a.name.localeCompare(b.name) ||
      a.page - b.page,
  );

  const report = {
    base,
    changed,
    totalSlides,
    galleries: entries,
    artifact: artifact ? 'changes.pdf' : null,
    montagesDir: 'montages',
    montages: montageMeta,
    inlineMontages: inlineOrder.slice(0, INLINE_CAP),
    inlineCapped: montageMeta.length > INLINE_CAP,
  };
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));

  if (json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    process.stdout.write(summary);
    if (artifact) process.stdout.write(`\nmontage: ${join('.scratch', 'golden-diff', 'changes.pdf')}\n`);
  }
  return 0;
}

process.exit(main());
