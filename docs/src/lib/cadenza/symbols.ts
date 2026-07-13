// Cadenza — the Speech Symbol Commons.
//
// One canonical symbol → spoken-form resolver, replacing the per-glyph special cases that used
// to live scattered across normalize.ts (the arrow rule) and lexicon.ts (§/¶/& entries). Every
// glyph the commons knows sorts into an ACTION:
//   • SPEAK — an unambiguous word: "×"→"times", "→"→"to", "©"→"copyright".
//   • DROP  — silence: a decorative emoji ("🚀") or a leftward arrow (no clean spoken direction).
//   • (PAUSE — decorative separators "·|•" — stays a WHOLE-TOKEN rule in normalize.ts, because an
//      embedded "·" is a voice id / URL, not a pause; the commons here is the per-GLYPH layer.)
// Everything the commons does NOT list — ambiguous ASCII like "+ − = / # -" and quotes — is left
// for the number/range parsers or the author's own override. A wrong reading is worse than none.
//
// Two override sources, author-first (mirrors the acronym registry): a per-deck `symbols:` map
// (front-matter → the diagnostics drawer) beats the built-in table. See the design ADR
// engineering/decisions/2026-07-13-speech-symbol-commons.md.

/** The deck lexicon: a token (glyph or whole word) → its spoken form ("" forces silence). Applied
 *  by `resolveSymbols` as a per-glyph override, and whole-token in `normalize.ts`. */
export type LexiconMap = ReadonlyMap<string, string>;

/** Built-in SPEAK table — an UNAMBIGUOUS glyph → its spoken word(s). English (gated behind the
 *  deck language like the lexicon, so a non-English deck isn't anglicized — #919). Single code
 *  points; variation selectors are stripped before lookup. Additive — a new glyph is one line. */
export const SYMBOL_SPEAK: Record<string, string> = {
  // Arrows — a transition, not the noun "arrow". Rightward/implication → "to"; bidirectional →
  // "and"; vertical → up/down (metrics register). Leftward is DROP (below) — no clean reading.
  '→': 'to', '⇒': 'to', '⟶': 'to', '➜': 'to', '➡': 'to', '↦': 'to', '⟹': 'to', '⟼': 'to',
  '↔': 'and', '⇔': 'and', '⟷': 'and',
  '↑': 'up', '⬆': 'up', '↓': 'down', '⬇': 'down',
  // Math operators with a single unambiguous reading.
  '×': 'times', '÷': 'divided by', '±': 'plus or minus', '≈': 'approximately',
  '≠': 'not equal to', '≤': 'less than or equal to', '≥': 'greater than or equal to',
  '√': 'square root of', '°': 'degrees', '∞': 'infinity', '∑': 'sum of', 'µ': 'micro',
  // Typographic marks. NOTE: "§" is deliberately NOT here — it begins a structured legal citation
  // ("§1798.140(o)" → "section … subsection o") that normalize.ts's spokenCore parses specially and
  // must own; that parser already reads a bare/leading "§" as "section". The commons is a fallback
  // for glyphs no structured parser claims.
  '¶': 'paragraph', '©': 'copyright', '®': 'registered trademark',
  '™': 'trademark', '&': 'and', '@': 'at',
};

/** Non-emoji glyphs we deliberately SILENCE (no clean spoken form) — leftward arrows. Decorative
 *  emoji are dropped by the pictographic test in `resolveSymbols`, not enumerated here. */
const SYMBOL_DROP = new Set(['←', '⟵', '⇐', '⬅', '↩', '↤']);

/** Decorative-separator glyphs — spoken as a comma PAUSE, but only as a WHOLE token (an embedded
 *  "·" is a voice id / URL). Exported for normalize.ts's whole-token rule so the data lives once. */
export const SEPARATOR_GLYPHS = '·•∙‖¦⁃・|';

// Any Unicode "picture" character (emoji + dingbats) — dropped to silence unless it is an
// explicit SPEAK glyph (the emoji arrows above) or an author override.
const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;
// Variation selectors (U+FE0F etc.) turn a bare glyph into its emoji presentation ("➡"+FE0F="➡️");
// strip them so the base code point matches the SPEAK table.
const VARIATION_SELECTOR = /[\uFE00-\uFE0F]/g;

export interface ResolveSymbolsOptions {
  /** The deck lexicon — checked per glyph before the built-in table, in every language. */
  overrides?: LexiconMap;
  /** Whether the deck is English (default true). Gates the built-in SPEAK table (#919); DROP and
   *  overrides stay active (silence and the author's own vocabulary are language-neutral). */
  english?: boolean;
}

/**
 * Resolve the symbols in one token to their spoken forms. Returns the token with each actionable
 * glyph swapped for ` <word> ` (SPEAK / override) or ` ` (DROP / emoji), for the caller to
 * re-tokenize and normalize — or `null` when the token carries no actionable symbol, so the
 * caller can continue its normal path. Handles standalone ("→"), embedded ("red↔green"), and
 * mixed ("3×4") tokens uniformly. Pure.
 */
export function resolveSymbols(token: string, opts: ResolveSymbolsOptions = {}): string | null {
  const overrides = opts.overrides;
  const english = opts.english !== false;
  const src = String(token ?? '').replace(VARIATION_SELECTOR, '');
  if (!src) return null;

  let changed = false;
  let out = '';
  for (const ch of src) {
    if (overrides?.has(ch)) {
      out += ` ${overrides.get(ch)} `;
      changed = true;
    } else if (english && Object.hasOwn(SYMBOL_SPEAK, ch)) {
      out += ` ${SYMBOL_SPEAK[ch]} `;
      changed = true;
    } else if (SYMBOL_DROP.has(ch) || PICTOGRAPHIC.test(ch)) {
      out += ' ';
      changed = true;
    } else {
      out += ch;
    }
  }
  return changed ? out : null;
}
