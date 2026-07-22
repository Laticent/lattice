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
// chart/diagram marks) is rendered. `inherit` keeps the deck's own / palette-resolved mode
// (the default). light/dark render the light / dark palette; print renders the B&W-safe,
// ink-on-white handout mode. Each surface implements the flip in its own render (palette swap
// / class stamp) — the kernel only carries the choice. (Shares the `inherit` default vocabulary
// with the SVG look below.)
const COLOR_MODES = ['inherit', 'light', 'dark', 'print'];

// Standalone chart/diagram SVG "look" — controls BOTH how each extracted vector is
// RENDERED and the canvas baked behind it, independent of the slide images' color mode.
// `inherit` (the default) keeps the marks as the slides rendered them and bakes no canvas
// (drops onto anything) — the parallel to the color mode's `inherit`. `light`/`dark` render the
// chart/diagram in that scheme on a white / dark canvas. `print` renders it B&W-safe (grayscale
// + textures) on white — so you can export color slides but print-ready chart/diagram vectors
// for a document. Canvas fills are neutral literals (not theme tokens) so a detached file is
// self-describing.
const SVG_BACKGROUNDS = ['inherit', 'light', 'dark', 'print'];
const SVG_BACKGROUND_FILL = { inherit: null, light: '#ffffff', dark: '#111317', print: '#ffffff' };
// The render treatment a look implies (null = inherit the slide render). Surfaces apply this
// to the chart/diagram before extraction — print via the `print` canvas class, light/dark via
// the matching palette scheme — so both emit the same look.
const SVG_LOOK_MODE = { inherit: null, light: 'light', dark: 'dark', print: 'print' };

// The keyed chart layouts that emit ONE self-contained `<svg>` (diagram + spine + key) worth
// lifting into the image set as a standalone vector — the section class is also the manifest's
// `chartType`. Single-sourced here so BOTH surfaces (CLI screenshot walk + Studio DOM walk)
// classify the same sections: adding a keyed chart in one place can't silently drift the sets.
const KEYED_CHART_LAYOUTS = ['piechart', 'radar', 'map', 'quadrant', 'funnel'];

const DEFAULTS = Object.freeze({
  format: 'png',
  size: 'max',
  quality: 92,        // JPEG/WebP encoder quality (1–100); ignored for PNG
  thumbnails: true,
  thumbWidth: 480,     // px wide; thumbnail height follows the slide aspect
  extractSvg: true,    // charts + Mermaid/diagram SVGs as standalone files
  mode: 'inherit',     // export color mode; 'inherit' = the deck's own / palette-resolved
  svgBackground: 'inherit', // the extracted SVG's look; 'inherit' = follow the slides, no canvas
});

/**
 * Normalize + validate raw image-set options into a complete, safe config. Unknown
 * values fall back to the DEFAULTS rather than throwing, so a stale UI or a typo in a
 * CLI flag degrades to the high-fidelity default instead of failing the export.
 *
 * @param {object} [raw]
 * @returns {{format:string,size:string,quality:number,thumbnails:boolean,thumbWidth:number,extractSvg:boolean,mode:string,svgBackground:string}}
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
 * The render treatment a SVG look implies — `light` / `dark` / `print`, or null to leave the
 * chart/diagram as the slides rendered it (the `transparent` look). Surfaces compare this to
 * the slide's own mode to decide whether to re-treat the SVG before extraction.
 * @param {string} svgBackground  a SVG_BACKGROUNDS value
 * @returns {string|null}
 */
