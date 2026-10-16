// Build-time loader for the playground's "Load a deck" drawer.
//
// The playground's component picker scaffolds ONE component at a time. This
// module surfaces the other half of the story: the full showcase decks that
// already live in the repo as regression baselines + editorial references —
// the Jargon gallery, the design-system tour, and the twelve per-bucket survey
// galleries. Picking one drops the whole deck into the editor so it renders in
// the preview, in the chosen palette (the engine's withTheme() injects the
// selected theme into each deck's front matter — see lib/playground/index.js).
//
// Runs in Astro frontmatter (SSG, Node) only — it reads repo markdown off the
// filesystem. The decks name their pictures `sample:<name>`, which the preview
// resolves against the staged lib/samples/ copy (docs/src/lib/samples-base.ts);
// any other local image a deck references is staged by collectGalleryAssets.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// Editorial showcases — the headline decks, in featured order.
const SHOWCASES = [
  {
    id: 'jargon',
    label: 'Jargon',
    file: 'examples/gallery-jargon.md',
  },
  {
    id: 'design-system',
    label: 'Design system',
    file: 'design/design-system.gallery.md',
  },
  {
    // Consolidated data-viz walk (every chart + math component), GENERATED from
    // the live manifest set by tools/build-showcase-galleries.js — cannot go
    // stale.
    id: 'data-viz',
    label: 'Data visualization',
    file: 'examples/data-viz-gallery.md',
  },
  {
    // The deck that inspired split-panel's `proof` modifier and the
    // matrix-grid component — see engineering/decisions/
    // 2026-07-27-bloom-engineering-journey-components.md.
    id: 'bloom-engineering-journey',
    label: 'Bloom engineering journey',
    file: 'examples/bloom-engineering-journey.md',
  },
];

// One survey deck per component family (bucket), in design-system catalog
// order. File path is derived: lib/components/<bucket>/<bucket>.gallery.md.
const FAMILIES = [
  ['anchor', 'Anchors'],
  ['statement', 'Statements'],
  ['inventory', 'Inventory'],
  ['comparison', 'Comparison'],
  ['progression', 'Progression'],
  ['evidence', 'Evidence'],
  ['imagery', 'Imagery'],
  ['chart', 'Charts'],
  ['diagram', 'Diagrams'],
  ['math', 'Math'],
  ['code', 'Code'],
  ['legal', 'Legal'],
];

// Markdown image syntax: ![alt](target). Captures the surrounding `![...](` and
// `)` so a replacement only swaps the target. Alt text can't contain `]`.
const IMG_RE = /(!\[[^\]]*\]\()\s*([^)\s]+)\s*(\))/g;
const IMG_EXT = /\.(svg|png|jpe?g|webp|gif)$/i;

// Collect every LOCAL image a gallery deck references by a relative path, as a
// [stagedDest, absSrc] pair. The preview resolves a relative ref against the
// staged `samples/` base, so the staged dest mirrors the ref path:
//   ref `image/foo.svg` (in lib/components/imagery/) → samples/image/foo.svg.
// `sample:` refs (staged whole by sync-playground-assets), remote (http), data:,
// non-image targets and missing files are skipped.
function galleryAssetRefs(src, galleryDir) {
  const out = [];
  let m;
  IMG_RE.lastIndex = 0;
  while ((m = IMG_RE.exec(src))) {
    const target = m[2];
    if (/^(https?:|data:|sample:|\/)/i.test(target) || !IMG_EXT.test(target)) continue;
    const abs = resolve(galleryDir, target);
    if (existsSync(abs)) out.push([`samples/${target}`, abs]);
  }
  return out;
}

// Slide count = the `---` slide separators, plus one, corrected for a front-
// matter block. A deck that OPENS with front matter spends two fences on it
// (`---` … `---`), so N slides read as N+1 fences → subtract one. A deck with NO
// front matter (the bucket + showcase galleries, which open with an HTML comment
// or `_class` directive) has exactly N-1 separators → add one. The old formula
// assumed front matter unconditionally and undercounted every front-matter-less
// deck by two. Good enough for a meta label; these decks don't use `---` for
// anything but front matter and slide breaks.
export function slideCount(src) {
  const fences = (src.match(/^---[ \t]*$/gm) || []).length;
  const hasFrontMatter = /^---[ \t]*\r?\n/.test(src);
  return Math.max(1, hasFrontMatter ? fences - 1 : fences + 1);
}

