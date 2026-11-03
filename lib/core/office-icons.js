/**
 * lib/core/office-icons.js — how an editable PowerPoint or LibreOffice file draws the deck's icons, decided ONCE for
 * the command line and the Studio. It is an export choice, like "editable" itself, so the deck's front matter does
 * not carry it: it depends on who opens the file, not on the deck.
 *
 *   shapes  (default) each icon is a native outline shape, drawn from the icon's own paths, so an app that ignores the
 *           file's fonts (Google Slides; iPhone Preview, rendered through the macOS Quick Look suite) still draws it,
 *           and it recolors as a shape. Keynote is unchecked.
 *   font    turned off (`--no-icon-shapes`, or the Studio's "Icons for every app" switch): each icon is a character
 *           of our Lattice Icons font, embedded in the file. It flows with the text and edits like a letter, but only
 *           an app that loads embedded fonts (desktop PowerPoint; LibreOffice from an .odp) draws it. Google Slides and
 *           iPhone Preview show a box or another font's picture for the same code point.
 *
 * Why shapes by default: whoever exports rarely controls where the file is opened, and a wrong icon on a slide costs
 * more than an icon that does not reflow (engineering/decisions/2026-11-01-icon-font.md § 3.6). PDF, the web page and
 * the player always load their fonts, so they draw the glyph whatever this says. Under `icon: svg` the page shows the
 * drawing, which Calco lifts as a shape anyway, and under `fonts: system-emoji` no icon font is embedded at all, so
 * both give shapes with the switch off too.
 *
 * A LEAF: no `require`. Pure.
 */
/** The formats this decides for: the editable office files Calco writes. */
const OFFICE_FORMATS = Object.freeze(['pptx', 'odp']);

/**
 * Does this export draw its icons as shapes (so each slide shows the icons' <svg>, which Calco lifts as native shapes)?
 * Only an EDITABLE office file: a picture-per-slide file draws the page as it is, and the page (and any player or HTML
 * written beside it from the same render) keeps the font.
 * @param {{ format: string, editable: boolean, shapes?: boolean, emojiTier?: string }} p  `shapes` is the switch (on unless false)
 */
function iconsAsShapes({ format, editable, shapes, emojiTier }) {
  return !!editable && OFFICE_FORMATS.includes(format) && (shapes !== false || emojiTier === 'system');
}

module.exports = { OFFICE_FORMATS, iconsAsShapes };