function svgLookMode(svgBackground) {
  return Object.hasOwn(SVG_LOOK_MODE, svgBackground)
    ? SVG_LOOK_MODE[svgBackground]
    : SVG_LOOK_MODE[DEFAULTS.svgBackground];
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
  // The largest scale that keeps the long edge within the budget. The fixed presets are
  // clamped to it so a big deck (e.g. 4K @ `2x` → a 7680px / 33 Mpx canvas) can't OOM or
  // trip the browser's null `canvas.toBlob` — HD is unaffected (2× of 1280 is well under).
  const cap = RASTER_MAX_EDGE / longEdge;
  switch (size) {
    case '2x': return Math.min(2, cap);
    case '1x': return Math.min(1, cap);
    case 'half': return Math.min(0.5, cap);
    // 'max' (and any unknown value) → fidelity-first: the largest whole factor within budget,
    // but if a single 1× already exceeds the budget (an oversized custom `@size` wider than
    // RASTER_MAX_EDGE) fall to the sub-1 cap so the long edge STILL can't blow past it.
    default:
      return cap < 1 ? cap : Math.min(2, Math.max(1, Math.floor(cap)));
  }
}

/**
 * Thumbnail scale = target thumb width ÷ slide width, clamped so a thumbnail is never bigger
 * than the FULL raster it thumbnails (a tiny 320px slide, or any sub-1× `--image-size`, keeps
 * the thumb ≤ the full image). `rasterScale` is the resolved full-image scale (from
 * resolveRasterScale); pass it so `--image-size half --thumb-width 700` can't produce a
 * thumbnail wider than the reduced full raster. Shared so CLI + Studio thumbnails match.
 */
function resolveThumbScale(thumbWidth, slideW, rasterScale = 1) {
  const w = Number(slideW) || 1280;
  const cap = Number(rasterScale) > 0 ? Number(rasterScale) : 1;
  return Math.min(cap, (Number(thumbWidth) || DEFAULTS.thumbWidth) / w);
}

// ── Physical geometry + DPI ───────────────────────────────────────────────────
// A slide is a fixed-size presentation surface. Anchor its PHYSICAL size to the same
// intent the PPTX export uses — the longest edge is 13.333in (PowerPoint's 16:9 width) —
// so the image set's DPI and physical dims line up with the deck's other exports. The
// DPI then just falls out of the pixel count: more pixels (a bigger `--image-size` or a
// 4K deck) = higher DPI at the same physical size.
const PHYSICAL_LONG_EDGE_IN = 13.333;

/** `landscape` (w>h) · `portrait` (h>w) · `square` (w==h) — reported from the slide box. */
function orientationOf(w, h) {
  const a = Number(w) || 0;
  const b = Number(h) || 0;
  if (a > b) return 'landscape';
  if (b > a) return 'portrait';
  return 'square';
}

/** Physical print size (inches) of the slide box, longest edge normalized to 13.333in. */
function physicalSize(w, h) {
  const a = Math.max(Number(w) || 1, 1);
  const b = Math.max(Number(h) || 1, 1);
  const longest = Math.max(a, b);
  const round3 = (n) => Math.round((n / longest) * PHYSICAL_LONG_EDGE_IN * 1000) / 1000;
  return { width: round3(a), height: round3(b), unit: 'in' };
}

/** Effective print resolution (DPI) of a raster: pixel long edge ÷ physical long edge. */
function dpiFor(pixelW, pixelH) {
  const px = Math.max(Number(pixelW) || 0, Number(pixelH) || 0);
  return Math.round(px / PHYSICAL_LONG_EDGE_IN);
}

/** Byte length of a packed entry — Buffer/Uint8Array (.byteLength), Blob (.size), or a
 *  UTF-8 string (an SVG). Used to record each file's size in the manifest. */
function dataByteLength(data) {
  if (data == null) return 0;
  if (typeof data === 'string') return new TextEncoder().encode(data).length;
  if (typeof data.byteLength === 'number') return data.byteLength; // Buffer / Uint8Array / ArrayBuffer
  if (typeof data.size === 'number') return data.size;             // Blob
  return 0;
}

