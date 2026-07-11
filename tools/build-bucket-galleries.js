#!/usr/bin/env node
/**
 * Build per-bucket survey gallery PDFs in light and dark themes.
 *
 * A bucket gallery is a curated walk through every component in one
 * bucket — one representative slide per component (drawn from the
 * manifest's `sample` field) plus an opening title slide that names
 * the bucket and lists its members. Output:
 *
 *   lib/components/<bucket>/<bucket>.gallery.light.pdf
 *   lib/components/<bucket>/<bucket>.gallery.dark.pdf
 *
 * For 9 buckets × 2 themes = 18 PDFs total. Generated, not hand-
 * authored: every component currently in the bucket appears,
 * regardless of when it was added. Adding a component to a bucket
 * automatically widens the next rebuild's gallery.
 *
 * See engineering/decisions/2026-05-18-component-reorg-and-modular-css.md (Phase 5).
 *
 * Usage:
 *   node tools/build-bucket-galleries.js                 # all buckets, both themes
 *   node tools/build-bucket-galleries.js --only chart    # one bucket
 *   node tools/build-bucket-galleries.js --theme light   # one theme
 *   node tools/build-bucket-galleries.js --check         # verify staleness
 *
 * Exit codes:
 *   0  every requested PDF built (or up-to-date in --check)
 *   1  a render failed; the PDF is missing or empty
 *   2  --only target not found
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { loadAll, groupByBucket, BUCKETS } = require('../lib/components');
const { injectDark, THEMES } = require('./build-galleries');
const { injectFooter } = require('./build-component-docs');

const ROOT = path.join(__dirname, '..');
const COMPONENTS_DIR = path.join(ROOT, 'lib', 'components');
const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
const THEME_CSS = path.join(ROOT, 'dist', 'lattice.css');

// Human-facing copy for the bucket title slides. Keep terse — the
// title slide is a wayfinder, not a tutorial. The audience-facing
// rationale lives in design/design-system.md §3.
const BUCKET_BLURBS = Object.freeze({
  anchor:      'Anchor — where you are in the deck.',
  statement:   'Statement — one declarative claim per slide.',
  inventory:   'Inventory — parallel sets of related items.',
  connect:     'Connect — cards the room can scan: join the network, save the speaker.',
  comparison:  'Comparison — how two or more options differ.',
  progression: 'Progression — ordered movement through stages or time.',
  evidence:    'Evidence — data that supports the argument.',
  imagery:     'Imagery — visuals that carry their own meaning.',
  chart:       'Chart — series-substance data visualizations (SVG kernel).',
  diagram:     'Diagram — graph-substance network visuals (external renderer).',
  math:        'Math — typeset equations and proofs.',
  code:        'Code — syntax-highlighted source code blocks.',
  legal:       'Legal — citation-aware layouts for statutes, obligations, and regulatory change.',
});

function bucketGalleryMarkdownPath(bucket) {
  return path.join(COMPONENTS_DIR, bucket, `${bucket}.gallery.md`);
}

// Hand-authored bucket galleries opt out of generation by embedding
// the marker comment `<!-- galleryAuthored ... -->` in the top of the
// .md source. Same pattern as the per-component `galleryAuthored: true`
// manifest flag, scaled up to a bucket whose composition is curated
// (e.g. `legal` — the legal-family domain story is richer than one
// slide per component).
const GALLERY_AUTHORED_MARKER = /<!--\s*galleryAuthored\b/;
function isBucketGalleryAuthored(bucket) {
  const mdPath = bucketGalleryMarkdownPath(bucket);
  if (!fs.existsSync(mdPath)) return false;
  const head = fs.readFileSync(mdPath, 'utf8').slice(0, 2000);
  return GALLERY_AUTHORED_MARKER.test(head);
}

function bucketGalleryPdfPath(bucket, theme) {
  return path.join(COMPONENTS_DIR, bucket, `${bucket}.gallery.${theme}.pdf`);
}

// Compose the bucket-survey markdown. Opens with a title slide (bucket
// name + member list), then one slide per component using its
// `manifest.sample` (which already includes the _class directive).
//
// Title slide follows the title.docs.md contract: `title silent` for
// chrome suppression in one token, ` `inline-code` ` eyebrow slot, and
// a single plain-paragraph subtitle. The member list moves into the
// subtitle as a single sentence so the title-slot shape is honored.
// Manifest samples reference assets with bare filenames relative to the
// component's own directory (e.g. `![bg](sample-image.svg)`). When composed into
// a gallery one directory up, those bare paths would resolve to the wrong dir.
// Prefix any markdown image ref whose URL is a bare filename (no slash, no
// protocol) with `<component>/` so it resolves to the component's actual asset.
function prefixAssetPaths(sample, componentName) {
  return sample.replace(
    /(!\[[^\]]*\]\()([^)/:]+\.(?:svg|png|jpg|jpeg|gif|webp))(\))/gi,
    `$1${componentName}/$2$3`,
  );
}

/**
 * Compose a survey deck: a title slide (name + member count + blurb) followed by
 * one slide per component, drawn from each `manifest.sample`. Shared by the
 * per-bucket galleries AND the consolidated showcase galleries
 * (tools/build-showcase-galleries.js), so BOTH stay driven by the live manifest
 * set — a new component appears automatically, neither can go stale.
 *
 * @param {object} o
 * @param {string} o.title    heading of the title slide
 * @param {string} o.blurb    one-line subtitle
 * @param {object[]} o.manifests   component manifests, in presentation order
 * @param {(m: object) => string} o.surveyLabel   per-slide footer attribution
 */
