/**
 * build-showcase-galleries — GENERATED consolidated cross-bucket showcase decks.
 *
 * A per-bucket gallery (tools/build-bucket-galleries.js) surveys ONE bucket. A
 * showcase spans a SET of buckets in one deck — for the moments a single
 * consolidated walk reads better than N family decks. Today there is one:
 *
 *   data-viz — every chart component in one consolidated deck, a Playground
 *              demonstration of the whole charting surface.
 *
 * MATH USED TO BE PART OF `data-viz` AND IS NOT ANY MORE (2026-09). It was there
 * because it is rendered evidence, which is true and is not the same as being a
 * chart: a chart plots a dataset and a math slide typesets an expression, they
 * share no transform, no dataset shape and no reflow behavior, and a reader
 * walking "the data-visualization surface" to compare bar against waterfall does
 * not want an equation in the middle of it. Owner's framing: math is its own
 * extension, like mermaid — a component with variants, and therefore its own
 * gallery rather than a passenger in someone else's.
 *
 * IT DID NOT GAIN A SHOWCASE OF ITS OWN, and that was tried first. A showcase composes
 * one `manifest.sample` per component, so a single-component bucket makes a two-slide
 * deck — a cover and one equation — duplicating the bucket gallery that already exists
 * and earning nothing. The eight-variant survey is the COMPONENT gallery
 * (`lib/components/math/math/math.gallery.md`), which is where a variant walk belongs;
 * the hand-authored `examples/` deck is a demo, not a survey.
 *
 * Like the bucket galleries it is COMPOSED FROM THE LIVE MANIFEST SET (each
 * component's `manifest.sample`), so the DECK cannot go stale: add a chart
 * component and it appears in the next rebuild automatically. The BLOCKING guard
 * is the render-free unit gate (test/unit/tools/showcase-galleries.test.js): it
 * fails if the committed deck drifts from the manifests, and asserts the deck
 * walks the full chart set with no component silently omitted. `--check`
 * here is a developer convenience, deliberately NOT wired into build:check/CI —
 * the unit gate is the one that runs there.
 *
 * THE PDFs ARE A DIFFERENT QUESTION, and this file used to conflate them with the
 * deck (#2253). Freshness was one string compare — recomposed markdown against the
 * committed `.md` — so a change to engine CSS or a chart transform, which alters
 * every rendered slide and no manifest, left the comparison byte-identical and the
 * tool printed "already fresh". It now asks `tools/lib/render-inputs.js` the same
 * question the component and bucket builders ask: did anything a render consumes
 * change without the PDF being rebuilt? That is one `git status`, no Chromium, so
 * it stays cheap enough for the pre-commit path.
 *
 * The SECOND half of #2253 was the dark PDF. `buildOne` recomputed `mdFresh` per
 * theme, and the light pass writes the deck — so by the time the dark pass ran, its
 * own freshness test compared the markdown against the file light had just written,
 * found it identical, and skipped. A manifest change therefore rebuilt light and
 * silently left dark stale, every time. `mdFresh` is now measured ONCE per showcase,
 * before any theme renders, and passed in.
 *
 * Output per showcase:
 *   examples/<id>-gallery.md              (the deck — Playground-selectable)
 *   examples/<id>-gallery.<theme>.pdf     (light + dark render / review baseline)
 *
 * Usage:
 *   node tools/build-showcase-galleries.js            # build all, both themes
 *   node tools/build-showcase-galleries.js --check    # verify freshness
 *   node tools/build-showcase-galleries.js --dry-run  # what a build would do, no render
 *   node tools/build-showcase-galleries.js --theme light
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { loadAll, groupByBucket } = require('../lib/components');
const { injectDark, THEMES } = require('./build-galleries');
const { composeGalleryMarkdown } = require('./build-bucket-galleries');
const { stalenessAgainstInputs } = require('./lib/render-inputs');

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
    blurb: 'Every chart component in one deck — the full charting surface.',
    buckets: ['chart'],
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
 *  gate checks against the full chart+math manifest set. */
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

/**
 * Does this theme's PDF still need rendering? The BUILD path's skip test, split out so
 * a test can drive it without a Chromium render (`--dry-run` prints it).
 *
 * @param {boolean} mdFresh  whether the committed deck already matched the manifests
 *   WHEN THE RUN STARTED. Passed in, never recomputed here, because the light pass
 *   WRITES that file: a per-theme recompute made the dark pass compare the deck against
 *   what light had just written, find it identical and skip — so a manifest change
 *   rebuilt light and left dark stale, every time (#2253).
 * @returns {{fresh: boolean, reason: string}} `reason` names the arm that decided, so a
 *   dry run and a failing test both say WHY rather than just no.
 */
