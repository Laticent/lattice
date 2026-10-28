#!/usr/bin/env node
/**
 * Font parity gate — keep the engine's self-hosted faces in sync across every
 * surface, and guard against a Google-Fonts CDN dependency creeping back in.
 *
 * The library now carries its OWN type (zero network): the Google `@import` is
 * gone, replaced by a self-hosted `@font-face` block built from the canonical
 * manifest. This is a SOURCE-parity gate (it runs as a build preflight, before
 * dist/ is regenerated), so it holds the manifest against the other SOURCES a
 * face must appear in — never against the not-yet-rebuilt bundle:
 *
 *   DEMAND     — lib/fonts/text-faces.js (TEXT_FACES): the canonical face list.
 *   SUPPLY src — assets/fonts/<file>.woff2: the woff2 source-of-truth on disk.
 *   SUPPLY pdf — docs/src/playground/font-embed.js + its ./fonts/*.woff2: the
 *                Drawing Board PDF/PPTX web-export inlines these as data: URIs.
 *   (The emulator PDF path and the dist/lattice.css @font-face block are both
 *    GENERATED from TEXT_FACES, so they are in sync by construction; dist/
 *    freshness — incl. dist/fonts/ — is enforced separately by `css:build
 *    --check`.)
 *
 * It also REGRESSION-GUARDS the zero-network property: any reappearance of a
 * `fonts.googleapis.com` / `fonts.gstatic.com` URL in the engine source CSS or
 * the shipped bundle fails the gate.
 *
 * Noto Color Emoji is self-hosted too, as 11 unicode-range woff2 slices
 * (lib/fonts/emoji-faces.js). They are not text faces, so the set checks above
 * skip them; this gate only checks that every slice's woff2 is on disk. The
 * Studio reads the same files from assets/fonts/. Read-only; never writes.
 *
 * Background: engineering/decisions/2026-06-12-export-font-embedding.md,
 * engineering/decisions/2026-06-26-local-font-library.md.
 */

const fs = require('node:fs');
const path = require('node:path');

const { TEXT_FACES, faceKey } = require('../lib/fonts/text-faces');
const { EMOJI_SLICES } = require('../lib/fonts/emoji-faces');

const ROOT = path.join(__dirname, '..');

const LIB_DIR = path.join(ROOT, 'lib');
const THEMES_DIR = path.join(ROOT, 'themes');
const DIST_CSS = path.join(ROOT, 'dist', 'lattice.css');
const ASSET_FONTS = path.join(ROOT, 'assets', 'fonts');
const WEBEXPORT_JS = path.join(ROOT, 'docs', 'src', 'playground', 'font-embed.js');
const WEBEXPORT_FONTS = path.join(ROOT, 'docs', 'src', 'playground', 'fonts');

const rel = (p) => path.relative(ROOT, p);
const diff = (a, b) => [...a].filter((x) => !b.has(x)).sort();

// ── DEMAND: the canonical manifest ────────────────────────────────────────────
function demandFaces() {
  return new Set(TEXT_FACES.map((f) => faceKey(f.family, f.weight, f.style)));
}

// ── SUPPLY (web export): font-embed.js FACES + its ./fonts/*.woff2 ────────────
function webExportFaces(missingFiles) {
  const js = fs.readFileSync(WEBEXPORT_JS, 'utf8');
  const faces = new Set();
  const row = /\{\s*family:\s*'([^']+)'\s*,\s*weight:\s*(\d+)\s*,\s*style:\s*'(\w+)'/g;
  let r;
  while ((r = row.exec(js))) faces.add(faceKey(r[1], Number(r[2]), r[3]));
  for (const imp of js.matchAll(/from\s+'\.\/fonts\/([^']+\.woff2)'/g)) {
    const fp = path.join(WEBEXPORT_FONTS, imp[1]);
    if (!fs.existsSync(fp)) missingFiles.push(`${rel(WEBEXPORT_JS)} → ${rel(fp)} (no woff2 on disk)`);
  }
  return faces;
}

