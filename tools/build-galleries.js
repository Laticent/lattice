#!/usr/bin/env node
/**
 * Build per-component gallery PDFs in light and dark themes.
 *
 * Every enriched component has a generated <name>.gallery.md sibling
 * (produced by tools/build-component-docs.js). This tool renders each
 * one twice:
 *
 *   <name>.gallery.light.pdf   — the source as authored
 *   <name>.gallery.dark.pdf    — the same source with `dark` injected
 *                                into every `<!-- _class: ... -->`
 *                                directive, so each slide is rendered
 *                                in the dark universal variant
 *
 * The two PDFs together form the component's self-documenting catalog
 * entry — every variant in both moods. See engineering/decisions/2026-05-18-
 * component-reorg-and-modular-css.md (Phase 2).
 *
 * Bucket galleries (Phase 5) reuse the same dark-injection pattern via
 * tools/build-bucket-galleries.js.
 *
 * Usage:
 *   node tools/build-galleries.js                  # all components, both themes
 *   node tools/build-galleries.js --only kpi       # one component, both themes
 *   node tools/build-galleries.js --theme light    # all components, one theme
 *   node tools/build-galleries.js --check          # has any render input changed since HEAD?
 *
 * Exit codes:
 *   0  every requested PDF built (or up-to-date in --check mode)
 *   1  a render failed; the PDF is missing or empty
 *   2  --only target not found
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { loadAll } = require('../lib/components');
const { targetPaths, isEnriched } = require('./build-component-docs');
const { stalenessAgainstInputs } = require('./lib/render-inputs');

const ROOT = path.join(__dirname, '..');
const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
const THEME = path.join(ROOT, 'dist', 'lattice.css');

const THEMES = ['light', 'dark'];

// Append `dark` to every `<!-- _class: ... -->` directive that doesn't
// already carry it. Idempotent: a slide that already includes `dark`
// is left untouched. Other tokens (palette names, layout-specific
// modifiers) are preserved verbatim.
function injectDark(markdown) {
  return markdown.replace(
    /<!--\s*_class:\s*([^>]+?)\s*-->/g,
    (whole, classList) => {
      const tokens = classList.split(/\s+/).filter(Boolean);
      if (tokens.includes('dark')) return whole;
      tokens.push('dark');
      return `<!-- _class: ${tokens.join(' ')} -->`;
    },
  );
}

function pdfPathForTheme(m, theme) {
  const gallery = targetPaths(m).gallery;
  const base = gallery.replace(/\.gallery\.md$/, '');
  return `${base}.gallery.${theme}.pdf`;
}

function sourceForTheme(m, theme) {
  const gallery = targetPaths(m).gallery;
  const md = fs.readFileSync(gallery, 'utf8');
  return theme === 'dark' ? injectDark(md) : md;
}

// The emulator writes a .html sidecar next to every .pdf it renders.
// Useful when debugging by hand; just clutter when build-galleries.js
// is what produced the PDF. Remove it after each successful build so
// the component folder stays tidy (only the .gallery.{light,dark}.pdf
// pair lives there).
function cleanHtmlSidecar(pdfPath) {
  const htmlPath = pdfPath.replace(/\.pdf$/, '.html');
  try { fs.unlinkSync(htmlPath); } catch { /* ignore — never existed */ }
}

