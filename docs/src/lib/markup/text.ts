/**
 * text.ts — tags off, entities decoded: the label-text extractor every kernel that reads WORDS out of markdown-it
 * output needs. `stripTags` folds `&nbsp;` to a space; `plainText` also decodes entities, `&amp;` last so `&amp;lt;`
 * stays the author's literal `&lt;`. NOT A SECURITY BOUNDARY: untrusted deck HTML is sanitized before any preview
 * frame (HARD RULE #22), and the labels these return pass back through an escaper at the emitters. Moved from
 * lib/core/plain-text.js, unchanged. Pure string-in/string-out.
 */

/**
 * Tags off, nothing else: no trim, no entity work. A fixed-point strip: removing a tag
 * can splice a NEW tag together from the surrounding text (`<scr<script>ipt>`), so it
 * repeats until stable (CodeQL js/incomplete-multi-character-sanitization). On
 * well-formed markdown-it output one pass already reaches the fixed point, so this is
 * byte-identical for real decks. The local label strippers in the chart kernels, the
 * carousel and the background-image check all call this (#1958), each keeping its own
 * entity and whitespace handling around it.
 */
export function removeTags(s: unknown): string {
  let out = String(s);
  let prev: string;
  do {
    prev = out;
    out = stripOnce(out);
  } while (out !== prev);
  return out;
}

/**
 * One left-to-right pass of `/<[^>]+>/g` → '', in linear time. The regex retried from every `<` and scanned to the
 * end of the string when no `>` followed, which is quadratic on text holding many `<` (CodeQL js/polynomial-redos).
 * Same matches: from a `<`, the tag runs to the first `>` after it and needs at least one character between; `<>`
 * is no tag, and once no `>` remains, no later `<` can open one.
 */
function stripOnce(src: string): string {
  let out = '';
  let at = 0;
  let from = 0;
  for (;;) {
    const lt = src.indexOf('<', from);
    if (lt < 0) break;
    const gt = src.indexOf('>', lt + 1);
    if (gt < 0) break;
    if (gt === lt + 1) {
      from = lt + 1;
      continue;
    }
    out += src.slice(at, lt);
    at = gt + 1;
    from = gt + 1;
  }
  return out + src.slice(at);
}

export function stripTags(s: unknown): string {
  return removeTags(s).replace(/&nbsp;/g, ' ').trim();
}

// Plain TEXT out of a markdown-it fragment: tags off AND entities decoded.
//
// An SVG kernel takes text, not markup — the wrapping emitter escapes whatever
// it is handed — so skipping the decode double-escapes: markdown-it writes
// `Ops &amp; IT`, the emitter escapes the `&` again, and the chart paints the
// literal `Ops &amp; IT`. (The old HTML gantt interpolated the fragment into a
// `<div>`, where the entity simply rendered, which is why this only surfaced
// once the charts went SVG.)
//
// `&amp;` decodes LAST so `&amp;lt;` becomes `&lt;` — the author's literal
// text — rather than being re-decoded into `<`.
export function plainText(s: unknown): string {
  return stripTags(s)
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}
