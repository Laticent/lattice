/**
 * slide-bar.js — the spectrum bar as an OVERLAY, for the full-bleed frames.
 *
 * A full-bleed frame (a photo, a scene, a split panel, a bleed collage, a media slide that claims
 * the stage) paints to the slide's edge and sets `padding: 0`, so it has no margin to give a bar
 * border: a border there only shrinks the photo or panel by the bar's width. These frames draw
 * the bar as an absolutely positioned layer instead, `<i class="slide-bar">`, over the whole
 * slide on the chrome plane. It takes no layout room, so the frame keeps its true edge under
 * every `spectrum-edge:`, and it sits above the art, not under it.
 *
 * Every other frame keeps the bar as a border that the section's padding gives up
 * (base.elements.css), which check:edge-shift measures. The two lists below are the one place that
 * says which frames are which; the CSS side of the same list is the `:not(...)` on the placement
 * rules in base.variants.css, and test/unit/core/slide-bar.test.js pins the two together.
 *
 * Lives in lib/core, not beside the other HTML-stage injectors, because three stages run it and
 * they cannot import each other (HARD RULE #1): the engine runs it once per render, the splitter
 * runs it again over the pages it re-authors (a cover, a carousel page), and the runtime carries
 * the DOM twin (`injectSlideBars`, lib/runtime/index.js). Pure and fs-free.
 *
 * The export-to-Marp bundle ships CSS only and cannot inject markup, so a bleed frame has no bar
 * there. lib/core/marp-fidelity.js carries no row for engine-only HTML passes; the same holds for
 * the finish `.backdrop`.
 */

const { mapSections } = require('./section-walk');
const { sectionIsBleed, BLEED_FRAMES, CLAIM_BLEED_MEDIA } = require('./bleed-frames');

const BAR_OPEN = '<i class="slide-bar"';
const BAR = `${BAR_OPEN} aria-hidden="true"></i>`;

/**
 * HTML-stage helper: append the `.slide-bar` layer as the LAST child of every top-level bleed
 * section. Last, not first: it is positioned and stacked by `z-index`, so its place in the flow
 * paints nothing, and a last child cannot become the target of a first-child rule or sit between
 * the logo and the content the way a leading one could. Idempotent: a section that already ends
 * with the layer passes through byte-identical, so re-processing engine-rendered HTML (the
 * emulator does, and so does the splitter) is a no-op.
 *
 * TOP-LEVEL SECTIONS ONLY, through the engine's walker, for the reason `applyBackdropToHtml`
 * gives: a `<section>` an author nests inside a slide is not a slide.
 */
function applySlideBarToHtml(html) {
  return mapSections(String(html || ''), (_openTag, classAttr, inner) => {
    if (!sectionIsBleed(classAttr.split(/\s+/).filter(Boolean))) return null;
    if (inner.includes(BAR_OPEN)) return null;
    return inner + BAR;
  });
}

module.exports = { applySlideBarToHtml, sectionIsBleed, BLEED_FRAMES, CLAIM_BLEED_MEDIA };
