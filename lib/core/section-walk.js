/**
 * mapSections — the shared depth-aware `<section>` walker every
 * applyToRenderedHtml-style transform uses to visit Marpit's rendered
 * slides and rewrite the ones it owns.
 *
 * Before this module the identical ~30-line scan loop was pasted into five
 * transforms (chart-family, roadmap, journey, split-panels, masthead — the
 * masthead copy even said "Mirrors the walker in lib/core/split-panels.js").
 * Each copy differed ONLY in which sections it matched and what it did with
 * them, so that variation is the callback here and the walk is written once.
 *
 * The scan is depth-aware because user content can nest <section> inside a
 * slide; a naive indexOf('</section>') would close the slide at the inner
 * tag and hand the transform half a slide.
 *
 * Contract:
 *   mapSections(html, rewrite) → html
 *   rewrite(openTag, cls, inner) is called for EVERY top-level section:
 *     - openTag  the verbatim `<section ...>` open tag (attributes intact)
 *     - cls      the value of its class attribute ('' when absent)
 *     - inner    everything between the open tag and its matching close
 *   Return value:
 *     - null / undefined            → section passes through byte-identical
 *     - a string                    → replaces inner (open/close tags kept)
 *     - { openTag, inner }          → replaces both (e.g. chart-family
 *                                     patching the class attribute)
 *
 * Pure string-in/string-out — no fs, no DOM — safe for every browser bundle.
 */

function mapSections(html, rewrite) {
  let out = '';
  let i = 0;
  while (i < html.length) {
    const open = html.indexOf('<section', i);
    if (open < 0) { out += html.slice(i); break; }
    out += html.slice(i, open);
    const tagEnd = html.indexOf('>', open);
    if (tagEnd < 0) { out += html.slice(open); break; }
    const openTag = html.slice(open, tagEnd + 1);
    const classMatch = openTag.match(/\sclass="([^"]*)"/);
    const cls = classMatch ? classMatch[1] : '';

    // Depth-aware </section> scan. Jumps straight to the next '<section' or
    // '</section>' via indexOf rather than testing every character position —
    // same matching semantics (the leftmost occurrence of either literal
    // substring), just without the O(n) startsWith probe at each char.
    let depth = 1, pos = tagEnd + 1, closeEnd = -1;
    while (pos < html.length) {
      const nextOpen = html.indexOf('<section', pos);
      const nextClose = html.indexOf('</section>', pos);
      if (nextClose < 0) break;
      if (nextOpen >= 0 && nextOpen < nextClose) {
        const e = html.indexOf('>', nextOpen);
        if (e < 0) break;
        depth++; pos = e + 1;
      } else {
        depth--;
        if (depth === 0) { closeEnd = nextClose + '</section>'.length; break; }
        pos = nextClose + '</section>'.length;
      }
    }
    if (closeEnd < 0) { out += html.slice(open); break; }

    const inner = html.slice(tagEnd + 1, closeEnd - '</section>'.length);
    const result = rewrite(openTag, cls, inner);
    if (result === null || result === undefined) {
      out += html.slice(open, closeEnd);
    } else if (typeof result === 'string') {
      out += openTag + result + '</section>';
    } else {
      out += (result.openTag ?? openTag) + (result.inner ?? inner) + '</section>';
    }
    i = closeEnd;
  }
  return out;
}

module.exports = { mapSections };
