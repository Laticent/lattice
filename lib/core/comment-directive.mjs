/**
 * lib/core/comment-directive.mjs
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
 *
 * ESM, with `comment-directive.js` left in place as a CJS re-export so no
 * `require()` call site changes. The format matters because this grammar has two
 * kinds of consumer now: CJS render-path modules, and `class-directive-scan.mjs`,
 * which is ESM precisely so the docs editor can import it as source. A CJS
 * dependency anywhere in that ESM graph is not a style question — Vite/Rollup
 * cannot transform a CommonJS file outside the docs root (`docs/astro.config.mjs`
 * states the rule, and it is why the `*.generated.js` esbuild bundles exist), so
 * an ESM module that imports one fails the docs build with
 * `commentDirective is not defined`. ESM here is the one format both sides read.
 */

/**
 * Strip one layer of matching quotes, the way the engine's directive readers do.
 * Exported because a caller that reads a directive VALUE has to unquote it the
 * same way or `<!-- _class: "dark" -->` resolves to a token with quotes in it.
 */
export function stripQuotes(v) {
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
export function readDirectiveComment(raw, { known, flags } = {}) {
  const text = String(raw ?? '').trim();
  // O(1) REJECT BEFORE THE PARSE, and it is a fix rather than an optimization.
  // markdown-it's html_block rule runs an UNTERMINATED `<!--` to the end of the
  // document, so an author controls the whole payload: the pattern this used to
  // run measured 21s of engine render for a 4 KB deck, and another 20s in the
  // source-side walk that reads the same comment. Untrusted deck markdown reaches
  // both (the Studio renders shared / AI-generated decks), and this is upstream of
  // `sanitizeSlideHtml`, so HARD RULE #22's DOMPurify boundary does not help — the
  // cost is in the parse, not the sink. Every string that can match ends in `-->`,
  // so rejecting the rest first changes no answer.
  if (!text.endsWith('-->') || !text.startsWith('<!--')) return null;
  // SLICE THE DELIMITERS OFF, then match against the inside. The guard above
  // already made the pathological input linear, but it left the regex itself
  // ambiguous — a lazy `([\s\S]*?)` paired with a greedy `\s*` in front of an
  // anchored `-->$`, which splits the tail between the two quantifiers every
  // possible way whenever the anchor cannot match. That is a real quadratic, it is
  // what `js/polynomial-redos` flags, and a guard a static analyzer cannot see is
  // not a fix — it is a fix nobody can verify. Matching the INSIDE removes the
  // anchor the backtracking was searching for: `([\s\S]*)` is greedy to the end of
  // a string that is already bounded, so there is nothing left to split.
  const inner = text.slice(4, -3);
  // Value is optional so a flag-style directive can be written bare —
  // `<!-- _build -->` (≡ `_build:` with an empty value). Only an exact
  // `_?<knownDirective>` with nothing else matches, so prose comments are safe.
  // The value keeps its surrounding whitespace here; `stripQuotes` trims, which is
  // where the old `\s*` before `-->$` used to do it.
  const m = /^\s*(_?)([A-Za-z][\w]*)\s*(?::([\s\S]*))?$/.exec(inner);
  if (!m) return null;
  const [, spot, key, value] = m;
  if (!known?.has(key)) return null;
  // Bare (no colon) is only a directive for flag directives (`_build`); otherwise
  // a comment that's just a known-directive word is prose — leave it alone.
  if (value === undefined && !flags?.has(key)) return null;
  return { spot: Boolean(spot), key, value: stripQuotes(value ?? '') };
}
