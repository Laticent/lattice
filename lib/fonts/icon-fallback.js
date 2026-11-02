// Draw a page's icons as <svg> instead of Lattice Icons glyphs: what an export does under the Emoji font setting
// `system`, because no machine has our icon font (engineering/decisions/2026-11-01-icon-font.md § 3.4).
//
// The switch is the slide's own `icon-svg` class, the class `icon: svg` stamps, so one CSS rule serves every host:
// the command line's page and player, the Studio's camera and its player. An attribute on <html> did not: the
// Studio scopes `:root` to each slide, and the player writes a new <html> of its own, so both lost it.
//
// Requires nothing, so the docs dev server's CommonJS shim can serve it.

const CLASS = 'icon-svg';
// One <section ...> open tag, its attribute values quoted with either mark (a `>` inside one does not end the tag).
const SECTION_OPEN = /<section\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
const CLASS_ATTR = /(\sclass\s*=\s*)(?:"([^"]*)"|'([^']*)')/i;

/** The markup with `icon-svg` on every <section>'s class list (once). */
function drawIconsAsSvg(html) {
  return String(html).replace(SECTION_OPEN, (tag, attrs) => {
    const m = CLASS_ATTR.exec(attrs);
    if (!m) return `<section${attrs} class="${CLASS}">`;
    const list = m[2] ?? m[3];
    if (list.split(/\s+/).includes(CLASS)) return tag;
    const quote = m[2] === undefined ? "'" : '"';
    const next = `${m[1]}${quote}${list ? `${list} ` : ''}${CLASS}${quote}`;
    return `<section${attrs.slice(0, m.index)}${next}${attrs.slice(m.index + m[0].length)}>`;
  });
}

// A <section> open or close tag, or an icon's glyph box, in document order.
const SCAN = /<section\b((?:[^>"']|"[^"]*"|'[^']*')*)>|<\/section\s*>|\bclass\s*=\s*["'][^"']*\blat-(?:icon|pill)-glyph\b/gi;

/**
 * True when the markup draws at least one icon as a glyph: a glyph box with no `icon-svg` section around it, the same
 * test the stylesheet makes (icons.styles.css). So a deck under `icon: svg` loads no icon font.
 */
function drawsIconGlyphs(html) {
  const open = [];
  let svgDepth = 0;
  for (const m of String(html).matchAll(SCAN)) {
    if (m[0][0] !== '<') {
      if (svgDepth === 0) return true;
    } else if (m[0][1] === '/') {
      if (open.pop()) svgDepth--;
    } else {
      const c = CLASS_ATTR.exec(m[1]);
      const svg = !!c && (c[2] ?? c[3]).split(/\s+/).includes(CLASS);
      open.push(svg);
      if (svg) svgDepth++;
    }
  }
  return false;
}

module.exports = { drawIconsAsSvg, drawsIconGlyphs, ICON_SVG_CLASS: CLASS };
