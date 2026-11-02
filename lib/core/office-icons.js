/**
 * lib/core/office-icons.js — how an editable PowerPoint or LibreOffice file draws the deck's icons, decided ONCE for
 * the command line and the Studio.
 *
 *   shapes  (default) each icon is a native outline shape, drawn from the icon's own paths: it looks the same in
 *           PowerPoint, Keynote, Google Slides, iPhone Preview and LibreOffice, and recolors as a shape.
 *   font    each icon is a character of our Lattice Icons font, embedded in the file: it flows with the text and edits
 *           like a letter, but only an app that loads embedded fonts (desktop PowerPoint, LibreOffice) draws it. Google
 *           Slides and iPhone Preview show a box or another font's picture for the same code point.
 *
 * Why shapes by default: whoever exports rarely controls where the file is opened, and a wrong icon on a slide costs
 * more than an icon that does not reflow (engineering/decisions/2026-11-01-icon-font.md § 3.6). PDF, the web page and
 * the player always load their fonts, so they draw the glyph whatever this says. Under `fonts: system-emoji` no icon font
 * is embedded at all, so `font` falls back to shapes.
 *
 * Written as `office-icons:` in front matter or `--office-icons` on the command line. A LEAF: no `require`. Pure.
 */
const OFFICE_ICON_MODES = Object.freeze(['shapes', 'font']);
const DEFAULT_OFFICE_ICONS = 'shapes';
/** The formats this decides for: the editable office files Calco writes. */
const OFFICE_FORMATS = Object.freeze(['pptx', 'odp']);

/**
 * @param {unknown} value  the front-matter text or the flag's value
 * @returns {{ mode: 'shapes'|'font', unknown: string|null }}  `unknown` is the word as written when it is not a mode
 */
function parseOfficeIcons(value) {
  const word = String(value ?? '').trim();
  if (!word) return { mode: DEFAULT_OFFICE_ICONS, unknown: null };
  const w = word.toLowerCase();
  return OFFICE_ICON_MODES.includes(w) ? { mode: w, unknown: null } : { mode: DEFAULT_OFFICE_ICONS, unknown: word };
}

/** The flag over the deck's line: a written flag wins. */
function resolveOfficeIcons(deck, over) {
  return parseOfficeIcons(String(over ?? '').trim() ? over : deck).mode;
}

/**
 * Does this export draw its icons as shapes (so each slide shows the icons' <svg>, which Calco lifts as native shapes)?
 * Only an EDITABLE office file: a picture-per-slide file draws the page as it is, and the page (and any player or HTML
 * written beside it from the same render) keeps the font.
 * @param {{ format: string, editable: boolean, mode: string, emojiTier?: string }} p
 */
function iconsAsShapes({ format, editable, mode, emojiTier }) {
  return !!editable && OFFICE_FORMATS.includes(format) && (mode !== 'font' || emojiTier === 'system');
}

module.exports = { OFFICE_ICON_MODES, DEFAULT_OFFICE_ICONS, OFFICE_FORMATS, parseOfficeIcons, resolveOfficeIcons, iconsAsShapes };