// ── DPI embedding (pHYs / JFIF) ───────────────────────────────────────────────
// Bake the physical resolution INTO the raster bytes so the images drop into a print /
// office document at the right physical size instead of the tool's default 96dpi guess.
// Pure Uint8Array surgery (no deps, both surfaces): PNG gets a `pHYs` chunk, JPEG gets its
// JFIF density set. WebP density lives in EXIF (fiddlier) — left as-is; the manifest still
// records the dpi. Any parse surprise returns the bytes unchanged (never corrupt the image).

// CRC-32 (IEEE) for the PNG chunk. Table built once, lazily.
let _crcTable = null;
function crc32(bytes) {
  if (!_crcTable) {
    _crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      _crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = _crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const DPI_PER_METER = 1 / 0.0254; // dots-per-inch → dots-per-meter

function u8(...arrs) {
  const len = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}
function be32(n) {
  const v = n >>> 0;
  return Uint8Array.of((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
}

/** PNG: set the physical resolution to `dpi` via a `pHYs` chunk (pixels-per-meter, unit=1)
 *  right after IHDR. If the source already carries a `pHYs` (neither of our surfaces emits
 *  one, but a future source might), that stale chunk is DROPPED — a PNG may hold only one,
 *  so a blind insert would make two and violate the spec. */
function embedPngDpi(bytes, dpi) {
  const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 8 + 25) return bytes;
  for (let i = 0; i < 8; i++) if (bytes[i] !== SIG[i]) return bytes; // not a PNG
  // First chunk must be IHDR (length 13 → its chunk spans bytes 8..8+12+13+4 = 8+29-... );
  // IHDR chunk = 4 len + 4 type + 13 data + 4 crc = 25 bytes, starting at offset 8.
  const ihdrType = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (ihdrType !== 'IHDR') return bytes;
  const ihdrEnd = 8 + 25;
  const ppm = Math.round(dpi * DPI_PER_METER);
  const data = u8(be32(ppm), be32(ppm), Uint8Array.of(1)); // xppu, yppu, unit=meter
  const typeAndData = u8(Uint8Array.of(0x70, 0x48, 0x59, 0x73), data); // 'pHYs' + data
  const chunk = u8(be32(9), typeAndData, be32(crc32(typeAndData)));
  // First, cheaply detect whether a stale pHYs already exists (rare — neither of our surfaces
  // emits one). Scan only up to IDAT, since a spec-valid pHYs must precede the image data.
  // Bounds-checked so a truncated length field can't read past the buffer.
  let i = ihdrEnd;
  let dropped = false;
  while (i + 8 <= bytes.length) {
    const len = (bytes[i] << 24 >>> 0) + (bytes[i + 1] << 16) + (bytes[i + 2] << 8) + bytes[i + 3];
    const type = String.fromCharCode(bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7]);
    const end = i + 12 + len;
    if (len < 0 || end > bytes.length) break; // malformed length → don't chop; fall through
    if (type === 'IDAT') break;
    if (type === 'pHYs') { dropped = true; i = end; continue; } // drop the stale one
    i = end;
  }
  if (dropped) {
    // Rebuild: sig+IHDR, our pHYs, then all chunks from ihdrEnd with any pHYs filtered out.
    const kept = [];
    let j = ihdrEnd;
    while (j + 8 <= bytes.length) {
      const len = (bytes[j] << 24 >>> 0) + (bytes[j + 1] << 16) + (bytes[j + 2] << 8) + bytes[j + 3];
      const type = String.fromCharCode(bytes[j + 4], bytes[j + 5], bytes[j + 6], bytes[j + 7]);
      const end = j + 12 + len;
      if (len < 0 || end > bytes.length) { kept.push(bytes.subarray(j)); break; }
      if (type !== 'pHYs') kept.push(bytes.subarray(j, end));
      j = end;
    }
    return u8(bytes.subarray(0, ihdrEnd), chunk, ...kept);
  }
  return u8(bytes.subarray(0, ihdrEnd), chunk, bytes.subarray(ihdrEnd));
}

/** JPEG: set the JFIF APP0 density (units=1 dpi, X=Y=dpi). Only patches an existing JFIF
 *  APP0 (which puppeteer + canvas.toBlob both emit); otherwise returns bytes unchanged. */
function embedJpegDpi(bytes, dpi) {
  if (bytes.length < 20 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes; // not a JPEG
  // APP0 usually follows SOI at offset 2: FF E0 <len2> "JFIF\0" ver2 units Xdens2 Ydens2 …
  if (bytes[2] !== 0xff || bytes[3] !== 0xe0) return bytes;
  // A real JFIF APP0 is ≥ 16 bytes (len2 + "JFIF\0" + ver2 + units + Xdens2 + Ydens2 + thumb2).
  // Guard the declared length so we never patch density bytes that actually belong to the NEXT
  // marker on a malformed/mislabeled APP0 (real encoders always emit the full 16-byte segment).
  const app0Len = (bytes[4] << 8) | bytes[5];
  if (app0Len < 16) return bytes;
  const isJfif = bytes[6] === 0x4a && bytes[7] === 0x46 && bytes[8] === 0x49 && bytes[9] === 0x46 && bytes[10] === 0x00;
  if (!isJfif) return bytes;
  const d = Math.min(0xffff, Math.max(1, Math.round(dpi)));
  // `Uint8Array.from` ALWAYS copies; `bytes.slice()` would alias memory for a Node Buffer
  // (Buffer.prototype.slice returns a view) and mutate the caller's buffer in place.
  const out = Uint8Array.from(bytes); // copy — never mutate the caller's buffer
  out[13] = 0x01;            // density units = dots per inch
  out[14] = (d >>> 8) & 0xff; out[15] = d & 0xff; // Xdensity
  out[16] = (d >>> 8) & 0xff; out[17] = d & 0xff; // Ydensity
  return out;
}

/**
 * Embed the physical resolution into a raster's bytes so it prints at the right size.
 * @param {Uint8Array|Buffer} bytes
 * @param {string} format  'png' | 'jpeg' | 'webp'
 * @param {number} dpi
 * @returns {Uint8Array|Buffer} new bytes (or the input unchanged if not embeddable)
 */
function embedRasterDpi(bytes, format, dpi) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const d = Number(dpi);
  if (!Number.isFinite(d) || d <= 0) return bytes;
  try {
    if (format === 'png') return embedPngDpi(b, d);
    if (format === 'jpeg') return embedJpegDpi(b, d);
  } catch (_e) { /* never corrupt the image — ship it un-tagged */ }
  return bytes; // webp / unknown → unchanged (dpi still in the manifest)
}

/** Zero-padded slide index width for N slides (min 2 → `01`, `02`; 100+ → `001`). */
function padWidth(count) {
  return Math.max(2, String(Math.max(1, count)).length);
}

/** Filesystem-safe deck slug for the zip's root folder / file stem. */
function deckSlug(name) {
  // Strip leading/trailing hyphens AND dots: a deck literally named `.`/`..` would otherwise
  // survive as a dot slug, which loses the single-root-folder layout (JSZip normalizes it away)
  // and can't extract on Windows.
  const s = String(name || 'deck').trim().replace(/[^\w.-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 60);
  if (!s || /^\.+$/.test(s)) return 'deck';
  // Windows reserved device names (CON, NUL, COM1, …) can't be a file/folder name there — prefix
  // them. The reservation is on the STEM regardless of extension (`nul.txt` is just as reserved as
  // `nul`), so test the part before the first dot, not the whole slug.
  const stem = s.split('.')[0];
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem)) return `deck-${s}`;
  return s;
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
  const pixel = { width: Math.round(geom.w * scale), height: Math.round(geom.h * scale), scale };
  const thumbs = p.thumbnails || [];
  const thumbFor = (slide) => thumbs.find((t) => t.slide === slide);
  const titles = p.slideTitles || [];

  const out = {
    kind: 'lattice-image-set',
    version: 2,
    generator: p.generator || 'lattice',
    deck: p.slug,
    title: p.title || null,
    palette: p.palette || null,
    engine: { name: 'lattice', version: p.engineVersion || null },
    // Provenance — a stamp of WHEN the set was made. Omitted when the surface doesn't pass one
    // (a caller wanting a stable manifest can leave it out). NOTE: both shipping surfaces do pass
    // `new Date()`, and JSZip stamps each entry's mtime with the wall clock regardless, so the
    // .zip itself is not byte-reproducible today — this only keeps the manifest JSON stable.
    ...(p.createdAt ? { createdAt: p.createdAt } : {}),

    format: opts.format,
    mime: meta.mime,
    lossy: meta.lossy,
    quality: meta.lossy ? opts.quality : null,
    colorMode: opts.mode || DEFAULTS.mode,
    svgBackground: opts.svgBackground || DEFAULTS.svgBackground,

    orientation: orientationOf(geom.w, geom.h),
    slide: { width: geom.w, height: geom.h },
    pixel,
    physical: physicalSize(geom.w, geom.h),
    dpi: dpiFor(pixel.width, pixel.height),

    counts: {
      slides: (p.slides || []).length,
      thumbnails: thumbs.length,
      assets: (p.assets || []).length,
    },
    slides: (p.slides || []).map((s) => {
      const t = thumbFor(s.slide);
      return {
        slide: s.slide,
        title: titles[s.slide - 1] || null,
        image: s.name,
        bytes: s.bytes ?? null,
        thumbnail: t?.name || null,
        thumbnailBytes: t?.bytes ?? null,
      };
    }),
    assets: (p.assets || []).map((a) => ({
      slide: a.slide,
      kind: a.kind || 'svg',
      chartType: a.chartType || null,
      file: a.name,
      bytes: a.bytes ?? null,
    })),
  };
  // Thumbnail geometry (uniform across the set) — only when thumbnails were packed. Pass the
  // raster `scale` so the recorded dims match the ACTUAL thumbnails (which are clamped to never
  // exceed the full raster), not an unclamped target width.
  if (opts.thumbnails && thumbs.length) {
    const ts = resolveThumbScale(opts.thumbWidth, geom.w, scale);
    out.thumbnail = { width: Math.round(geom.w * ts), height: Math.round(geom.h * ts) };
  }
  return out;
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
    slideEntries.push({ name, slide: i + 1, bytes: dataByteLength(data) });
  });

  if (options.thumbnails) {
    thumbs.forEach((data, i) => {
      if (!data) return;
      const name = thumbEntryName(slug, i, count, meta.ext);
      files.push({ path: name, data });
      thumbEntries.push({ name, slide: i + 1, bytes: dataByteLength(data) });
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
      assetEntries.push({ name, slide: a.slide, kind: a.kind || 'svg', chartType: a.chartType || null, bytes: dataByteLength(a.svg) });
    }
  }

  const manifest = buildImageSetManifest({
    slug, options, geom: p.geom || { w: 1280, h: 720 }, scale: p.scale,
    slides: slideEntries, thumbnails: thumbEntries, assets: assetEntries,
    slideTitles: p.slideTitles, title: p.title, palette: p.palette,
    engineVersion: p.engineVersion, createdAt: p.createdAt,
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
  SVG_LOOK_MODE,
  KEYED_CHART_LAYOUTS,
  DEFAULTS,
  normalizeImageSetOptions,
  resolveRasterScale,
  resolveThumbScale,
  svgBackgroundFill,
  svgLookMode,
  PHYSICAL_LONG_EDGE_IN,
  orientationOf,
  physicalSize,
  dpiFor,
  dataByteLength,
  embedRasterDpi,
  padWidth,
  deckSlug,
  slideEntryName,
  thumbEntryName,
  assetEntryName,
  buildImageSetManifest,
  assembleImageSetPlan,
  addPlanToZip,
};
