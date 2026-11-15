/**
 * Node-only intrinsic-dimension reader for the adaptive `image` layout.
 *
 * The author hands us an arbitrary rectangle; to resolve a boardroom-ready
 * treatment we need its aspect at BUILD time (deterministic for the PDF/HTML
 * export — no waiting on image load). This reads width/height straight from the
 * file header for the formats a deck realistically carries: PNG, JPEG, GIF,
 * WebP and AVIF through the image library's one header reader
 * (`@laticent/lastra` `readImage`, which also gives the EXIF turn a browser
 * paints), SVG through the markup parser the inline posters share. Anything it
 * can't parse (remote URL, exotic format, unreadable) returns null, and the
 * caller falls back to the Clean floor — always safe.
 *
 * Pairs with lib/core/image-aspect.js (pure bucketing) and the browser-measure
 * fallback in lib/runtime (for remote/data-url assets in live preview).
 * See engineering/decisions/2026-06-19-adaptive-image.md.
 */

const fs = require('node:fs');
const { fileURLToPath } = require('node:url');
const { displaySize, imageFormat, readImage } = require('@laticent/lastra');
const { bucketForAspect, resolveComposition, compositionFromClass, aspectFromSvgTag } = require('./image-aspect');

// ── Header → {w,h} | null ────────────────────────────────────────────────────

function svgSize(buf) {
  // Read enough of the head to catch the opening <svg …>, then parse it through the
  // shared fs-free parser (image-aspect.aspectFromSvgTag) — the SAME parser the
  // inline-poster `scene` component uses, so both aspect sources agree byte-for-byte.
  return aspectFromSvgTag(buf.toString('utf8', 0, Math.min(buf.length, 2048)));
}

/**
 * The size a browser paints a picture at, from its bytes: lastra's header read with the
 * EXIF turn applied (a phone's portrait JPEG is stored landscape), or an SVG's own box.
 * @param {Buffer} buf
 * @returns {{w:number,h:number}|null}
 */
function dimensionsOf(buf) {
  if (!buf || buf.length < 4) return null;
  if (imageFormat(buf) === 'svg') return svgSize(buf);
  const info = readImage(buf);
  if (!info) return null;
  const { width, height } = displaySize(info);
  return { w: width, h: height };
}

/**
 * Read intrinsic dimensions from a local image file.
 * @param {string} filePath  absolute (or cwd-relative) path to a local asset
 * @returns {{w:number,h:number}|null}  dimensions, or null if unreadable/unknown
 */
function readDimensions(filePath) {
  let buf;
  try { buf = fs.readFileSync(filePath); } catch { return null; }
  return dimensionsOf(buf);
}

// ── Build-time bucket stamp ──────────────────────────────────────────────────
// The adaptive `image` layout resolves its composition in CSS from
// `[data-img-bucket] × [data-orientation]`. This stamps the FIRST half — the
// image's intrinsic aspect bucket — onto the <section>, by reading the resolved
// asset off the already-emitted `.lattice-bg` panel. Deterministic for the
// PDF/HTML export (no waiting on image load). Anything unreadable (remote URL,
// exotic format) is left unstamped → CSS falls to the Clean floor. The browser
// measure pass in lib/runtime covers preview / remote / data-url assets.

function bgUrlOf(sectionHtml) {
  const m = sectionHtml.match(/class="lattice-bg[^"]*"[^>]*background-image:\s*url\(\s*['"]?([^'")]+)/i);
  return m ? m[1] : null;
}

function urlToLocalPath(u) {
  if (u.startsWith('file://')) { try { return fileURLToPath(u); } catch { return null; } }
  if (/^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith('//') || u.startsWith('data:')) return null; // remote / data
  return u; // already a filesystem path
}

/**
 * Stamp `data-img-bucket` on an `image` section by reading its `.lattice-bg`
 * asset's intrinsic aspect. Idempotent; a no-op for non-image sections, an
 * already-stamped section, or an unreadable/remote asset (→ Clean floor).
 * @param {string} sectionHtml  one `<section …>…</section>`
 * @returns {string} the section, possibly with `data-img-bucket` added
 */
function stampImageBucket(sectionHtml) {
  if (typeof sectionHtml !== 'string') return sectionHtml;
  const open = sectionHtml.match(/^<section\b[^>]*>/i);
  // `\sclass=`, not `\bclass=`: the section tag's `data-class="<raw _class: payload>"`
  // also satisfies a `\b` boundary, so the deck-resolved `image` token has to be read
  // off the real attribute (docs/src/lib/markup/section-walk.ts readClassAttr, #1358).
  if (!open || !/\sclass="[^"]*\bimage\b/.test(open[0])) return sectionHtml;
  if (/\bdata-img-bucket=/.test(open[0])) return sectionHtml;
  const url = bgUrlOf(sectionHtml);
  if (!url) return sectionHtml;
  const filePath = urlToLocalPath(url);
  if (!filePath) return sectionHtml;
  const dim = readDimensions(filePath);
  const bucket = dim && bucketForAspect(dim.w, dim.h);
  if (!bucket) return sectionHtml;
  return open[0].replace(/^<section\b/i, `<section data-img-bucket="${bucket}"`) + sectionHtml.slice(open[0].length);
}

function attrOf(openTag, name) {
  // Accept either quote style; the engine emits double quotes, but staying
  // quote-agnostic avoids a silent null (→ everything falls to Clean) if an
  // upstream ever single-quotes an attribute.
  const m = openTag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return m ? m[2] : null;
}

/**
 * Stamp `data-img-composition` — the SECOND axis half — on an `image` section.
 * The composition is the one place the two axes meet: an explicit author class
 * wins; otherwise it's resolved from the already-stamped `data-img-bucket` ×
 * `data-orientation`. Run this AFTER `stampImageBucket` (it reads that stamp) so
 * CSS can key the whole layout off a single `[data-img-composition]` attribute —
 * one resolution table (image-aspect.js), shared by build and the browser pass.
 * Idempotent; a no-op for non-image or already-resolved sections.
 * @param {string} sectionHtml  one `<section …>…</section>`
 * @returns {string} the section, with `data-img-composition` added
 */
// NOTE: the `scene` component reuses this SAME `data-img-composition` / `data-img-bucket`
// vocabulary (its CSS keys off it exactly as image's does), but scene stamps its OWN
// sections from its inline poster in lib/components/imagery/scene/scene.transform.js —
// the stamps here are `image`-gated (`\bimage\b`) and never touch a `section.scene`.
function stampImageComposition(sectionHtml) {
  if (typeof sectionHtml !== 'string') return sectionHtml;
  const open = sectionHtml.match(/^<section\b[^>]*>/i);
  if (!open) return sectionHtml;
  const tag = open[0];
  const cls = attrOf(tag, 'class');
  if (!cls || !/\bimage\b/.test(cls)) return sectionHtml;
  if (/\bdata-img-composition=/.test(tag)) return sectionHtml;
  const composition = compositionFromClass(cls)
    || resolveComposition(attrOf(tag, 'data-img-bucket'), attrOf(tag, 'data-orientation'));
  return tag.replace(/^<section\b/i, `<section data-img-composition="${composition}"`) + sectionHtml.slice(tag.length);
}

module.exports = {
  readDimensions, dimensionsOf, stampImageBucket, stampImageComposition,
  bgUrlOf, urlToLocalPath, attrOf,
};
