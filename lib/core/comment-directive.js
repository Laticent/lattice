/**
 * lib/core/comment-directive.js
 *
 * The `<!-- key: value -->` / `<!-- _key: value -->` GRAMMAR — one definition,
 * shared by the render pipeline and by every module that has to answer a
 * directive question from raw source without rendering.
 *
 * The grammar is deliberately separate from the VOCABULARY (which keys are
 * directives at all, which may be written bare). The vocabulary is the engine's
 * (lib/engine/directives.js `KNOWN_DIRECTIVES` / `FLAG_DIRECTIVES`) and every
 * caller passes the slice of it that its question needs — the renderer passes
 * the whole set, and lib/core/slide-class-spans.js passes `class` alone, because
 * "which slide is this `_class:` on?" is a question about one key. Parsing is
 * identical either way: the key is extracted first and matched afterwards.
 *
 * WHY IT IS SHARED RATHER THAN RE-SPELLED. Marp's directive semantics are
 * "spot replaces global, global carries forward", and a module that re-spells
 * the grammar tends to re-spell only the half it noticed. The source-side band
 * resolver did exactly that: it matched `<!-- _class: … -->` with a local regex
 * and never saw the GLOBAL `<!-- class: … -->` form, so a deck that switched to
 * a dark canvas mid-deck rendered dark sections with light-baked Mermaid ink —
 * the #1326 disagreement class, one level up from where it was last closed.
 *
 * Pure and dependency-free.
 */

/**
 * Strip one layer of matching quotes, the way the engine's directive readers do.
 * Exported because a caller that reads a directive VALUE has to unquote it the
 * same way or `<!-- _class: "dark" -->` resolves to a token with quotes in it.
 */
function stripQuotes(v) {
  const t = String(v ?? '').trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

/**
 * Parse ONE whole `<!-- … -->` comment.
 *
 * @param {string} raw    the comment INCLUDING its delimiters.
 * @param {object} vocab
 * @param {Set<string>} vocab.known  keys that count as directives at all.
 * @param {Set<string>} [vocab.flags] keys that may be written bare (no `:`).
 * @returns {{spot: boolean, key: string, value: string} | null}
 */
function readDirectiveComment(raw, { known, flags } = {}) {
  const text = String(raw ?? '').trim();
  // O(1) REJECT BEFORE THE REGEX, and it is a fix rather than an optimization.
  // The pattern below pairs a lazy `([\s\S]*?)` with a greedy `\s*` in front of an
  // anchored `-->$`; when that anchor can never match, the two quantifiers split
  // the tail between them every possible way before failing. markdown-it's
  // html_block rule runs an UNTERMINATED `<!--` to the end of the document, so an
  // author controls the whole payload: measured at 21s of engine render for a 4 KB
  // deck, and another 20s in the source-side walk that reads the same comment.
  // Untrusted deck markdown reaches both (the Studio renders shared / AI-generated
  // decks), and this is upstream of `sanitizeSlideHtml`, so HARD RULE #22's
  // DOMPurify boundary does not help — the cost is in the parse, not the sink.
  // Every string the regex could match ends in `-->`, so rejecting the rest first
  // changes no answer.
  if (!text.endsWith('-->') || !text.startsWith('<!--')) return null;
  // Value is optional so a flag-style directive can be written bare —
  // `<!-- _build -->` (≡ `_build:` with an empty value). Only an exact
  // `_?<knownDirective>` with nothing else matches, so prose comments are safe.
  const m = /^<!--\s*(_?)([A-Za-z][\w]*)\s*(?::\s*([\s\S]*?))?\s*-->$/.exec(text);
  if (!m) return null;
  const [, spot, key, value] = m;
  if (!known?.has(key)) return null;
  // Bare (no colon) is only a directive for flag directives (`_build`); otherwise
  // a comment that's just a known-directive word is prose — leave it alone.
  if (value === undefined && !flags?.has(key)) return null;
  return { spot: Boolean(spot), key, value: stripQuotes(value ?? '') };
}

module.exports = { readDirectiveComment, stripQuotes };
