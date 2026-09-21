/**
 * plain-text.js — tags off, entities decoded. The label-text extractor every
 * kernel that reads WORDS out of markdown-it output needs.
 *
 * WHY THIS IS IN `lib/core` AND NOT IN THE CHART FAMILY. It began life in
 * `lib/components/chart/_chart-family/transform-utils.js`, where only SVG chart
 * kernels reached for it. `lib/core/label-set.js` now needs it too — a label set
 * is lifted out of an inline-code paragraph, and the paragraph arrives as
 * markdown-it HTML — and a core primitive must never import a component kernel
 * (transform-utils states the same rule about `html-lists.js`, one level up from
 * here). So the implementation moved down and `transform-utils` re-exports it:
 * one source of truth (HARD RULE #1), and the ~28 existing call sites are
 * untouched because the name they import still resolves.
 *
 * THIS IS THE QUADRANT/RADAR FLAVOR, and the distinction is load-bearing:
 * `stripTags` folds `&nbsp;` to a space. `funnel`/`map` carry a local variant
 * that folds `&amp;` instead. Those were deliberately NOT merged — byte-level
 * output compatibility beats a forced abstraction — and moving this one here
 * does not merge them either.
 *
 * NOT A SECURITY BOUNDARY. This is a label-text extractor. Untrusted deck HTML
 * is sanitized by `sanitizeSlideHtml`/DOMPurify before any preview frame
 * (HARD RULE #22), and the labels it returns pass back through
 * `escHtml`/`escAttr` at the emitters.
 *
 * Pure string-in/string-out — no fs, no DOM — safe for every browser bundle.
 */

function stripTags(s) {
  // Fixed-point strip: removing a tag can splice a NEW tag together from the
  // surrounding text (`<scr<script>ipt>`), so repeat until stable (CodeQL
  // js/incomplete-multi-character-sanitization). On well-formed markdown-it
  // output one pass already reaches the fixed point, so this is
  // byte-identical for real decks.
  let out = String(s);
  let prev;
  do { prev = out; out = out.replace(/<[^>]+>/g, ''); } while (out !== prev);
  return out.replace(/&nbsp;/g, ' ').trim();
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
function plainText(s) {
  return stripTags(s)
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

module.exports = { stripTags, plainText };