function composeGalleryMarkdown({ title, blurb, manifests, surveyLabel }) {
  // Eyebrow counts ALL manifests in the set (matching the original per-bucket
  // composer byte-for-byte, so the freshness gate sees no drift).
  const count = manifests.length;
  const eyebrow = `\`${count} component${count === 1 ? '' : 's'}\``;
  const titleSlide = ['<!-- _class: title silent -->', '', `# ${title}`, '', eyebrow, '', blurb, ''].join('\n');

  // Per-slide attribution (2026-07-05 Specimen Book decision §3.4): each member
  // slide names its component. Gated per member on specimenVoice so a survey's
  // rendered output changes exactly once — inside the migration PR whose visual
  // review covers it. injectFooter no-ops on a hand-set _footer: (banned in
  // samples by gallery-contract).
  const componentSlides = manifests
    .filter((m) => typeof m.sample === 'string' && m.sample.trim())
    .map((m) => {
      const slide = prefixAssetPaths(m.sample.trim(), m.name);
      return m.specimenVoice === true ? injectFooter(slide, surveyLabel(m)) : slide;
    });

  return [titleSlide, ...componentSlides].join('\n\n---\n\n') + '\n';
}

function composeBucketGallery(bucket, manifests) {
  return composeGalleryMarkdown({
    title: bucket,
    blurb: BUCKET_BLURBS[bucket] || bucket,
    manifests,
    surveyLabel: (m) => `${m.name} · ${bucket} survey`,
  });
}

