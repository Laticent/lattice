/**
 * Image-set export — the shared contract for a deck rendered to a ZIP of images.
 *
 * WHY THIS EXISTS
 * Both export surfaces ship an "image set": a `.zip` holding one raster per slide
 * (PNG / JPEG / WebP), optional small thumbnails, and — opt-in — the deck's vector
 * diagrams and charts as standalone `.svg` files. The two surfaces rasterize
 * DIFFERENTLY (the CLI screenshots via headless Chromium; the Studio rasterizes via
 * html-to-image in the browser), but the SET's shape must be identical — the same
 * folder layout, file names, manifest, config vocabulary, and size-preset math. So
 * that shared contract lives here, in ONE pure module both surfaces import, and only
 * the pixel-capture differs per surface. (Same split as pptx-export.js — one owned
 * writer, per-surface raster — HARD RULE #1's spirit: the artifact shape is single-
 * sourced.)
 *
 * SHAPE — pure, dependency-free, browser+Node safe:
 *   • No `fs`, no `jszip`, no DOM. Config normalization, preset math, naming, and
 *     the manifest are all pure functions (Node unit-tested).
 *   • `assembleImageSetPlan(...)` returns a FILE PLAN — `[{ path, data }]` plus the
 *     manifest — from already-captured buffers/strings. Each surface then writes the
 *     plan into its own JSZip (`addPlanToZip`, which takes a live JSZip instance) and
 *     generates the blob (browser) / nodebuffer (CLI) itself. The kernel never owns
 *     the zip dependency, so it bundles cleanly into the browser via
 *     tools/build-image-set-core.js.
 *
 * NOT a render transform — it post-processes already-rendered output, so HARD RULE #1
 * (shared render kernel) does not apply to it directly; the browser bundle is a
 * packaging convenience, generated the same way as standalone-svg.
 */

// The three raster formats an image set can hold. PNG is lossless (the default,
// perfect fidelity); JPEG/WebP are lossy levers for a smaller set. WebP is smaller
// than JPEG at equal quality and also supports lossless + alpha, but JPEG is the
// most universally openable — both are offered so the author picks the trade.
const IMAGE_FORMATS = ['png', 'jpeg', 'webp'];

const FORMAT_META = {
  png:  { ext: 'png',  mime: 'image/png',  lossy: false },
  jpeg: { ext: 'jpeg', mime: 'image/jpeg', lossy: true  },
  webp: { ext: 'webp', mime: 'image/webp', lossy: true  },
};

// Size presets — the "size selection" that shrinks the set. Each maps to a raster
// SCALE relative to the slide's own CSS-pixel box. `max` is fidelity-first: the
// largest integer factor whose long edge stays within RASTER_MAX_EDGE (so a 4K deck
// doesn't paint an 8K canvas and OOM) — identical to the emulator's historical PNG
// scale. The rest are fixed multipliers; sub-1× genuinely reduces pixels (both
// puppeteer's deviceScaleFactor and the browser's canvas accept fractional scale).
const SIZE_PRESETS = ['max', '2x', '1x', 'half'];
const RASTER_MAX_EDGE = 3840;

// Export color mode — how the whole deck (slide rasters, thumbnails, AND the extracted
// chart/diagram marks) is rendered. `auto` keeps the deck's own / palette-resolved mode
// (the historical default). light/dark render the light / dark palette; print renders the
// B&W-safe, ink-on-white handout mode. Each surface implements the flip in its own render
// (palette swap / class stamp) — the kernel only carries the choice.
const COLOR_MODES = ['auto', 'light', 'dark', 'print'];

// Standalone chart/diagram SVG background — the canvas baked BEHIND each extracted vector.
// `transparent` (the default) bakes nothing, so the SVG drops onto any surface; light/dark
// bake a solid neutral canvas so the file reads on its own. The marks' ink is fixed by the
// export mode, so a solid background reads best paired with the matching mode (dark bg + dark
// export). Neutral literals (not theme tokens) so a detached file is self-describing.
const SVG_BACKGROUNDS = ['transparent', 'light', 'dark'];
const SVG_BACKGROUND_FILL = { transparent: null, light: '#ffffff', dark: '#111317' };

