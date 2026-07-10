/**
 * lattice-engine — KaTeX-free math-syntax detection.
 *
 * A pure predicate: does `src` contain Lattice's `$…$` / `$$…$$` math syntax?
 * Mirrors math.js's markdown-it delimiter guards (kept in sync deliberately —
 * see math.js's header) WITHOUT requiring katex itself, so a caller that only
 * needs to know "will this deck need math support?" — the playground's
 * lazy-load pre-scan (docs/src/lib/render-engine.ts) — never pulls KaTeX's
 * ~78.5KB gzip into its own bundle just to ask the question.
 *
 * ESM (unlike the rest of lib/engine/, which is CJS) so it's directly
 * importable by the docs-site Vite build — the same DOM-free-kernel idiom as
 * lib/core/present-transport.mjs / lib/core/sanitize-slide-html.mjs. Not
 * required by math.js itself (kept fully standalone, zero shared code, so
 * this addition carries zero regression risk to the tested render path).
 *
 * Errs toward matching: a false positive (prose with an unpaired `$`) costs
 * one unnecessary async load; a false negative would silently ship a deck
 * with unrendered math. Scans the whole source rather than per-inline-block
 * (unlike the real markdown-it rule), so it can occasionally match across
 * unrelated blocks — harmless for a "should I load KaTeX?" decision.
 */



/**
 * Display: does `src` contain a line starting with `$$`, once you strip the
 * kind of leading container markup markdown-it strips before matching (list-
 * item indentation, blockquote `>` markers)? The real block rule
 * (`state.bMarks[startLine] + state.tShift[startLine]`) checks against the
 * line's content AFTER markdown-it removes that container prefix — so `$$`
 * indented inside a list item or blockquote is real, renderable display math
 * that a literal `^\$\$` anchor would miss (a false negative, found by
 * adversarial review: it rendered correctly via the CLI/PDF path, since
 * Node/CLI's KaTeX is always eager, but silently degraded to escaped text in
 * the browser docs site, since nothing triggered the lazy KaTeX load). This
 * doesn't need to replicate markdown-it's full container-parsing — permitting
 * leading spaces/tabs/`>` is enough to catch list/blockquote nesting without
 * losing the "errs toward matching" property.
 */
export function hasDisplayMath(src) {
  return /^[ \t>]*\$\$/m.test(src);
}

/**
 * Inline: is there a valid `$…$` span anywhere in `src`? An opening `$` must
 * not be followed by whitespace/end-of-string; a closing `$` must not be
 * preceded by whitespace nor followed by a digit — the same guards that keep
 * currency prose ("$400M, up 28% YoY, ahead by $18M") from parsing as math.
 */
export function hasInlineMath(src) {
  for (let i = 0; i < src.length; i++) {
    if (src[i] !== '$') continue;
    if (src[i + 1] === '$') {
      // `$$` → the FIRST `$` isn't an inline opener (hasDisplayMath handles
      // block math), but markdown-it's real inline rule, on failing to open
      // here, falls through to plain text and retries at the NEXT position —
      // so the SECOND `$` can still open a valid inline span (`$$b$` renders
      // `$b$` as math; a false negative found by adversarial review). Only
      // skip THIS position; let the loop's own `i++` reach the second `$`.
      continue;
    }
    const openNext = src.charCodeAt(i + 1);
    if (Number.isNaN(openNext) || openNext === 0x20 || openNext === 0x09) continue;
    let end = i + 1;
    while (end < src.length) {
      if (src[end] === '$' && src[end - 1] !== '\\') {
        const prev = src.charCodeAt(end - 1);
        const after = end + 1 < src.length ? src.charCodeAt(end + 1) : -1;
        const prevWs = prev === 0x20 || prev === 0x09;
        const afterDigit = after >= 0x30 && after <= 0x39;
        if (!prevWs && !afterDigit) return true;
      }
      end += 1;
    }
  }
  return false;
}

export function sourceHasMath(src) {
  return Boolean(src) && (hasDisplayMath(src) || hasInlineMath(src));
}