function buildOne(bucket, manifests, theme) {
  if (!manifests.length) {
    return { bucket, theme, skipped: true, reason: 'empty bucket' };
  }
  const mdPath = bucketGalleryMarkdownPath(bucket);
  const authored = isBucketGalleryAuthored(bucket);
  // Hand-authored bucket: read the curated .md as the build source.
  // Generated bucket: compose it fresh from manifest.sample and persist.
  const md = authored
    ? fs.readFileSync(mdPath, 'utf8')
    : composeBucketGallery(bucket, manifests);
  const mdSource = theme === 'dark' ? injectDark(md) : md;
  const tmpPath = mdPath.replace(/\.gallery\.md$/, `.gallery.${theme}.tmp.md`);
  const outPdf = bucketGalleryPdfPath(bucket, theme);

  // Persist the light-theme markdown as the canonical bucket-gallery
  // source ONLY when we're the source of truth (generated buckets).
  // Hand-authored buckets keep their existing .md untouched.
  if (theme === 'light' && !authored) {
    fs.writeFileSync(mdPath, md);
  }

  try {
    fs.writeFileSync(tmpPath, mdSource);
    execFileSync(
      process.execPath,
      [EMULATOR, tmpPath, THEME_CSS, outPdf, 'indaco', '-q'],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } finally {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    // Strip the emulator's .html sidecars from the component folder.
    try { fs.unlinkSync(outPdf.replace(/\.pdf$/, '.html')); } catch { /* ignore */ }
    try { fs.unlinkSync(tmpPath.replace(/\.md$/, '.html')); } catch { /* ignore */ }
  }

  const ok = fs.existsSync(outPdf) && fs.statSync(outPdf).size > 10000;
  return {
    bucket,
    theme,
    members: manifests.length,
    pdfPath: outPdf,
    bytes: ok ? fs.statSync(outPdf).size : 0,
    failed: !ok,
  };
}

function checkOne(bucket, manifests, theme) {
  if (!manifests.length) return { bucket, theme, stale: false };
  const mdPath = bucketGalleryMarkdownPath(bucket);
  const outPdf = bucketGalleryPdfPath(bucket, theme);
  if (!fs.existsSync(outPdf)) return { bucket, theme, stale: true, reason: 'missing' };
  if (!fs.existsSync(mdPath)) return { bucket, theme, stale: true, reason: 'no source .md' };
  // Hand-authored buckets: the .md is the source of truth, not a
  // composition of manifest.sample — skip the drift check.
  if (!isBucketGalleryAuthored(bucket)) {
    const expected = composeBucketGallery(bucket, manifests);
    const actual = fs.readFileSync(mdPath, 'utf8');
    if (expected !== actual) {
      return { bucket, theme, stale: true, reason: 'source .md drifted from manifests' };
    }
  }
  const pdfStat = fs.statSync(outPdf);
  const mdStat = fs.statSync(mdPath);
  if (mdStat.mtimeMs > pdfStat.mtimeMs) {
    return { bucket, theme, stale: true, reason: 'source newer than PDF' };
  }
  return { bucket, theme, stale: false };
}

function main(argv) {
  const args = new Set(argv.filter((a) => a.startsWith('--')));
  const onlyIdx = argv.indexOf('--only');
  const themeIdx = argv.indexOf('--theme');
  const only = onlyIdx >= 0 ? argv[onlyIdx + 1] : null;
  const themeFilter = themeIdx >= 0 ? argv[themeIdx + 1] : null;
  const checkMode = args.has('--check');

  if (only && !BUCKETS.includes(only)) {
    process.stderr.write(`error: --only must be one of ${BUCKETS.join(', ')}\n`);
    return 2;
  }
  if (themeFilter && !THEMES.includes(themeFilter)) {
    process.stderr.write(`error: --theme must be one of ${THEMES.join(', ')}\n`);
    return 2;
  }

  const targetThemes = themeFilter ? [themeFilter] : THEMES;
  const targetBuckets = only ? [only] : BUCKETS;
  const groups = groupByBucket(loadAll());

  const failures = [];
  const stale = [];
  let built = 0;
  let upToDate = 0;

  for (const bucket of targetBuckets) {
    const manifests = groups[bucket] || [];
    for (const theme of targetThemes) {
      if (checkMode) {
        const r = checkOne(bucket, manifests, theme);
        if (r.stale) stale.push(r);
        else upToDate += 1;
        continue;
      }
      try {
        const r = buildOne(bucket, manifests, theme);
        if (r.skipped) {
          process.stdout.write(`- ${bucket} [${theme}]: skipped (${r.reason})\n`);
          continue;
        }
        if (r.failed) {
          failures.push(r);
          process.stderr.write(`✗ ${bucket} [${theme}]: render failed\n`);
        } else {
          built += 1;
          process.stdout.write(
            `✓ ${bucket} [${theme}]: ${r.members} members, ${(r.bytes / 1024).toFixed(0)}kb\n`,
          );
        }
      } catch (e) {
        failures.push({ bucket, theme, error: e.message });
        process.stderr.write(`✗ ${bucket} [${theme}]: ${e.message}\n`);
      }
    }
  }

  if (checkMode) {
    if (stale.length === 0) {
      process.stdout.write(`✓ all ${upToDate} bucket-gallery PDFs up to date\n`);
      return 0;
    }
    process.stderr.write(`✗ ${stale.length} bucket-gallery PDFs are stale:\n`);
    for (const s of stale) {
      process.stderr.write(`    ${s.bucket} [${s.theme}]: ${s.reason}\n`);
    }
    process.stderr.write(`  Run \`npm run build:bucket-galleries\` to refresh.\n`);
    return 1;
  }

  process.stdout.write(`\n${built} PDFs built, ${failures.length} failed.\n`);
  return failures.length === 0 ? 0 : 1;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = {
  composeGalleryMarkdown,
  composeBucketGallery,
  bucketGalleryMarkdownPath,
  bucketGalleryPdfPath,
  isBucketGalleryAuthored,
  BUCKET_BLURBS,
};