const DEFAULTS = Object.freeze({
  format: 'png',
  size: 'max',
  quality: 92,        // JPEG/WebP encoder quality (1–100); ignored for PNG
  thumbnails: true,
  thumbWidth: 480,     // px wide; thumbnail height follows the slide aspect
  extractSvg: true,    // charts + Mermaid/diagram SVGs as standalone files
  mode: 'auto',        // export color mode; 'auto' = the deck's own / palette-resolved
  svgBackground: 'transparent', // canvas baked behind each extracted standalone SVG
});

/**
 * Normalize + validate raw image-set options into a complete, safe config. Unknown
 * values fall back to the DEFAULTS rather than throwing, so a stale UI or a typo in a
 * CLI flag degrades to the high-fidelity default instead of failing the export.
 *
 * @param {object} [raw]
 * @returns {{format:string,size:string,quality:number,thumbnails:boolean,thumbWidth:number,extractSvg:boolean}}
 */
function normalizeImageSetOptions(raw) {
  const o = raw || {};
  const format = IMAGE_FORMATS.includes(o.format) ? o.format : DEFAULTS.format;
  const size = SIZE_PRESETS.includes(o.size) ? o.size : DEFAULTS.size;
  let quality = Number(o.quality);
  if (!Number.isFinite(quality)) quality = DEFAULTS.quality;
  quality = Math.min(100, Math.max(1, Math.round(quality)));
  let thumbWidth = Number(o.thumbWidth);
  if (!Number.isFinite(thumbWidth) || thumbWidth <= 0) thumbWidth = DEFAULTS.thumbWidth;
  thumbWidth = Math.min(2000, Math.max(48, Math.round(thumbWidth)));
  return {
    format,
    size,
    quality,
    thumbnails: o.thumbnails === undefined ? DEFAULTS.thumbnails : !!o.thumbnails,
    thumbWidth,
    extractSvg: o.extractSvg === undefined ? DEFAULTS.extractSvg : !!o.extractSvg,
    mode: COLOR_MODES.includes(o.mode) ? o.mode : DEFAULTS.mode,
    svgBackground: SVG_BACKGROUNDS.includes(o.svgBackground) ? o.svgBackground : DEFAULTS.svgBackground,
  };
}

/**
 * Resolve a `svgBackground` choice to the fill baked behind a standalone SVG, or null
 * for transparent (no rect). Both surfaces call this so the canvas is identical.
 * @param {string} svgBackground  a SVG_BACKGROUNDS value
 * @returns {string|null} a CSS color, or null for transparent
 */
function svgBackgroundFill(svgBackground) {
  return Object.hasOwn(SVG_BACKGROUND_FILL, svgBackground)
    ? SVG_BACKGROUND_FILL[svgBackground]
    : SVG_BACKGROUND_FILL[DEFAULTS.svgBackground];
}

/**
 * Resolve a size preset to a numeric raster scale for a given slide box. `max` picks
 * the largest whole factor whose long edge stays ≤ RASTER_MAX_EDGE (1× for 4K, 2× for
 * HD); the others are fixed. Both surfaces call this so the size vocabulary means the
 * same pixels everywhere.
 *
 * @param {string} size  a SIZE_PRESETS value (falls back to 'max')
 * @param {number} slideW  slide CSS width in px
 * @param {number} slideH  slide CSS height in px
 * @returns {number} the device scale factor to raster at
 */
function resolveRasterScale(size, slideW, slideH) {
  const longEdge = Math.max(Number(slideW) || 1280, Number(slideH) || 720);
  switch (size) {
    case '2x': return 2;
    case '1x': return 1;
    case 'half': return 0.5;
    // 'max' (and any unknown value) → fidelity-first, capped at the long-edge budget.
    default:
      return Math.max(1, Math.min(2, Math.floor(RASTER_MAX_EDGE / longEdge)));
  }
}