function loadOne(repoRoot, { id, label, file, group }) {
  const abs = join(repoRoot, file);
  if (!existsSync(abs)) return null;
  const raw = readFileSync(abs, 'utf8');
  // Keep the deck's source verbatim — clean, deck-relative image refs. The
  // referenced assets are staged under samples/ (collectGalleryAssets, consumed
  // by sync-playground-assets) and the preview render resolves them against the
  // samples/ base, so no base64 inlining is needed.
  return { id, label, group, slides: slideCount(raw), source: raw };
}

// Every gallery deck that exists, as { id, label, file } — the single source of
// truth for both loadGalleries and collectGalleryAssets.
function galleryDecks() {
  return [
    ...SHOWCASES.map((s) => ({ ...s, group: 'Showcases' })),
    ...FAMILIES.map(([bucket, label]) => ({
      id: `fam-${bucket}`, label, group: 'By family',
      file: `lib/components/${bucket}/${bucket}.gallery.md`,
    })),
  ];
}

/**
 * The local image assets every gallery deck references, deduped, as
 * [stagedDestRelativePath, absoluteSource] pairs — staged under samples/ by
 * sync-playground-assets so the preview can fetch them by their deck-relative
 * path (the same samples/ base the component studio uses).
 * @param {string} repoRoot absolute path to the lattice repo root
 */
export function collectGalleryAssets(repoRoot) {
  const seen = new Map();
  for (const { file } of galleryDecks()) {
    const abs = join(repoRoot, file);
    if (!existsSync(abs)) continue;
    for (const [dest, src] of galleryAssetRefs(readFileSync(abs, 'utf8'), dirname(abs))) {
      if (!seen.has(dest)) seen.set(dest, src);
    }
  }
  return [...seen.entries()];
}

/**
 * Load the curated showcase + family galleries from the repo.
 * @param {string} repoRoot absolute path to the lattice repo root
 * @returns {Array<{id,label,group,slides,source}>}
 */
export function loadGalleries(repoRoot) {
  const out = [];
  for (const deck of galleryDecks()) {
    const g = loadOne(repoRoot, deck);
    if (g) out.push(g);
  }
  return out;
}

// Group metadata for the drawer — the order they render in, plus the one-line
// hint that makes each group's semantics legible.
export const GALLERY_GROUPS = [
  { key: 'Showcases', hint: 'Full editorial decks — every layout in context.' },
  { key: 'By family', hint: 'One survey deck per component family.' },
];

// ── Every examples/*.md deck — the Galleries sheet's searchable list ─────────────
//
// The per-feature demo decks (HARD RULE #9) are not curated, so there is no list to
// edit: this derives one from the directory, and a new example appears on the next
// build. Unlike the curated decks these are NOT inlined into the page — the sync
// script stages one `galleries/<slug>.md` per deck plus a small `galleries/index.json`,
// and the Playground fetches the index when the sheet first opens and a deck when
// it is chosen (the same pattern as the Explore walk plans).

// A deck's display title: front-matter `title:`, else the first `# ` heading, else
// the file name. Heading text is flattened to plain words (the list is a text list).
export function deckTitle(src, slug) {
  const fm = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(src);
  const fromFm = fm && /^title:[ \t]*(.+?)[ \t]*$/m.exec(fm[1]);
  // Unquote ONLY a YAML value, and only a matching pair — a heading may open with a quote mark
  // that is part of the sentence (`# "Shipped" is a product word.`).
  const raw = fromFm
    ? fromFm[1].replace(/^(["'])(.*)\1$/, '$2')
    : (/^#[ \t]+(.+?)[ \t]*$/m.exec(fm ? src.slice(fm[0].length) : src) || [])[1];
  const clean = (raw || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return clean || slug;
}

/**
 * Every `examples/*.md` deck as { slug, title, slides, source }, A–Z by title.
 * `slideCount` counts `---` fences, which is right for the curated decks but wrong for any deck
 * that splits on headings (the engine default: `split-headings` reads "1 slide" and renders 7) or
 * shows a `---` inside a code fence. A caller that can load the engine passes `countSlides` (the
 * sync script does — the engine is the one render path, HARD RULE #1); this module is also bundled
 * into the Astro build, where a relative `require` of lib/engine does not resolve.
 * @param {string} repoRoot absolute path to the lattice repo root
 * @param {(src: string) => number} [countSlides] defaults to the fence count
 */
export function loadExampleDecks(repoRoot, countSlides = slideCount) {
  const dir = join(repoRoot, 'examples');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md')
    .sort()
    .map((f) => {
      const slug = f.slice(0, -3);
      const source = readFileSync(join(dir, f), 'utf8');
      return { slug, title: deckTitle(source, slug), slides: countSlides(source) || slideCount(source), source };
    })
    .sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }) || a.slug.localeCompare(b.slug));
}
