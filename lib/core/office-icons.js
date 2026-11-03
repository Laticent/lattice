/**
 * lib/core/office-icons.js — how an editable PowerPoint or LibreOffice file draws the deck's icons, decided ONCE for
 * the command line and the Studio.
 *
 * Always as native outline shapes, drawn from each icon's own paths: an app that ignores the file's fonts (Google
 * Slides; iPhone Preview, rendered through the macOS Quick Look suite) still draws them, desktop PowerPoint and
 * LibreOffice draw them as well, and each recolors as a shape. There is no switch (the owner, 2026-11-03): the icon font
 * in an editable file never flowed with the text (each glyph was its own box over the sentence), so it bought nothing
 * the shape does not, and cost every app that ignores embedded fonts its icons
 * (engineering/decisions/2026-11-01-icon-font.md § 3.6). PDF, the web page and the player load their fonts, so they draw
 * the glyph.
 *
 * A LEAF: no `require`. Pure.
 */
/** The formats this decides for: the editable office files Calco writes. */
const OFFICE_FORMATS = Object.freeze(['pptx', 'odp']);

/**
 * Does this export draw its icons as shapes (so each slide shows the icons' <svg>, which Calco lifts as native shapes)?
 * Only an EDITABLE office file: a picture-per-slide file draws the page as it is, and the page (and any player or HTML
 * written beside it from the same render) keeps the font.
 * @param {{ format: string, editable: boolean }} p
 */
function iconsAsShapes({ format, editable }) {
  return !!editable && OFFICE_FORMATS.includes(format);
}

module.exports = { OFFICE_FORMATS, iconsAsShapes };