/**
 * Thumbnail scale = target thumb width ÷ slide width, clamped so a thumbnail is never
 * upscaled past the full raster (a tiny 320px slide keeps 1×). Shared so CLI + Studio
 * thumbnails match.
 */
function resolveThumbScale(thumbWidth, slideW) {
  const w = Number(slideW) || 1280;
  return Math.min(1, (Number(thumbWidth) || DEFAULTS.thumbWidth) / w);
}

/** Zero-padded slide index width for N slides (min 2 → `01`, `02`; 100+ → `001`). */
function padWidth(count) {
  return Math.max(2, String(Math.max(1, count)).length);
}

/** Filesystem-safe deck slug for the zip's root folder / file stem. */
function deckSlug(name) {
  const s = String(name || 'deck').trim().replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return s || 'deck';
}

/** `slides/<slug>-03.png` — the per-slide raster path within the zip. */
function slideEntryName(slug, index, count, ext) {
  return `slides/${slug}-${String(index + 1).padStart(padWidth(count), '0')}.${ext}`;
}

/** `thumbnails/<slug>-03.png` — the per-slide thumbnail path. */
function thumbEntryName(slug, index, count, ext) {
  return `thumbnails/${slug}-${String(index + 1).padStart(padWidth(count), '0')}.${ext}`;
}

/**
 * `assets/<slug>-s03-c00.svg` — a standalone vector asset lifted off a slide.
 * `slide` is 1-based; `index` disambiguates multiple charts/diagrams on one slide.
 */
function assetEntryName(slug, slide, index, count) {
  const s = String(slide).padStart(padWidth(count), '0');
  const i = String(index).padStart(2, '0');
  return `assets/${slug}-s${s}-c${i}.svg`;
}

/**
 * Build the manifest that ships as `manifest.json` — an index a downstream tool (or a
 * human) can read to understand the set without probing every file. Counts + geometry
 * are derived from the inputs, never hand-typed.
 *
 * @param {object} p
 * @param {string} p.slug
 * @param {object} p.options       a normalized config (from normalizeImageSetOptions)
 * @param {{w:number,h:number}} p.geom   slide CSS box in px
 * @param {number} p.scale         the raster scale used for the full images
 * @param {Array<{name:string,slide:number}>} p.slides   per-slide entries (name = zip path)
 * @param {Array<{name:string,slide:number}>} [p.thumbnails]
 * @param {Array<{name:string,slide:number,kind:string}>} [p.assets]
 * @param {string} [p.generator]   tool label ('cli' | 'studio')
 * @returns {object} the manifest object (caller JSON-stringifies)
 */
function buildImageSetManifest(p) {
  const opts = p.options || DEFAULTS;
  const meta = FORMAT_META[opts.format] || FORMAT_META.png;
  const geom = p.geom || { w: 1280, h: 720 };
  const scale = Number(p.scale) || 1;
  return {
    kind: 'lattice-image-set',
    version: 1,
    generator: p.generator || 'lattice',
    deck: p.slug,
    format: opts.format,
    mime: meta.mime,
    lossy: meta.lossy,
    quality: meta.lossy ? opts.quality : null,
    colorMode: opts.mode || DEFAULTS.mode,
    svgBackground: opts.svgBackground || DEFAULTS.svgBackground,
    slide: { width: geom.w, height: geom.h },
    pixel: { width: Math.round(geom.w * scale), height: Math.round(geom.h * scale), scale },
    counts: {
      slides: (p.slides || []).length,
      thumbnails: (p.thumbnails || []).length,
      assets: (p.assets || []).length,
    },
    slides: (p.slides || []).map((s) => ({
      slide: s.slide,
      image: s.name,
      thumbnail: (p.thumbnails || []).find((t) => t.slide === s.slide)?.name || null,
    })),
    assets: (p.assets || []).map((a) => ({ slide: a.slide, kind: a.kind || 'svg', file: a.name })),
  };
}