function buildFreshness(showcase, theme, mdFresh) {
  const mdPath = galleryMarkdownPath(showcase.id);
  const outPdf = galleryPdfPath(showcase.id, theme);
  if (!mdFresh) return { fresh: false, reason: 'source .md drifted from manifests' };
  if (!fs.existsSync(outPdf)) return { fresh: false, reason: 'missing PDF' };
  if (fs.statSync(outPdf).size <= 10000) return { fresh: false, reason: 'PDF is implausibly small' };
  // …and the inputs the deck says nothing about. This arm is what #2253 was missing:
  // engine CSS and chart transforms move every rendered slide and no manifest, so the
  // markdown compare above is byte-identical while every gantt on the page has changed.
  // It costs one memoized `git status` and cannot pull a render onto the per-PR path;
  // what it CAN do is re-render on a dirty tree, which is the right answer for a build —
  // a render is not wasted when the engine moved under it.
  const st = stalenessAgainstInputs(outPdf, mdPath);
  if (st.stale) return { fresh: false, reason: st.reason };
  return { fresh: true, reason: 'deck, PDF and render inputs all match' };
}

function buildOne(showcase, groups, theme, mdFresh) {
  const md = composeShowcase(showcase, groups);
  const mdPath = galleryMarkdownPath(showcase.id);
  // Idempotent: skip the render entirely when nothing that feeds it has moved. This
  // keeps the pre-commit rebuild a no-op for an up-to-date deck (no wasted Chromium,
  // and no transient .tmp.md/.html in examples/ racing a parallel check-ownership scan).
  if (buildFreshness(showcase, theme, mdFresh).fresh) {
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
  // …and the inputs the deck says nothing about. Same helper, same argument order and
  // same reasons as build-galleries.js and build-bucket-galleries.js: it asks git what
  // differs from HEAD, never an mtime, so it survives a fresh clone and ignores checkout
  // churn. It runs AFTER the drift check so the more specific reason wins.
  return { id: showcase.id, theme, ...stalenessAgainstInputs(outPdf, mdPath) };
}

function main(argv) {
  const args = new Set(argv.filter((a) => a.startsWith('--')));
  const themeIdx = argv.indexOf('--theme');
  const themeFilter = themeIdx >= 0 ? argv[themeIdx + 1] : null;
  const checkMode = args.has('--check');
  // `--dry-run` reports the BUILD path's verdict without spending a render. It exists so
  // the skip logic is testable at all: the bug it guards (#2253, the dark pass skipping
  // because light had just rewritten the deck) is only visible across two themes in one
  // run, and every other way of seeing it costs two real renders.
  const dryRun = args.has('--dry-run');
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
    // ONCE per showcase, before any theme renders — the light pass rewrites this file.
    const mdPath0 = galleryMarkdownPath(showcase.id);
    const mdFresh = fs.existsSync(mdPath0)
      && fs.readFileSync(mdPath0, 'utf8') === composeShowcase(showcase, groups);
    for (const theme of targetThemes) {
      if (checkMode) {
        const r = checkOne(showcase, groups, theme);
        if (r.stale) stale.push(r); else upToDate += 1;
        continue;
      }
      if (dryRun) {
        const f = buildFreshness(showcase, theme, mdFresh);
        if (f.fresh) { upToDate += 1; process.stdout.write(`· ${showcase.id} [${theme}]: already fresh\n`); }
        else { built += 1; process.stdout.write(`↻ ${showcase.id} [${theme}]: would rebuild — ${f.reason}\n`); }
        continue;
      }
      try {
        const r = buildOne(showcase, groups, theme, mdFresh);
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
  if (dryRun) {
    process.stdout.write(`\n${built} PDF(s) would be rebuilt, ${upToDate} already fresh (nothing rendered).\n`);
    return 0;
  }
  process.stdout.write(`\n${built} PDFs built, ${failures.length} failed.\n`);
  return failures.length === 0 ? 0 : 1;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { SHOWCASES, showcaseComponentNames, galleryMarkdownPath, galleryPdfPath, composeShowcase, buildFreshness, main };
