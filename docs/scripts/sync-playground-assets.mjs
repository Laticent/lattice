// Stage the runtime assets the playground fetches/loads at runtime into a
// CONTENT-HASHED directory, so a redeploy can never serve them stale:
//   - dist/lattice-runtime.min.js → public/playground/v/<hash>/lattice-runtime.js
//       (the DOM-transform + Mermaid bundle, loaded inside the preview iframe;
//        renders charts/split-panels and orchestrates Mermaid — the same
//        bundle marp-vscode preview uses. We stage the MINIFIED build: the
//        preview fetches it over the wire, where size matters; the readable
//        dist/lattice-runtime.js stays the devtools/debug artifact. ~1.5MB→300KB.)
//   - dist/lattice.min.css      → public/playground/v/<hash>/themes/lattice.css
//       (the @theme lattice engine; minified for the same reason. ~727KB→362KB.)
//   - dist/themes/<name>.min.css → public/playground/v/<hash>/themes/<name>.css
//       (the per-palette token files, fetched + registered by the playground
//        engine to render in the chosen palette. We stage the MINIFIED build —
//        the same one the Export-to-Marp bundle ships — under the unversioned
//        <name>.css dest, so the themeBase fetch sites are unchanged.)
//   - public/playground/lattice-playground.js (committed engine bundle)
//                               → public/playground/v/<hash>/lattice-playground.js
//
// The staged DEST names are unversioned-of-content on purpose (lattice-runtime.js,
// themes/lattice.css): the fetch sites (runtimeUrl / themeBase) are unchanged, so
// swapping the SOURCE to the minified build is invisible to every consumer — only
// the bytes (and thus the content hash) change. The minified variants are built by
// the same `npm run build` (build-runtime.js emits both; lattice.min.css via the
// css pipeline) and already back the Export-to-Marp path, so they're guaranteed
// present and behaviourally identical to the readable builds.
//
// WHY HASHED. These three asset kinds are served from fixed public/ URLs. Astro
// content-hashes its own page JS, so a redeploy refreshes the page, but the
// fixed-URL assets are cached by the browser/CDN and served STALE — the page's
// new component list renders against the old CSS (a blank funnel, a collapsed
// pricing grid; see the 2026-06 funnel/pricing incident). Staging under
// `v/<hash>/` and having the pages build `playground/v/<hash>/…` URLs (via
// asset-version.mjs) makes any content change a new URL → a guaranteed cache
// miss. The fetch sites are unchanged: they only append a filename to the
// hash-versioned `themeBase`.
//
// Staged at docs-build time (like sync-portal). NOT committed — regenerated
// each build from repo source so they can't drift. The whole `v/` tree is
// rewritten each run, so only the current hash survives.

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectGalleryAssets } from '../src/playground/galleries.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
// Per-palette themes: the MINIFIED dist build (same bytes the Export-to-Marp
// bundle ships), staged under the readable <name>.css dest.
const distThemesDir = join(repoRoot, 'dist', 'themes');
// Preview-fetched engine CSS + runtime: stage the MINIFIED builds (the readable
// dist/lattice.css + dist/lattice-runtime.js remain the debug artifacts).
const latticeCss = join(repoRoot, 'dist', 'lattice.min.css');
const runtimeJs = join(repoRoot, 'dist', 'lattice-runtime.min.js');
const pgDir = join(here, '..', 'public', 'playground');
const engineJs = join(pgDir, 'lattice-playground.js'); // committed engine bundle

