/**
 * Read start tags out of rendered SVG/HTML for assertions, in one linear pass.
 *
 * Why not a regex per assertion: the shape `/<text class="x"[^>]*data-y="(\d+)"/` backtracks, so a test regex over a
 * large render is quadratic on adversarial text (CodeQL js/polynomial-redos), and it also ties the test to attribute
 * order. This reads each tag once, honoring quoted attribute values, and hands back its attributes by name.
 *
 *   tagsOf(svg, 'text').filter((t) => t.attrs.class === 'quadrant-label')
 *   firstTspan(svg, tag).attrs.y
 */

'use strict';

const ATTR = /\s+([^\s=>/"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/y;

/** The index of the `>` closing the tag that starts at `lt`, skipping quoted values, or -1. */
function tagEnd(src, lt) {
  let q = '';
  for (let i = lt + 1; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === q) q = '';
    } else if (c === '"' || c === "'") q = c;
    else if (c === '>') return i;
  }
  return -1;
}

/** The attributes of the tag text `raw` (`<name a="1" b>`), by name. */
function attrsOf(raw, nameLength) {
  const attrs = Object.create(null);
  ATTR.lastIndex = 1 + nameLength;
  for (let m = ATTR.exec(raw); m; m = ATTR.exec(raw)) {
    if (!(m[1] in attrs)) attrs[m[1]] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return attrs;
}

/**
 * Every start tag named `name` (any name when `name` is null), in document order.
 * @returns {Array<{ name: string, attrs: Record<string, string>, raw: string, start: number, end: number }>}
 *   `end` is the index just past the tag's `>`.
 */
function tagsOf(html, name = null) {
  const src = String(html);
  const out = [];
  let from = 0;
  for (;;) {
    const lt = src.indexOf(name ? `<${name}` : '<', from);
    if (lt < 0) break;
    from = lt + 1;
    const m = /^<([A-Za-z][\w:-]*)/.exec(src.slice(lt, lt + 64));
    if (!m || (name && m[1] !== name)) continue;
    const gt = tagEnd(src, lt);
    if (gt < 0) break;
    const raw = src.slice(lt, gt + 1);
    out.push({ name: m[1], attrs: attrsOf(raw, m[1].length), raw, start: lt, end: gt + 1 });
    from = gt + 1;
  }
  return out;
}

/** The content of the element whose start tag is `tag`, up to its first `</name>`. */
function innerOf(html, tag) {
  const src = String(html);
  const close = src.indexOf(`</${tag.name}>`, tag.end);
  return src.slice(tag.end, close < 0 ? src.length : close);
}

/** The first `<tspan>` inside the element whose start tag is `tag`, or null. */
function firstTspan(html, tag) {
  return tagsOf(innerOf(html, tag), 'tspan')[0] || null;
}

module.exports = { tagsOf, innerOf, firstTspan };