function buildOne(m, theme) {
  const galleryMd = targetPaths(m).gallery;
  if (!fs.existsSync(galleryMd)) {
    return { name: m.name, theme, skipped: true, reason: 'no gallery.md' };
  }
  const outPdf = pdfPathForTheme(m, theme);

  if (theme === 'light') {
    // Render the source as authored.
    execFileSync(
      process.execPath,
      // PALETTE PIN — DELIBERATE, and deliberately NOT the engine default.
      // Galleries are a REFERENCE surface: holding one palette fixed is what keeps a
      // component diff readable across time (#8). The engine default is cuoio
      // (lib/core/default-palette.mjs); this stays indaco on purpose. Do not "fix" it to
      // track the default — that re-renders every gallery on any future default change.
      [EMULATOR, galleryMd, THEME, outPdf, 'indaco', '-q'],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } else {
    // Render a dark-injected copy from a temp file. The temp file lives
    // alongside the gallery so any relative @import paths resolve.
    const tmpMd = galleryMd.replace(/\.gallery\.md$/, `.gallery.${theme}.tmp.md`);
    try {
      fs.writeFileSync(tmpMd, sourceForTheme(m, theme));
      execFileSync(
        process.execPath,
        // PALETTE PIN — DELIBERATE, and deliberately NOT the engine default.
        // Galleries are a REFERENCE surface: holding one palette fixed is what keeps a
        // component diff readable across time (#8). The engine default is cuoio
        // (lib/core/default-palette.mjs); this stays indaco on purpose. Do not "fix" it to
        // track the default — that re-renders every gallery on any future default change.
        [EMULATOR, tmpMd, THEME, outPdf, 'indaco', '-q'],
        { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
      );
    } finally {
      try { fs.unlinkSync(tmpMd); } catch { /* ignore */ }
      // The emulator's HTML sidecar for the tmp source uses the tmp's
      // basename; clean both possible names just in case.
      cleanHtmlSidecar(outPdf);
      const tmpHtml = tmpMd.replace(/\.md$/, '.html');
      try { fs.unlinkSync(tmpHtml); } catch { /* ignore */ }
    }
  }
  cleanHtmlSidecar(outPdf);

  const ok = fs.existsSync(outPdf) && fs.statSync(outPdf).size > 10000;
  return {
    name: m.name,
    theme,
    pdfPath: outPdf,
    bytes: ok ? fs.statSync(outPdf).size : 0,
    failed: !ok,
  };
}

// Staleness against ALL of this PDF's inputs, not just its own markdown — the layout
// bundle, the palettes and the transform kernel all shape the render, and a CSS-only
// change (which is most of them) leaves the deck untouched. Comparing that one mtime is
// what made this gate report "up to date" across 122 galleries that had visibly moved.
// tools/lib/render-inputs.js explains why it asks git rather than the filesystem clock,
// and what it still cannot see; golden-diff.mjs is the pixel-accurate gate.
function checkOne(m, theme) {
  const outPdf = pdfPathForTheme(m, theme);
  const galleryMd = targetPaths(m).gallery;
  if (!fs.existsSync(outPdf)) return { name: m.name, theme, stale: true, reason: 'missing' };
  if (!fs.existsSync(galleryMd)) return { name: m.name, theme, stale: false };
  return { name: m.name, theme, ...stalenessAgainstInputs(outPdf, galleryMd) };
}

function main(argv) {
  const args = new Set(argv.filter((a) => a.startsWith('--')));
  const onlyIdx = argv.indexOf('--only');
  const themeIdx = argv.indexOf('--theme');
  const only = onlyIdx >= 0 ? argv[onlyIdx + 1] : null;
  const themeFilter = themeIdx >= 0 ? argv[themeIdx + 1] : null;
  const checkMode = args.has('--check');

  if (themeFilter && !THEMES.includes(themeFilter)) {
    process.stderr.write(`error: --theme must be one of ${THEMES.join(', ')}\n`);
    return 2;
  }

  const targetThemes = themeFilter ? [themeFilter] : THEMES;
  const manifests = loadAll();
  const filtered = only ? manifests.filter((m) => m.name === only) : manifests;
  if (only && filtered.length === 0) {
    process.stderr.write(`error: no component named "${only}"\n`);
    return 2;
  }
  const enriched = filtered.filter(isEnriched);
  const skipped = filtered.length - enriched.length;

  const failures = [];
  const stale = [];
  let built = 0;
  let upToDate = 0;

  for (const m of enriched) {
    for (const theme of targetThemes) {
      if (checkMode) {
        const r = checkOne(m, theme);
        if (r.stale) stale.push(r);
        else upToDate += 1;
        continue;
      }
      try {
        const r = buildOne(m, theme);
        if (r.skipped) continue;
        if (r.failed) {
          failures.push(r);
          process.stderr.write(`✗ ${m.name} [${theme}]: render failed\n`);
        } else {
          built += 1;
          process.stdout.write(`✓ ${m.name} [${theme}]: ${(r.bytes / 1024).toFixed(0)}kb\n`);
        }
      } catch (e) {
        failures.push({ name: m.name, theme, error: e.message });
        process.stderr.write(`✗ ${m.name} [${theme}]: ${e.message}\n`);
      }
    }
  }

  if (checkMode) {
    if (stale.length === 0) {
      // Deliberately NOT "up to date". All this establishes is that no render input
      // differs from HEAD; a change COMMITTED without rebuilding still looks sound here.
      // tools/golden-diff.mjs rasterizes and diffs, and is the freshness gate.
      process.stdout.write(
        `✓ ${upToDate} gallery PDFs: no render input changed since HEAD ` +
        '(golden-diff is the pixel gate)\n',
      );
      return 0;
    }
    process.stderr.write(`✗ ${stale.length} gallery PDFs are stale:\n`);
    for (const s of stale) {
      process.stderr.write(`    ${s.name} [${s.theme}]: ${s.reason}\n`);
    }
    process.stderr.write(`  Run \`npm run build:galleries\` to refresh.\n`);
    return 1;
  }

  process.stdout.write(
    `\n${built} PDFs built, ${failures.length} failed, ${skipped} components skipped (not enriched).\n`,
  );
  return failures.length === 0 ? 0 : 1;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { injectDark, pdfPathForTheme, buildOne, checkOne, THEMES };
