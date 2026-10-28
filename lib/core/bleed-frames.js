/**
 * bleed-frames.js — which slides draw their spectrum bar as an overlay (lib/core/slide-bar.js).
 *
 * A dependency-free module of its own so the browser runtime can import the predicate without
 * pulling in the HTML walker the engine-side injector needs. The CSS side of the same list is the
 * `:not(...)` on the placement rules in base.variants.css, and test/unit/core/slide-bar.test.js
 * pins the two together.
 */

/** Frames that always claim the whole slide. */
const BLEED_FRAMES = Object.freeze(['image', 'scene', 'split-panel', 'split-compare']);

/** `claim-bleed` makes these frames bleed; any other `claim-bleed` frame keeps its border bar. */
const CLAIM_BLEED_MEDIA = Object.freeze(['chart-frame', 'big-number', 'diagram', 'image', 'video']);

/**
 * Does a slide with these class words draw its bar as the overlay? `cls` is an array of words.
 * Mirrors the CSS that zeroes the border on these frames (base.variants.css, collage.styles.css,
 * stage.css): a frame listed here has no bar border, and a frame that is not has one.
 */
function sectionIsBleed(cls) {
  const has = (c) => cls.includes(c);
  if (BLEED_FRAMES.some(has)) return true;
  if (has('collage') && has('bleed')) return true;
  if (has('form') && has('claim-bleed') && CLAIM_BLEED_MEDIA.some(has)) return true;
  return false;
}

module.exports = { sectionIsBleed, BLEED_FRAMES, CLAIM_BLEED_MEDIA };
