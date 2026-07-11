/**
 * build-showcase-galleries — GENERATED consolidated cross-bucket showcase decks.
 *
 * A per-bucket gallery (tools/build-bucket-galleries.js) surveys ONE bucket. A
 * showcase spans a SET of buckets in one deck — for the moments a single
 * consolidated walk reads better than N family decks. Today there is one:
 *
 *   data-viz — every chart component + math, the surfaces the old-browser
 *              colour fallback covers (engineering/decisions/
 *              2026-07-11-old-browser-chart-fallback.md). Doubles as the manual
 *              LG-C4 / old-engine test artifact and a Playground demonstration.
 *
 * Like the bucket galleries it is COMPOSED FROM THE LIVE MANIFEST SET (each
 * component's `manifest.sample`), so it CANNOT go stale: add a chart or math
 * component and it appears in the next rebuild automatically. The BLOCKING guard
 * is the render-free unit gate (test/unit/tools/showcase-galleries.test.js): it
 * fails if the committed deck drifts from the manifests, and asserts the deck's
 * component set matches the colour-fallback's scanned set so the two can never
 * diverge. `--check` here is a developer convenience (content drift), deliberately
 * NOT wired into build:check/CI — the unit gate is the one that runs there.
 *
 * Output per showcase:
 *   examples/<id>-gallery.md              (the deck — Playground-selectable)
 *   examples/<id>-gallery.<theme>.pdf     (light + dark render / review baseline)
 *
 * Usage:
 *   node tools/build-showcase-galleries.js            # build all, both themes
 *   node tools/build-showcase-galleries.js --check    # verify freshness
 *   node tools/build-showcase-galleries.js --theme light
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { loadAll, groupByBucket } = require('../lib/components');
const { injectDark, THEMES } = require('./build-galleries');
const { composeGalleryMarkdown } = require('./build-bucket-galleries');

const ROOT = path.join(__dirname, '..');
const EXAMPLES_DIR = path.join(ROOT, 'examples');
const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
const THEME_CSS = path.join(ROOT, 'dist', 'lattice.css');

// The consolidated showcases. `buckets` drives membership off the live manifest
// set — never a hand-listed component roster that could rot.
const SHOWCASES = Object.freeze([
  {
    id: 'data-viz',
    title: 'Data visualization',
    blurb: 'Every chart and math component in one deck — the surfaces the old-browser colour fallback covers.',
    buckets: ['chart', 'math'],
  },
]);

function showcaseById(id) {
  return SHOWCASES.find((s) => s.id === id);
}
function galleryMarkdownPath(id) {
  return path.join(EXAMPLES_DIR, `${id}-gallery.md`);
}
function galleryPdfPath(id, theme) {
  return path.join(EXAMPLES_DIR, `${id}-gallery.${theme}.pdf`);
}

/** Manifests for a showcase, bucket order preserved, catalog order within. */
function showcaseManifests(showcase, groups) {
  return showcase.buckets.flatMap((b) => groups[b] || []);
}

/** The component NAMES a showcase covers — the anti-staleness contract the unit
 *  gate checks against the colour-fallback's scanned set. */
function showcaseComponentNames(id, groups = groupByBucket(loadAll())) {
  const s = showcaseById(id);
  return s ? showcaseManifests(s, groups).map((m) => m.name) : [];
}

function composeShowcase(showcase, groups) {
  return composeGalleryMarkdown({
    title: showcase.title,
    blurb: showcase.blurb,
    manifests: showcaseManifests(showcase, groups),
    surveyLabel: (m) => `${m.name} · ${showcase.id} gallery`,
  });
}

