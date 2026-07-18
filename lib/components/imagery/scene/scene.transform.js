/**
 * `scene` component kernel — frames an Anima motion scene's POSTER still for a
 * slide, as a faithful mirror of the adaptive `image` layout (its point of
 * reference). Like `image`, the scene's COMPOSITION is RESOLVED, not authored,
 * from the poster's own shape:
 *
 *   1. read the inline poster `<svg>`'s intrinsic aspect (its `viewBox`), through
 *      the SAME fs-free brain image uses — lib/core/image-aspect.js;
 *   2. bucket it (pano / wide / square / tall / column) and resolve the
 *      composition from `bucket × data-orientation` (`clean` is the floor), with
 *      an explicit author class winning — identical tables to image;
 *   3. stamp `data-img-bucket` + `data-img-composition` on the <section>, the one
 *      attribute scene.styles.css keys off — exactly like image.styles.css.
 *
 * The ONE divergence from image is the asset carrier: image's asset rides as a
 * `.lattice-bg` COVER background (a photo we can't recolor); a scene's poster is an
 * INLINE `<svg>` (its `var(--token)` fills recolor with the theme, and it bakes
 * crisp into the PDF), wrapped in `.scene-figure` and CONTAINED. The heading +
 * caption are wrapped in `.scene-text` (mirrors `.image-text`).
 *
 * Pure, idempotent (guards on the stamp + on `.scene-figure`), string-in/string-out
 * for the build path plus a live-DOM `applyToDom` for the runtime — wired once for
 * every render path through the transformer registry (HARD RULE #1).
 *
 * Stage 5 is the static poster. The live animation (mount an Anima backend from a
 * `data-scene-spec`) is Stage 6's hydration — this kernel leaves the poster
 * untouched otherwise, so the still is what bakes into the PDF.
 * See engineering/decisions/2026-07-18-anima-motion-faculty-modes.md §5.
 */

const {
  aspectFromSvgTag, bucketForAspect, resolveComposition, compositionFromClass,
} = require('../../../core/image-aspect');

// A full <svg>…</svg> poster (our posters are flat — one top-level svg, not nested).
// Non-greedy to the first close.
const SVG_RE = /<svg\b[\s\S]*?<\/svg>/i;
const HEADER_RE = /<header\b[\s\S]*?<\/header>/i;
const FOOTER_RE = /<footer\b[\s\S]*?<\/footer>/i;
// Match the <section …> open tag treating quoted attribute values as opaque, so a `>`
// inside an attribute (e.g. a future Stage-6 `data-scene-spec` carrying JSON) can't end
// the tag early and corrupt the slice. The catch-all arm EXCLUDES quotes (`[^>"']`, not
// `[^>]`) so each character matches exactly one alternative — without that, a `"` could
// match either the quote-pair arm or the catch-all, and a run of quotes backtracks
// exponentially (ReDoS). Disjoint alternatives ⇒ linear. Requires balanced attribute
// quotes, which the engine always emits.
const OPEN_TAG_SRC = '<section\\b(?:"[^"]*"|\'[^\']*\'|[^>"\'])*>';
const SECTION_RE = new RegExp(`${OPEN_TAG_SRC}[\\s\\S]*?</section>`, 'gi');
const OPEN_TAG_RE = new RegExp(`^${OPEN_TAG_SRC}`, 'i');
const CLOSE = '</section>';

function attrOf(openTag, name) {
  const m = openTag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return m ? m[2] : null;
}

// Resolve the composition for a scene from its poster's aspect + the deck
// orientation, and stamp it on the open <section> tag — the mirror of
// image-dimensions.stampImageComposition, reading the INLINE poster instead of a
// file. An explicit author class wins; an unreadable/absent poster → the Clean
// floor. Idempotent (skips an already-stamped tag).
function stampComposition(openTag, inner) {
  if (/\bdata-img-composition=/i.test(openTag)) return openTag;
  const cls = attrOf(openTag, 'class') || '';
  const svg = (inner.match(SVG_RE) || [''])[0];
  const dim = svg ? aspectFromSvgTag(svg) : null;
  const bucket = dim ? bucketForAspect(dim.w, dim.h) : null;
  const composition = compositionFromClass(cls)
    || resolveComposition(bucket, attrOf(openTag, 'data-orientation'));
  let out = openTag;
  if (bucket && !/\bdata-img-bucket=/i.test(out)) {
    out = out.replace(/^<section\b/i, `<section data-img-bucket="${bucket}"`);
  }
  return out.replace(/^<section\b/i, `<section data-img-composition="${composition}"`);
}

