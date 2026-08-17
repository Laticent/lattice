/**
 * lib/core/sanitize-style-text.mjs
 *
 * The STYLESHEET channel of HARD RULE #22 — the companion to
 * `sanitize-slide-html.mjs`, which guards the MARKUP channel of the same frame.
 *
 * WHY A SECOND SANITIZER. A preview builder assembles one document out of two
 * caller-influenced strings:
 *
 *     '…<style id="lattice-theme">' + themeCss + '</style></head><body>' + slideHtml
 *                                     ^^^^^^^^                            ^^^^^^^^^
 *                                     this file                           sanitizeSlideHtml
 *
 * #22 and its gate were both written about the second one. The first is a
 * script-execution path in its own right, and NOT for the reason it looks like:
 *
 * A `<style>` element's content is parsed in the HTML **RAWTEXT** state, which ends at
 * the first `</style`. That state knows nothing about CSS — not comments, not strings.
 * So a `</style>` sitting inside a perfectly well-formed CSS comment still ends the
 * element, and every byte after it is parsed as MARKUP in the live document:
 *
 *     /* Palette by …</style><img src=x onerror=…> *​/     <- the comment never mattered
 *
 * Measured in Chromium 131 against the real `single-slide-render.ts` assembly shape
 * (engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md §2): `</style>`
 * alone runs script; closing the CSS comment with `*​/` alone does not. That ordering
 * is the whole reason this file exists rather than only an escape at the serializer —
 * escaping `*​/` closes the LIVE-CSS channel and leaves the SCRIPT channel open.
 *
 * The frame this protects is same-origin and un-sandboxed by design, and HARD RULE #24
 * puts the user's own OpenRouter key in that origin, so script there is key theft (#616).
 *
 * WHAT IT DOES NOT DO. It is not a CSS sanitizer and must not become one. The CSS
 * reaching a preview frame is the engine's own composed sheet — ~1.5 MB of it — and
 * filtering that by allowlist would break the product, not protect it. The one thing
 * that turns CSS text into MARKUP is the element terminator, and that is the one thing
 * neutralized here. Everything a stylesheet can do AS a stylesheet (fetch a font,
 * repaint a token) it is meant to be able to do.
 */

/**
 * WHAT COUNTS AS THE TERMINATOR, and why it is DELIBERATELY WIDER THAN THE SPEC.
 *
 * HTML only closes the element when `</style` is followed by whitespace, `/` or `>`,
 * so `</styles>` is strictly just text. Encoding that delimiter set here would buy
 * nothing — `</style` does not occur in real CSS — and would put a second, subtler
 * tokenizer rule inside a security guard. Matching the prefix outright cannot be
 * wrong in the unsafe direction, which is the only direction that matters.
 */

/**
 * A stylesheet's text, safe to embed in a `<style>` element.
 *
 * The transform is a single backslash between `<` and `/`, which is the minimum that
 * separates the two characters the tokenizer pairs — and it is chosen because it is
 * also **semantically inert in CSS wherever `</style` can legitimately appear**:
 *
 *   - inside a string (`content: "</style>"`) — `\/` is CSS's escape for `/`, so the
 *     declaration computes to the identical value;
 *   - inside a comment or an unquoted `url()` — likewise a valid escape, and inert;
 *   - in code position — `<` was never valid CSS there, so there is nothing to preserve.
 *
 * Idempotent (`<\/style` contains no `</style`), which matters because the Studio's
 * RESTYLE fast path re-derives and re-swaps this string on every palette/mode toggle.
 *
 * Returns the input BY IDENTITY when there is nothing to escape, which is every real
 * stylesheet — see the measurement in the body.
 *
 * @param {string} css  stylesheet text bound for a `<style>` element
 * @returns {string} the same text with the element terminator neutralized
 */
/** `style`, lower-cased char codes — compared without allocating a substring. */
const S = [0x73, 0x74, 0x79, 0x6c, 0x65]; // s t y l e

/** Is there a `</style` at `i` (where `text[i]` is `<` and `text[i+1]` is `/`)? */
function isStyleEndAt(text, i) {
  for (let k = 0; k < 5; k++) {
    // `| 0x20` lower-cases an ASCII letter and leaves the comparison false for anything
    // that is not one, so this is the case-insensitive match with no `toLowerCase` copy.
    if ((text.charCodeAt(i + 2 + k) | 0x20) !== S[k]) return false;
  }
  return true;
}

export function sanitizeStyleText(css) {
  if (!css) return css;
  const text = String(css);
  // GUARD THE SCAN, NOT JUST THE COPY. This runs over the composed sheet (~1.5 MB) on
  // every srcdoc write and every restyle, and it is the same axis on which two earlier
  // cuts of the theme-import work were rejected (a 36x regression, and an O(n^2) scan
  // costing 20 s on a 1 MB sheet) — so it is measured, not assumed.
  //
  // A regex pass is 0.89 ms on dist/lattice.css and an `indexOf` pass is 0.0017 ms, a
  // ~500x difference, because `indexOf` is a memchr-class search while the `i`-flagged
  // regex walks. The obvious `if (indexOf('</') < 0) return text` fast path does NOT
  // fire on the real corpus — the base sheet carries `</svg` inside a data URI — so the
  // work is done as a hop-by-hop `indexOf` instead, verifying each landing site with
  // five charCode comparisons.
  //
  // The common case therefore allocates NOTHING and returns the input by identity.
  let i = text.indexOf('</');
  if (i < 0) return text;
  let out = null;
  let from = 0;
  while (i >= 0) {
    if (isStyleEndAt(text, i)) {
      if (out === null) out = '';
      // Splice a backslash between `<` and `/`, keeping the author's own bytes for the
      // tag name: the match is case-insensitive, and rewriting `</STYLE` to `</style`
      // would change the computed value of a `content: "</STYLE>"` declaration.
      out += `${text.slice(from, i)}<\\`;
      from = i + 1;
    }
    i = text.indexOf('</', i + 2);
  }
  return out === null ? text : out + text.slice(from);
}

export default sanitizeStyleText;
