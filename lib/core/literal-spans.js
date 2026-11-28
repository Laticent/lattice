/**
 * lib/core/literal-spans.js — the text between a literal open and close, read in one pass (regex PR 3). Split from
 * tag-scan.js so the lint core, which loads tag-scan.js for `scanTags` only, does not carry it: these modules are
 * CommonJS, so a bundle keeps every export of a module it loads. Pure string work: both render paths call it.
 */

/**
 * Every match of `/<open>([\s\S]*?)<close>/g` with `open` and `close` taken literally, as the arrays `matchAll` returned:
 * [full, inner] with `index`. The lazy regex rescanned to the end of the text from every `open` with no `close` after it
 * (quadratic on a cell of `<code><code><code>`, regex PR 3); here each `close` is searched for once from the end of its
 * `open`, and once none is left no later `open` can match either.
 * @param {string} html
 * @param {string} open
 * @param {string} close
 * @returns {Array<[string, string] & { index: number }>}
 */
function literalSpans(html, open, close) {
  const src = String(html);
  const out = [];
  let from = 0;
  for (;;) {
    const at = src.indexOf(open, from);
    if (at < 0) return out;
    const end = src.indexOf(close, at + open.length);
    if (end < 0) return out;
    const m = [src.slice(at, end + close.length), src.slice(at + open.length, end)];
    m.index = at;
    out.push(m);
    from = end + close.length;
  }
}

/** The trimmed inner text of the first `literalSpans` match, or null: `html.match(/<open>([\s\S]*?)<close>/)?.[1].trim()`. */
function firstSpanText(html, open, close) {
  const src = String(html);
  const at = src.indexOf(open);
  if (at < 0) return null;
  const end = src.indexOf(close, at + open.length);
  return end < 0 ? null : src.slice(at + open.length, end).trim();
}

module.exports = { literalSpans, firstSpanText };
