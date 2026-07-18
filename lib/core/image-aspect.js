/**
 * Image aspect classification — the shared brain for the adaptive `image`
 * layout. An author hands us an arbitrary rectangle (phone crop, scan, portrait
 * photo, panorama); unlike every other layout, we don't control the content's
 * shape. So the treatment is RESOLVED from two axes:
 *
 *   1. the image's own aspect (this module) — measured in the browser, then
 *      bucketed here;
 *   2. the deck size in use (`data-orientation`) — stamped by the slide pipeline.
 *
 * This module is the axis-1 half: a pure `width,height → bucket` classifier
 * (no DOM, no fs — safe in Node AND the browser). CSS then resolves the
 * composition from `[data-img-bucket] × [data-orientation]`, with an explicit
 * author variant overriding. Clean (contain on a matte) is the floor: the one
 * composition that is safe for ANY rectangle, so an unbucketed or unreadable
 * image still lands somewhere boardroom-ready.
 *
 * See engineering/decisions/2026-06-19-adaptive-image.md.
 */

// Bucket thresholds on aspect = width / height. Boundaries chosen so a bucket
// names the shape an author would recognise, and so each maps to a composition
// that flatters it (see the resolution table in the decision doc / CSS):
//   pano   ≥ 2.00  — cinematic / panorama; wants a full-width band
//   wide   1.30..2 — landscape photo; fills a landscape canvas, tops a portrait one
//   square 0.77..1.30 — squarish; reverent frame reads at any size
//   tall   0.50..0.77 — portrait photo; wants a full-height column
//   column < 0.50   — very tall / strip; letterbox or a slim column
const BUCKETS = Object.freeze([
  { name: 'pano',   min: 2.0,  max: Infinity },
  { name: 'wide',   min: 1.3,  max: 2.0 },
  { name: 'square', min: 0.77, max: 1.3 },
  { name: 'tall',   min: 0.5,  max: 0.77 },
  { name: 'column', min: 0,    max: 0.5 },
]);

const BUCKET_NAMES = Object.freeze(BUCKETS.map((b) => b.name));

/**
 * Parse intrinsic `{w,h}` out of an SVG's opening tag — `width`/`height` win, else
 * the `viewBox`'s last two numbers (the box's w h). Pure and fs-free, so it is the
 * ONE parser shared by both aspect sources: `image-dimensions.svgSize` reads an
 * external `.svg` asset's file header through it (build path), and the `scene`
 * component reads its INLINE poster's `viewBox` through it (the poster is inline
 * markup, not a file — so it can't go through the Node-only `image-dimensions`).
 * Same brain, two carriers — the scene mirrors image's adaptive resolution exactly.
 * @param {string} svg  an `<svg …>` tag, or any string that contains one
 * @returns {{w:number,h:number}|null}  dimensions, or null if none are parseable
 */