// ── BYTE PARITY (web export): every vendored woff2 IS the manifest face's file ──
// The set check above passed while five vendored files carried other bytes than assets/fonts/
// (Caveat 700, Outfit 400/700, Shantell 400/700: one variable file standing in for several static
// ones), so the Studio drew those weights from different glyphs than the CLI and the same deck
// exported two different players (decisions/2026-10-16-player-as-library-audit.md §11.9). Each
// FACES row names its import; that import's file must equal the manifest face's woff2, byte for byte.
function webExportByteDrift() {
  const js = fs.readFileSync(WEBEXPORT_JS, 'utf8');
  const fileOf = new Map([...js.matchAll(/import\s+(\w+)\s+from\s+'\.\/fonts\/([^']+\.woff2)'/g)].map((m) => [m[1], m[2]]));
  const manifest = new Map(TEXT_FACES.map((f) => [faceKey(f.family, f.weight, f.style), f.file]));
  const drift = [];
  for (const r of js.matchAll(/\{\s*family:\s*'([^']+)'\s*,\s*weight:\s*(\d+)\s*,\s*style:\s*'(\w+)'\s*,\s*url:\s*(\w+)/g)) {
    const key = faceKey(r[1], Number(r[2]), r[3]);
    const vendored = fileOf.get(r[4]);
    const canonical = manifest.get(key);
    if (!vendored || !canonical) continue; // the set checks above report a missing row or file
    const a = path.join(WEBEXPORT_FONTS, vendored);
    const b = path.join(ASSET_FONTS, `${canonical}.woff2`);
    if (fs.existsSync(a) && fs.existsSync(b) && !fs.readFileSync(a).equals(fs.readFileSync(b))) {
      drift.push(`${key}: ${rel(a)} differs from ${rel(b)} — copy the canonical file over it`);
    }
  }
  return drift;
}

// ── REGRESSION GUARD: no Google-Fonts CDN URL may return ──────────────────────
// Scan every SOURCE CSS that gets bundled (lib/**/*.css, themes/**/*.css) — not
// just base.tokens.css — so a CDN url() added to any component/integration sheet
// is caught at the source on the build that introduces it (the gate is a
// preflight, so reading the not-yet-rebuilt dist/lattice.css alone would miss
// it). The shipped bundle is scanned too as a belt-and-suspenders check.
function cssFilesUnder(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...cssFilesUnder(p));
    else if (ent.name.endsWith('.css')) out.push(p);
  }
  return out;
}
function cdnRegressions() {
  const hits = [];
  const cdn = /fonts\.(googleapis|gstatic)\.com/;
  const files = [...cssFilesUnder(LIB_DIR), ...cssFilesUnder(THEMES_DIR), DIST_CSS];
  for (const f of files) {
    if (fs.existsSync(f) && cdn.test(fs.readFileSync(f, 'utf8'))) {
      hits.push(`${rel(f)} references a Google-Fonts CDN URL — the library must self-host (zero network)`);
    }
  }
  return hits;
}

function main() {
  const demand = demandFaces();
  const problems = [];
  const missingFiles = [];

  // woff2 source-of-truth presence for every manifest face (assets/fonts/). The
  // shipped dist/fonts/ copies are a build OUTPUT, gated by `css:build --check`.
  for (const { file } of TEXT_FACES) {
    const src = path.join(ASSET_FONTS, `${file}.woff2`);
    if (!fs.existsSync(src)) missingFiles.push(`${rel(src)} (manifest face, no woff2 source)`);
  }

  for (const { file } of EMOJI_SLICES) {
    const src = path.join(ASSET_FONTS, `${file}.woff2`);
    if (!fs.existsSync(src)) missingFiles.push(`${rel(src)} (emoji slice, no woff2 source)`);
  }

  const webExport = webExportFaces(missingFiles);

  const report = (label, list) => {
    if (list.length) problems.push(`${label}:\n  - ${list.join('\n  - ')}`);
  };
  report('In the manifest but NOT vendored for the web-export path (font-embed.js)', diff(demand, webExport));
  report('Vendored in font-embed.js but NOT in the manifest (stale)', diff(webExport, demand));
  report('Listed in a supply but missing its woff2 on disk', missingFiles);
  report('Vendored for the web export with OTHER bytes than the manifest face (assets/fonts/)', webExportByteDrift());
  report('CDN regression — a Google-Fonts URL reappeared', cdnRegressions());

  if (problems.length) {
    process.stderr.write(
      'font parity FAILED — the canonical manifest and its supplies have drifted,\n' +
        'or a CDN dependency crept back in. A rendered deck may fall back / synthesise,\n' +
        'or fetch type over the network. Reconcile lib/fonts/text-faces.js,\n' +
        'assets/fonts/ (+ rebuild dist/), and docs/src/playground/font-embed.js + its ./fonts/.\n\n' +
        `${problems.join('\n\n')}\n`,
    );
    return 1;
  }

  process.stdout.write(`font parity OK — ${demand.size} faces self-hosted across the bundle, emulator, and web-export; zero CDN.\n`);
  return 0;
}

if (require.main === module) process.exit(main());

module.exports = { demandFaces, webExportFaces, webExportByteDrift, cdnRegressions };