// The full asset set, as [destRelativePath, absoluteSource]. destRelativePath
// is the path under the hashed dir (and exactly what the pages request).
const assets = [
  ['lattice-runtime.js', runtimeJs],
  ['lattice-playground.js', engineJs],
  ['themes/lattice.css', latticeCss],
];
for (const file of readdirSync(distThemesDir)) {
  if (file.endsWith('.min.css')) {
    const dest = file.replace(/\.min\.css$/, '.css');
    assets.push([`themes/${dest}`, join(distThemesDir, file)]);
  }
}
// Component sample images referenced by manifest `sample` decks — e.g. the image
// component's `![bg](sample-image-landscape.svg)`. Staged under samples/ so the
// playground preview can load them; the component render passes this base as
// `{ baseUrl }` to the engine, which resolves the deck-relative path against it.
const imageSamplesDir = join(repoRoot, 'lib', 'components', 'imagery', 'image');
for (const file of readdirSync(imageSamplesDir)) {
  if (file.endsWith('.svg')) assets.push([`samples/${file}`, join(imageSamplesDir, file)]);
}
// logo-wall's manifest sample references the brand marks by bare filename
// (`![Acme](acme.svg)`), resolved against the same samples/ base. Stage them
// flat so the component studio renders real marks instead of broken images.
// (The bucket gallery refs them as `logo-wall/acme.svg`; that nested copy is
// staged via collectGalleryAssets below — both paths resolve.)
const logoWallDir = join(repoRoot, 'lib', 'components', 'inventory', 'logo-wall');
for (const file of readdirSync(logoWallDir)) {
  if (file.endsWith('.svg')) assets.push([`samples/${file}`, join(logoWallDir, file)]);
}
// Images the "Load a deck" gallery decks reference (e.g. the imagery survey's
// `![bg](image/sample-photo-wide.svg)`, the inventory logo-wall). Staged under
// samples/ mirroring each deck-relative ref so the preview resolves them against
// the same samples/ base — no base64 inlining (see galleries.mjs). The decks
// keep clean relative refs in source.
for (const [dest, src] of collectGalleryAssets(repoRoot)) assets.push([dest, src]);
// The Export-to-Marp static assets (minified engine / stylesheet / runtime /
// mermaid), staged under export/ so the Drawing Board's in-browser export can
// fetch them and zip the SAME bundle the CLI produces. Sourced from the shared
// manifest (lib/core/marp-bundle.js) so the two paths can't drift.
const { STATIC_ASSETS, AGENT_ASSETS } = createRequire(import.meta.url)(join(repoRoot, 'lib', 'core', 'marp-bundle.js'));
// The static render assets AND the agent-kit catalog (components.json) — both
// staged flat under export/ so the in-browser producer fetches them by basename,
// the same way the CLI reads them from disk.
for (const { from } of [...STATIC_ASSETS, ...AGENT_ASSETS]) {
  assets.push([`export/${basename(from)}`, join(repoRoot, from)]);
}
// KaTeX — the math stylesheet + its woff2 fonts, staged under katex/ so a math
// deck's `.katex` styling loads SAME-ORIGIN (it was a jsdelivr `<link>` injected
// into every filmstrip preview). Only the woff2 are staged: katex.min.css lists
// woff2/woff/ttf per face and the browser fetches only the first supported format
// (woff2), so the woff/ttf refs are never requested (no 404s). The CSS's relative
// `url(fonts/…)` resolves against the co-located katex/fonts/. Sourced from the
// `katex` dependency so it can't drift from the version the engine renders with.
const katexDist = join(repoRoot, 'node_modules', 'katex', 'dist');
if (existsSync(katexDist)) {
  assets.push(['katex/katex.min.css', join(katexDist, 'katex.min.css')]);
  for (const file of readdirSync(join(katexDist, 'fonts'))) {
    if (file.endsWith('.woff2')) assets.push([`katex/fonts/${file}`, join(katexDist, 'fonts', file)]);
  }
}
// The worked exemplar decks (exemplars/<bucket>/<slug>.md) — fetched on demand by
// the Drawing Board's Drafting picker, trimmed to the chosen tier in the browser
// (lib/exemplars/tier-filter.js). Staged hashed like every other fetched asset so
// a redeploy can't serve a stale deck. Only the authored .md sources ship; the
// committed .pdf renders are review artifacts, not loaded by the app.
const exemplarsDir = join(repoRoot, 'exemplars');
for (const bucket of readdirSync(exemplarsDir)) {
  const bucketDir = join(exemplarsDir, bucket);
  let entries;
  try {
    entries = readdirSync(bucketDir);
  } catch {
    continue; // a stray file at exemplars/ root, not a bucket dir
  }
  for (const file of entries) {
    if (file.endsWith('.md')) assets.push([`exemplars/${bucket}/${file}`, join(bucketDir, file)]);
  }
}

for (const [, src] of assets) {
  if (!existsSync(src)) {
    console.error(`sync-playground-assets: missing ${src} — run \`npm run build\` in the repo root.`);
    process.exit(1);
  }
}

// The Explore surface's walk plans (2026-07-05 Specimen Book decision §4):
// plans/<name>.json, one per component, generated from the SAME exported
// `galleryPlan(m)` the PDF renderer and page-count contract consume — the walk
// order cannot fork between the reader and the committed galleries. Generated
// content (not copied files), hashed alongside the file assets so a prose
// change to any gallery slide changes the bytes → the hash → the URL.
const componentRequire = createRequire(import.meta.url);
const { loadAll } = componentRequire(join(repoRoot, 'lib', 'components', 'index.js'));
const { galleryPlan } = componentRequire(join(repoRoot, 'tools', 'build-component-docs.js'));
const generated = loadAll().map((m) => [
  `plans/${m.name}.json`,
  JSON.stringify({ name: m.name, slides: galleryPlan(m) }),
]);

// Content hash over (relPath + bytes) for every asset, in a stable order, so
// the directory name changes iff any asset's content (or set) changes.
const hash = createHash('sha256');
const hashed = [
  ...assets.map(([rel, src]) => [rel, () => readFileSync(src)]),
  ...generated.map(([rel, content]) => [rel, () => content]),
];
for (const [rel, bytes] of hashed.sort((a, b) => a[0].localeCompare(b[0]))) {
  hash.update(rel);
  hash.update(bytes());
}
const version = hash.digest('hex').slice(0, 12);

// Rewrite the whole versioned tree so stale hash dirs don't accumulate.
const versionedRoot = join(pgDir, 'v');
rmSync(versionedRoot, { recursive: true, force: true });

for (const [rel, src] of assets) {
  const dest = join(versionedRoot, version, rel);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}
for (const [rel, content] of generated) {
  const dest = join(versionedRoot, version, rel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, content);
}

console.log(
  `sync-playground-assets: staged ${assets.length + generated.length} asset(s) (${generated.length} generated plans) into public/playground/v/${version}/.`,
);