// Wrap the poster svg in `.scene-figure` and the heading + caption in
// `.scene-text` (mirrors image's wrapImageText). Idempotent on `.scene-figure`.
function renderSection(inner) {
  if (inner.indexOf('scene-figure') !== -1) return inner; // idempotent
  const m = inner.match(SVG_RE);
  if (!m) return inner; // no inlined poster → no-op (a placeholder is the author's job)
  const svg = m[0];

  // Keep Marp's header/footer OUTSIDE the layout wrappers (they're chrome, not content).
  const header = (inner.match(HEADER_RE) || [''])[0];
  const footer = (inner.match(FOOTER_RE) || [''])[0];
  let body = inner;
  if (header) body = body.replace(header, '');
  if (footer) body = body.replace(footer, '');
  body = body.replace(svg, ''); // the text is everything that isn't the poster

  const figure = `<div class="scene-figure">${svg}</div>`;
  const text = `<div class="scene-text">${body.trim()}</div>`;
  // DOM order is figure-then-text (mirrors image's bg-then-image-text): the grid /
  // absolute compositions place them by area, and the flex `gallery` reads it as
  // frame-then-placard (the placard sits BELOW the exhibit, like image's gallery).
  return `${header}${figure}${text}${footer}`;
}

// Stamp the composition on the tag AND wrap the inner — one whole `section.scene`.
function transformSection(sectionHtml) {
  const om = sectionHtml.match(OPEN_TAG_RE);
  if (!om) return sectionHtml;
  const openTag = om[0];
  // Quote-agnostic class read (mirrors stampComposition / image's stampImageComposition).
  if (!/\bscene\b/.test(attrOf(openTag, 'class') || '')) return sectionHtml;
  const inner = sectionHtml.slice(openTag.length, sectionHtml.length - CLOSE.length);
  return `${stampComposition(openTag, inner)}${renderSection(inner)}${CLOSE}`;
}

// Build path (engine + emulator): string-in/string-out over every section.
//
// NOTE on pipeline position: unlike image (whose wrapImageText runs LATE and folds
// every stray child into `.image-text`), scene wraps here in the registry pass, which
// runs BEFORE the tile/backdrop injectors. Scene is safe today because every injector
// skips it — the sovereign frame suppresses its chrome cells and scene is `form`-toggle
// exempt (so watermark/progress never target it). A FUTURE injector that targets all
// sections would drop a loose child into scene's grid; if one is added, it must exclude
// `section.scene` (or scene must move its wrap after it). See the adversarial-trio note
// in engineering/decisions/2026-07-18-anima-motion-faculty-modes.md.
function applyToRenderedHtml(html) {
  return html.replace(SECTION_RE, (sec) => transformSection(sec));
}

// Runtime path (lattice-runtime DOM walk): resolve + stamp + wrap on the live DOM.
function applyToDom(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  for (const sec of root.querySelectorAll('section.scene')) {
    if (!sec.getAttribute('data-img-composition')) {
      const svg = sec.querySelector('svg');
      const dim = svg ? aspectFromSvgTag(svg.outerHTML) : null;
      const bucket = dim ? bucketForAspect(dim.w, dim.h) : null;
      if (bucket) sec.setAttribute('data-img-bucket', bucket);
      const composition = compositionFromClass(sec.className || '')
        || resolveComposition(bucket, sec.getAttribute('data-orientation') || undefined);
      sec.setAttribute('data-img-composition', composition);
    }
    if (!sec.querySelector(':scope .scene-figure')) sec.innerHTML = renderSection(sec.innerHTML);
  }
}

module.exports = { applyToRenderedHtml, applyToDom, renderSection, stampComposition, transformSection };