function aspectFromSvgTag(svg) {
  if (typeof svg !== 'string') return null;
  const m = svg.match(/<svg\b[^>]*>/i);
  if (!m) return null;
  const s = m[0];
  // width/height are intrinsic ONLY when unitless or px. A `%` is measured against a
  // different axis (and other units against a different context), so its numeric value
  // is NOT the aspect — reject it and fall through to the viewBox, the authoritative
  // intrinsic coordinate box present on essentially every poster. (Inline scene posters
  // are routinely authored `width="100%" height="100%"`, which would otherwise bucket as
  // square — so this guard, though shared with image's file path, matters most here.)
  const px = (v) => { const mm = /^([\d.]+)(?:px)?$/.exec(String(v).trim()); return mm ? parseFloat(mm[1]) : NaN; };
  const wM = s.match(/\bwidth\s*=\s*["']([^"']+)["']/i);
  const hM = s.match(/\bheight\s*=\s*["']([^"']+)["']/i);
  let w = wM ? px(wM[1]) : NaN, h = hM ? px(hM[1]) : NaN;
  if (!(w > 0 && h > 0)) {
    // viewBox = "min-x min-y width height" with comma-wsp separators (SVG spec allows
    // commas, not just whitespace) — read the last two numbers as the box's w h.
    const vb = s.match(/\bviewBox\s*=\s*["']\s*[\d.eE+-]+[\s,]+[\d.eE+-]+[\s,]+([\d.eE+-]+)[\s,]+([\d.eE+-]+)/i);
    if (vb) { w = parseFloat(vb[1]); h = parseFloat(vb[2]); }
  }
  return (w > 0 && h > 0) ? { w, h } : null;
}

/**
 * Classify an image's pixel size into an aspect bucket.
 * @param {number} width   intrinsic width  (px)
 * @param {number} height  intrinsic height (px)
 * @returns {string|null} bucket name, or null if the size is unusable (≤0 /
 *   non-finite) — caller falls back to the Clean floor.
 */
function bucketForAspect(width, height) {
  const w = Number(width), h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  const aspect = w / h;
  // `min` exclusive, `max` inclusive — except the open-topped `pano` (max
  // Infinity) and the floor `column` (min 0 inclusive of any positive ratio).
  for (const b of BUCKETS) {
    if (b.min === 0 ? aspect <= b.max : (aspect > b.min && aspect <= b.max)) return b.name;
  }
  return 'square'; // unreachable (ranges cover (0, ∞)); defensive
}

// ── Axis-2 resolution: (bucket × deck orientation) → composition ─────────────
// RISK-GATED, with Clean as the standing default. The author's photo is content
// we can't see, so the auto-resolver only ever reaches for a treatment that
// cannot lose or obscure it — and it only LEAVES Clean when the aspect is
// extreme enough that Clean would waste the canvas. The three auto compositions:
//   • clean    — the adaptive floated card; the card itself takes the photo's
//                aspect, so the crop is ≈ zero for ANY moderate shape. The floor
//                AND the default for square / mild-wide images.
//   • split    — an extreme-aspect image shown WHOLE in a full-height column
//                (landscape) or full-width band (portrait): zero crop, and it
//                fills the canvas a skinny/squat Clean card would leave empty.
//   • spotlight— full-bleed cover where the photo's aspect already MATCHES the
//                canvas (pano on landscape, tall on portrait), with the text in a
//                SOLID card so legibility is guaranteed (not a scrim gamble).
// `gallery` (contain on a matte — for diagrams/screenshots with whitespace we
// can't detect from aspect) and `statement` (text on a SCRIM over an unknown
// photo — a legibility gamble) are OPT-IN only; never auto-resolved. Each
// composition is itself orientation-aware in CSS; the table only says WHICH.
const RESOLVE_LANDSCAPE = Object.freeze({ pano: 'spotlight', wide: 'clean', square: 'clean', tall: 'split', column: 'split' });
const RESOLVE_PORTRAIT  = Object.freeze({ pano: 'split', wide: 'split', square: 'clean', tall: 'spotlight', column: 'spotlight' });

// The full vocabulary. `clean`/`split`/`spotlight` auto-resolve (tables above);
// `gallery`/`statement` are author-only opt-ins.
const COMPOSITIONS = Object.freeze(['clean', 'split', 'statement', 'gallery', 'spotlight']);

// Legacy class aliases from the pre-adaptive layout, mapped onto the closest new
// composition so old decks keep rendering: `full` (cover + overlay) → spotlight,
// `contain`/`museum` (letterboxed/matted) → gallery.
const LEGACY_ALIASES = Object.freeze({ full: 'spotlight', contain: 'gallery', museum: 'gallery' });

/**
 * Resolve the composition for an image from its bucket and the deck orientation.
 * @param {string|null} bucket       from bucketForAspect (null → Clean floor)
 * @param {string} [orientation]     'portrait' selects the portrait table; any
 *                                   other value (landscape / square / undefined)
 *                                   uses the landscape table.
 * @returns {string} composition name (one of COMPOSITIONS)
 */
function resolveComposition(bucket, orientation) {
  if (!bucket) return 'clean';
  const table = orientation === 'portrait' ? RESOLVE_PORTRAIT : RESOLVE_LANDSCAPE;
  return table[bucket] || 'clean';
}

/**
 * An explicit author composition wins over the auto-resolver. Reads a section's
 * class list for a composition name (new vocabulary) or a legacy alias.
 * @param {string} classStr  the section's class attribute
 * @returns {string|null}    composition name, or null if none is named (→ auto)
 */
function compositionFromClass(classStr) {
  if (typeof classStr !== 'string' || !classStr) return null;
  const classes = classStr.split(/\s+/);
  for (const c of classes) if (COMPOSITIONS.includes(c)) return c;
  for (const c of classes) if (LEGACY_ALIASES[c]) return LEGACY_ALIASES[c];
  return null;
}

module.exports = {
  BUCKETS, BUCKET_NAMES, bucketForAspect, aspectFromSvgTag,
  COMPOSITIONS, LEGACY_ALIASES, resolveComposition, compositionFromClass,
};