function buildOne(showcase, groups, theme) {
  const md = composeShowcase(showcase, groups);
  const mdPath = galleryMarkdownPath(showcase.id);
  const outPdf0 = galleryPdfPath(showcase.id, theme);
  // Idempotent: if the source .md already matches the manifests AND the PDF is
  // present, this deck is fresh — skip the render entirely. This keeps the
  // pre-commit rebuild a no-op for an up-to-date deck (no wasted Chromium, and no
  // transient .tmp.md/.html in examples/ racing a parallel check-ownership scan).
  const mdFresh = fs.existsSync(mdPath) && fs.readFileSync(mdPath, 'utf8') === md;
  if (mdFresh && fs.existsSync(outPdf0) && fs.statSync(outPdf0).size > 10000) {
    return { id: showcase.id, theme, skipped: true };
  }
  // Persist the light-theme markdown as the canonical source (dark is injected).
  if (theme === 'light' && !mdFresh) fs.writeFileSync(mdPath, md);
  const mdSource = theme === 'dark' ? injectDark(md) : md;
  const tmpPath = mdPath.replace(/\.md$/, `.${theme}.tmp.md`);
  const outPdf = galleryPdfPath(showcase.id, theme);
  try {
    fs.writeFileSync(tmpPath, mdSource);
    execFileSync(process.execPath, [EMULATOR, tmpPath, THEME_CSS, outPdf, 'indaco', '-q'],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  } finally {
    for (const p of [tmpPath, tmpPath.replace(/\.md$/, '.html'), outPdf.replace(/\.pdf$/, '.html')]) {
      try { fs.unlinkSync(p); } catch { /* ignore */ }
    }
  }
  const ok = fs.existsSync(outPdf) && fs.statSync(outPdf).size > 10000;
  return { id: showcase.id, theme, members: showcaseManifests(showcase, groups).length, bytes: ok ? fs.statSync(outPdf).size : 0, failed: !ok };
}

function checkOne(showcase, groups, theme) {
  const mdPath = galleryMarkdownPath(showcase.id);
  const outPdf = galleryPdfPath(showcase.id, theme);
  if (!fs.existsSync(mdPath)) return { id: showcase.id, theme, stale: true, reason: 'no source .md' };
  if (!fs.existsSync(outPdf)) return { id: showcase.id, theme, stale: true, reason: 'missing PDF' };
  if (composeShowcase(showcase, groups) !== fs.readFileSync(mdPath, 'utf8')) {
    return { id: showcase.id, theme, stale: true, reason: 'source .md drifted from manifests (a component was added/changed)' };
  }
  // CONTENT-based freshness only — mtime ordering of .md vs .pdf is nondeterministic
  // across a git checkout/rebase, and buildOne's skip is content-based, so an
  // mtime clause here would report "stale" that a rebuild can never clear.
  return { id: showcase.id, theme, stale: false };
}

function main(argv) {
  const args = new Set(argv.filter((a) => a.startsWith('--')));
  const themeIdx = argv.indexOf('--theme');
  const themeFilter = themeIdx >= 0 ? argv[themeIdx + 1] : null;
  const checkMode = args.has('--check');
  if (themeFilter && !THEMES.includes(themeFilter)) {
    process.stderr.write(`error: --theme must be one of ${THEMES.join(', ')}\n`);
    return 2;
  }
  const targetThemes = themeFilter ? [themeFilter] : THEMES;
  const groups = groupByBucket(loadAll());
  const stale = [];
  const failures = [];
  let built = 0;
  let upToDate = 0;

  for (const showcase of SHOWCASES) {
    for (const theme of targetThemes) {
      if (checkMode) {
        const r = checkOne(showcase, groups, theme);
        if (r.stale) stale.push(r); else upToDate += 1;
        continue;
      }
      try {
        const r = buildOne(showcase, groups, theme);
        if (r.skipped) { upToDate += 1; process.stdout.write(`· ${r.id} [${theme}]: already fresh\n`); }
        else if (r.failed) { failures.push(r); process.stderr.write(`✗ ${r.id} [${theme}]: render failed\n`); }
        else { built += 1; process.stdout.write(`✓ ${r.id} [${theme}]: ${r.members} members, ${(r.bytes / 1024).toFixed(0)}kb\n`); }
      } catch (e) {
        failures.push({ id: showcase.id, theme, error: e.message });
        process.stderr.write(`✗ ${showcase.id} [${theme}]: ${e.message}\n`);
      }
    }
  }

  if (checkMode) {
    if (stale.length === 0) { process.stdout.write(`✓ all ${upToDate} showcase-gallery PDFs up to date\n`); return 0; }
    process.stderr.write(`✗ ${stale.length} showcase-gallery PDFs are stale:\n`);
    for (const s of stale) process.stderr.write(`    ${s.id} [${s.theme}]: ${s.reason}\n`);
    process.stderr.write('  Run `npm run build:showcase-galleries` to refresh.\n');
    return 1;
  }
  process.stdout.write(`\n${built} PDFs built, ${failures.length} failed.\n`);
  return failures.length === 0 ? 0 : 1;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { SHOWCASES, showcaseComponentNames, galleryMarkdownPath, composeShowcase };
