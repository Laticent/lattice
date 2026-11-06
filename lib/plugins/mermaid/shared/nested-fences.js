/**
 * lib/plugins/mermaid/shared/nested-fences.js — splicing a drawn figure back where a Mermaid fence stood inside a
 * blockquote or a list item, so the figure stays in its container (followups.d/2739-p7, p12).
 *
 * The fences themselves are no longer found here. Since D2 slice 3 the host hands the bake the fences the ENGINE parses,
 * each with its container prefix (`ctx.fences()`, lib/core/plugin-fences.mjs), so this module keeps only what the splice
 * needs: `reprefix` lays the figure's markup under the prefix, and `blankLineAfter` keeps the next line out of the HTML
 * block the figure opens (engineering/decisions/2026-11-06-plugin-patterns.md §9).
 *
 * @module
 */

/**
 * `html`, placed where a fence with this `prefix` stood: every line carries the container prefix, with a
 * list marker turned into spaces after the first line, and no blank line (it would end the HTML block, and
 * with it the quote or the item).
 *
 * @param {string} html
 * @param {string} prefix
 * @returns {string}
 */
function reprefix(html, prefix) {
  const rest = prefix.replace(/\d{1,9}[.)]|[-*+](?=\s)/, (m) => ' '.repeat(m.length));
  return String(html)
    .replace(/\n[ \t]*(?=\n)/g, '')
    .split('\n')
    .map((l, i) => (i === 0 ? prefix : rest) + l)
    .join('\n');
}

/**
 * The blank line to put after a baked figure, or `''`. The bake splices an HTML block over the fence,
 * and markdown-it ends a type-6/7 HTML block only at a blank line, so a line written straight under the
 * closing fence (`> Caption **bold**`) joined the figure's block and showed its markdown raw, where the
 * Studio renders it as a paragraph (followups.d/2739-p12). A next line the block would NOT take is left
 * alone: a blank one, or one outside the container (a new list item, a line with no `>`), since an HTML
 * block takes no lazy continuation. The blank line carries the container's quote markers, so a quote
 * stays one quote.
 *
 * @param {string} prefix what stood before the fence marker on its opener line ('' for a flat fence)
 * @param {string | undefined} next the source line after the closing fence
 * @returns {string} `'\n'` plus the blank line, or `''`
 */
function blankLineAfter(prefix, next) {
  if (next === undefined || !next.trim()) return '';
  const rest = prefix.replace(/\d{1,9}[.)]|[-*+](?=\s)/, (m) => ' '.repeat(m.length));
  // The container's quote markers, in order: a line without them is outside the quote, and the block does not take it.
  const quotes = (rest.match(/>/g) || []).length;
  let i = 0;
  for (let q = 0; q < quotes; q++) {
    while (next[i] === ' ' && i < next.length) i++;
    if (next[i] !== '>') return '';
    i++;
    if (next[i] === ' ') i++;
  }
  const body = next.slice(i);
  if (!body.trim()) return '';
  // In a list (or a flat fence), a new list item under the figure is the list's own: a blank line before it would
  // make the list loose, and the HTML block does not take it anyway. Any other line joins the block, whatever its
  // indent: the fence's indent is not the item's (an author can over-indent it), and a quote needs none.
  const tail = rest.slice(rest.lastIndexOf('>') + 1);
  const inList = !quotes || /\d{1,9}[.)]|[-*+](?=\s)/.test(prefix.slice(prefix.lastIndexOf('>') + 1));
  if (inList && /^ *(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/.test(body) && body.match(/^ */)[0].length < tail.length - (quotes ? 1 : 0)) return '';
  return `\n${rest.replace(/[ \t]+$/, '')}`;
}

module.exports = { reprefix, blankLineAfter };