/**
 * Assemble the complete file PLAN from captured pieces — the single place that decides
 * what a `.zip` image set contains and how it's named. Pure: it takes buffers/strings
 * in, returns `{ files:[{path,data}], manifest }` out. Each surface writes the files
 * into its own JSZip (see `addPlanToZip`) and generates the archive itself.
 *
 * @param {object} p
 * @param {string} p.name                   deck name (slugged for the folder stem)
 * @param {object} p.options                raw or normalized config
 * @param {{w:number,h:number}} p.geom      slide CSS box in px
 * @param {number} p.scale                  raster scale used for full images
 * @param {Array<Uint8Array|Buffer>} p.images    one full raster per slide, deck order
 * @param {Array<Uint8Array|Buffer>} [p.thumbs]  one thumbnail per slide (or [])
 * @param {Array<{slide:number,svg:string,kind?:string}>} [p.svgs]  standalone vectors
 * @param {string} [p.generator]
 * @returns {{files:Array<{path:string,data:*}>, manifest:object, slug:string}}
 */
function assembleImageSetPlan(p) {
  const options = normalizeImageSetOptions(p.options);
  const meta = FORMAT_META[options.format];
  const slug = deckSlug(p.name);
  const images = Array.isArray(p.images) ? p.images : [];
  const thumbs = Array.isArray(p.thumbs) ? p.thumbs : [];
  const svgs = Array.isArray(p.svgs) ? p.svgs : [];
  const count = images.length;
  if (!count) throw new Error('assembleImageSetPlan: no slide images to pack');

  const files = [];
  const slideEntries = [];
  const thumbEntries = [];
  const assetEntries = [];

  images.forEach((data, i) => {
    const name = slideEntryName(slug, i, count, meta.ext);
    files.push({ path: name, data });
    slideEntries.push({ name, slide: i + 1 });
  });

  if (options.thumbnails) {
    thumbs.forEach((data, i) => {
      if (!data) return;
      const name = thumbEntryName(slug, i, count, meta.ext);
      files.push({ path: name, data });
      thumbEntries.push({ name, slide: i + 1 });
    });
  }

  if (options.extractSvg) {
    // Disambiguate multiple assets on one slide with a per-slide running index.
    const perSlide = new Map();
    for (const a of svgs) {
      if (!a?.svg) continue;
      const n = perSlide.get(a.slide) || 0;
      perSlide.set(a.slide, n + 1);
      const name = assetEntryName(slug, a.slide, n, count);
      files.push({ path: name, data: a.svg });
      assetEntries.push({ name, slide: a.slide, kind: a.kind || 'svg' });
    }
  }

  const manifest = buildImageSetManifest({
    slug, options, geom: p.geom || { w: 1280, h: 720 }, scale: p.scale,
    slides: slideEntries, thumbnails: thumbEntries, assets: assetEntries,
    generator: p.generator,
  });
  files.push({ path: 'manifest.json', data: JSON.stringify(manifest, null, 2) });

  return { files, manifest, slug };
}

/**
 * Write an assembled plan's files into a live JSZip instance under a single root
 * folder (`<slug>/…`). The caller owns the JSZip import (browser: `await import`,
 * Node: `require`) and the final `generateAsync({ type })` — this only lays out the
 * entries, so the naming/layout stays single-sourced.
 *
 * @param {import('jszip')} zip  a JSZip instance
 * @param {{files:Array<{path:string,data:*}>, slug:string}} plan
 * @returns {import('jszip')} the same zip, for chaining
 */
function addPlanToZip(zip, plan) {
  const root = zip.folder(plan.slug);
  for (const f of plan.files) root.file(f.path, f.data);
  return zip;
}

module.exports = {
  IMAGE_FORMATS,
  FORMAT_META,
  SIZE_PRESETS,
  RASTER_MAX_EDGE,
  COLOR_MODES,
  SVG_BACKGROUNDS,
  SVG_BACKGROUND_FILL,
  DEFAULTS,
  normalizeImageSetOptions,
  resolveRasterScale,
  resolveThumbScale,
  svgBackgroundFill,
  padWidth,
  deckSlug,
  slideEntryName,
  thumbEntryName,
  assetEntryName,
  buildImageSetManifest,
  assembleImageSetPlan,
  addPlanToZip,
};
